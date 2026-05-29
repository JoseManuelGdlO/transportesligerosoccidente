import { randomUUID } from "node:crypto";
import { Op } from "sequelize";
import { Notification, Tenant } from "../models";
import { usersWithPermission } from "../utils/notifyUsers";
import type { Tenant as TenantModel } from "../models/Tenant";
import type { FuelImportResult } from "./fuelImportService";
import { importFuelTicketsFromBuffer } from "./fuelImportService";
import { createFuelProvider, resolveFuelCredentials, tenantFuelSyncEnabled } from "./fuelProvider";
import { prorateRangeAll } from "./fuelProrationService";
import { addDaysToDateStr, localDateStr, localMonthStartStr } from "../utils/localDates";

export type FuelSyncResult = {
  tenant_id: string;
  tenant_nombre: string;
  inicio: string;
  fin: string;
  status: "ok" | "error" | "skipped";
  import?: FuelImportResult;
  unidades_con_tickets?: number;
  error?: string;
};

export function logFuelSyncResult(r: FuelSyncResult): void {
  const tag = `[fuel-sync] tenant=${r.tenant_id} "${r.tenant_nombre}"`;
  if (r.status === "ok") {
    const imp = r.import;
    console.log(
      `${tag} ok rango=${r.inicio}..${r.fin} creados=${imp?.creados ?? 0} duplicados=${imp?.duplicados ?? 0} errores_fila=${imp?.errores.length ?? 0} unidades=${r.unidades_con_tickets ?? 0}`,
    );
    return;
  }
  if (r.status === "error") {
    console.log(`${tag} error rango=${r.inicio}..${r.fin} msg=${r.error ?? "desconocido"}`);
    return;
  }
  console.log(`${tag} skipped rango=${r.inicio}..${r.fin} motivo=${r.error ?? "sin detalle"}`);
}

export function defaultSyncDateRange(): { inicio: string; fin: string } {
  const fin = localDateStr();
  const lookback = Math.max(1, Number(process.env.FUEL_SYNC_LOOKBACK_DAYS || "35"));
  const fromLookback = addDaysToDateStr(fin, -lookback);
  const monthStart = localMonthStartStr();
  const inicio = fromLookback < monthStart ? fromLookback : monthStart;
  return { inicio, fin };
}

async function notifyFuelSync(
  tenantId: string,
  ok: boolean,
  title: string,
  body: string,
): Promise<void> {
  const alertDate = localDateStr();
  const tipo = ok ? "combustible.sync_ok" : "combustible.sync_error";
  const users = await usersWithPermission(tenantId, "combustibles.ver");

  for (const u of users) {
    const dup = await Notification.findOne({
      where: { user_id: u.id, alert_date: alertDate, tipo },
    });
    if (dup) continue;

    try {
      await Notification.create({
        id: randomUUID(),
        tenant_id: tenantId,
        user_id: u.id,
        tipo,
        document_id: null,
        alert_date: alertDate,
        leida: false,
        payload: { title, body, url: "/combustibles" },
      });
    } catch (e: unknown) {
      const name = e && typeof e === "object" && "name" in e ? (e as { name: string }).name : "";
      if (name !== "SequelizeUniqueConstraintError") throw e;
    }
  }
}

export async function runFuelSyncForTenant(
  tenant: TenantModel,
  range?: { inicio: string; fin: string },
  options?: { force?: boolean },
): Promise<FuelSyncResult> {
  const { inicio, fin } = range ?? defaultSyncDateRange();
  const base: FuelSyncResult = {
    tenant_id: String(tenant.id),
    tenant_nombre: tenant.nombre,
    inicio,
    fin,
    status: "skipped",
  };

  if (!options?.force && !tenantFuelSyncEnabled(tenant)) {
    return { ...base, error: "Sincronización automática deshabilitada para esta empresa" };
  }

  const creds = resolveFuelCredentials(tenant);
  if (!creds) {
    return { ...base, error: "Sin URL del proveedor de combustible configurada" };
  }

  try {
    console.log(`[fuel-sync] tenant=${tenant.id} "${tenant.nombre}" descargando ${inicio}..${fin}`);
    const provider = createFuelProvider(creds);
    const buffer = await provider.downloadReport({ inicio, fin });
    console.log(`[fuel-sync] tenant=${tenant.id} descarga ok bytes=${buffer.length}`);
    const importResult = await importFuelTicketsFromBuffer(String(tenant.id), buffer, "api");
    const proration = await prorateRangeAll(String(tenant.id), inicio, fin);

    const errCount = importResult.errores.length;
    const title = "Combustibles sincronizados";
    const body = `${importResult.creados} ticket(s) nuevos, ${importResult.duplicados} duplicado(s), ${proration.unidades.length} unidad(es) con prorrateo.${errCount > 0 ? ` ${errCount} fila(s) con error.` : ""}`;

    await notifyFuelSync(String(tenant.id), true, title, body);

    const result: FuelSyncResult = {
      ...base,
      status: "ok",
      import: importResult,
      unidades_con_tickets: proration.unidades.length,
    };
    logFuelSyncResult(result);
    return result;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error desconocido al sincronizar combustible";
    console.error(`[fuel-sync] tenant=${tenant.id}`, e);
    await notifyFuelSync(
      String(tenant.id),
      false,
      "Falló sincronización de combustibles",
      `${msg}. Puede importar el Excel manualmente en Combustibles.`,
    );
    const result: FuelSyncResult = { ...base, status: "error", error: msg };
    logFuelSyncResult(result);
    return result;
  }
}

export async function runFuelSyncAll(
  range?: { inicio: string; fin: string },
): Promise<FuelSyncResult[]> {
  const { inicio, fin } = range ?? defaultSyncDateRange();
  const tenants = await Tenant.findAll({
    where: { estatus: "activo", fuel_sync_habilitado: { [Op.eq]: true } },
  });

  const withGlobal = await Tenant.findAll({ where: { estatus: "activo" } });
  const toRun = new Map<string, TenantModel>();
  for (const t of tenants) toRun.set(String(t.id), t);
  if (process.env.FUEL_SYNC_ENABLED === "true") {
    for (const t of withGlobal) {
      if (resolveFuelCredentials(t)) toRun.set(String(t.id), t);
    }
  }

  console.log(
    `[fuel-sync] inicio sync rango=${inicio}..${fin} empresas=${toRun.size} (FUEL_SYNC_ENABLED=${process.env.FUEL_SYNC_ENABLED === "true"})`,
  );

  if (toRun.size === 0) {
    console.log(
      "[fuel-sync] sin empresas que sincronizar (activa FUEL_SYNC_ENABLED + credenciales, o fuel_sync_habilitado por tenant)",
    );
    return [];
  }

  const results: FuelSyncResult[] = [];
  for (const tenant of toRun.values()) {
    const r = await runFuelSyncForTenant(tenant, range);
    if (r.status === "skipped") logFuelSyncResult(r);
    results.push(r);
  }

  const ok = results.filter((r) => r.status === "ok").length;
  const err = results.filter((r) => r.status === "error").length;
  const skipped = results.filter((r) => r.status === "skipped").length;
  console.log(`[fuel-sync] fin sync ok=${ok} error=${err} skipped=${skipped} total=${results.length}`);

  return results;
}
