import { Op, UniqueConstraintError, fn, col } from "sequelize";
import {
  AccountDocument,
  Expense,
  FuelTicket,
  MaintenanceRecord,
  Supplier,
  sequelize,
} from "../models";
import type { SupplierOrigen } from "../models/Supplier";
import { isValidSatRfc } from "../utils/rfcSat";

function httpError(message: string, status: number): Error {
  const err = new Error(message);
  (err as Error & { status?: number }).status = status;
  return err;
}

/** Normaliza RFC. En alta es obligatorio; en edición, vacío se guarda como null. */
export function parseSupplierRfc(
  raw: string | null | undefined,
  required: boolean,
): string | null {
  const trimmed = raw?.trim().toUpperCase() ?? "";
  if (!trimmed) {
    if (required) throw httpError("El RFC es obligatorio", 400);
    return null;
  }
  if (!isValidSatRfc(trimmed)) {
    throw httpError("El RFC no cumple el formato SAT", 400);
  }
  return trimmed;
}

export async function assertSupplierRfcAvailable(
  tenantId: string,
  rfc: string,
  excludeId?: string,
): Promise<void> {
  const existing = await Supplier.findOne({
    where: {
      tenant_id: tenantId,
      rfc,
      ...(excludeId ? { id: { [Op.ne]: excludeId } } : {}),
    },
  });
  if (existing) throw httpError("Ya existe un proveedor con ese RFC", 409);
}

export function rfcConflictMessage(err: unknown): string | null {
  if (err instanceof UniqueConstraintError) return "Ya existe un proveedor con ese RFC";
  return null;
}

export type AutoSupplierReview = {
  id: string;
  razon_social: string;
  estatus: "activo" | "inactivo";
  origen: SupplierOrigen;
  tickets: number;
  cxp_combustible: number;
  otros: number;
};

async function countBySupplier(
  model: { findAll: (opts: never) => Promise<unknown[]> },
  tenantId: string,
  ids: string[],
  extra: Record<string, unknown> = {},
): Promise<Map<string, number>> {
  const rows = (await model.findAll({
    attributes: ["supplier_id", [fn("COUNT", col("id")), "n"]],
    where: { tenant_id: tenantId, supplier_id: { [Op.in]: ids }, ...extra },
    group: ["supplier_id"],
    raw: true,
  } as never)) as { supplier_id: string; n: string | number }[];
  return new Map(rows.map((r) => [r.supplier_id, Number(r.n)]));
}

export async function listAutoSuppliersForCleanup(tenantId: string): Promise<AutoSupplierReview[]> {
  const rows = await Supplier.findAll({
    where: {
      tenant_id: tenantId,
      origen: "auto",
      estatus: "activo",
      [Op.or]: [{ rfc: null }, { rfc: "" }],
    },
    order: [["razon_social", "ASC"]],
  });
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const [tickets, fuelDocs, otherDocs, maint, expenses] = await Promise.all([
    countBySupplier(FuelTicket, tenantId, ids),
    countBySupplier(AccountDocument, tenantId, ids, { origen: "combustible" }),
    countBySupplier(AccountDocument, tenantId, ids, { origen: { [Op.ne]: "combustible" } }),
    countBySupplier(MaintenanceRecord, tenantId, ids),
    countBySupplier(Expense, tenantId, ids),
  ]);
  return rows.map((s) => ({
    id: s.id,
    razon_social: s.razon_social,
    estatus: s.estatus ?? "activo",
    origen: s.origen ?? "auto",
    tickets: tickets.get(s.id) ?? 0,
    cxp_combustible: fuelDocs.get(s.id) ?? 0,
    otros: (otherDocs.get(s.id) ?? 0) + (maint.get(s.id) ?? 0) + (expenses.get(s.id) ?? 0),
  }));
}

async function autoSupplierOrThrow(tenantId: string, id: string) {
  const s = await Supplier.findOne({ where: { id, tenant_id: tenantId } });
  if (!s) throw httpError("Proveedor no encontrado", 404);
  if (s.origen !== "auto" || (s.rfc && s.rfc.trim())) {
    throw httpError("Solo se pueden limpiar proveedores generados automáticamente y sin RFC", 400);
  }
  return s;
}

/** Quita el enlace de combustible y, si no queda otro uso, inactiva el proveedor. */
export async function detachFuelFromAutoSupplier(
  tenantId: string,
  id: string,
): Promise<{ inactivated: boolean; tickets: number; documentos: number }> {
  const source = await autoSupplierOrThrow(tenantId, id);
  return sequelize.transaction(async (t) => {
    const [tickets] = await FuelTicket.update(
      { supplier_id: null } as never,
      { where: { tenant_id: tenantId, supplier_id: source.id }, transaction: t },
    );
    const [documentos] = await AccountDocument.update(
      { supplier_id: null } as never,
      {
        where: { tenant_id: tenantId, supplier_id: source.id, origen: "combustible" },
        transaction: t,
      },
    );
    const [maint, expenses, otherDocs] = await Promise.all([
      MaintenanceRecord.count({
        where: { tenant_id: tenantId, supplier_id: source.id },
        transaction: t,
      }),
      Expense.count({ where: { tenant_id: tenantId, supplier_id: source.id }, transaction: t }),
      AccountDocument.count({
        where: {
          tenant_id: tenantId,
          supplier_id: source.id,
          origen: { [Op.ne]: "combustible" },
        },
        transaction: t,
      }),
    ]);
    const inactivated = maint === 0 && expenses === 0 && otherDocs === 0;
    if (inactivated) {
      await source.update({ estatus: "inactivo" } as never, { transaction: t });
    }
    return { inactivated, tickets, documentos };
  });
}

/** Pasa vínculos al proveedor de catálogo y deja el automático inactivo. */
export async function mergeAutoSupplier(
  tenantId: string,
  sourceId: string,
  targetId: string,
): Promise<{ razon_social: string }> {
  if (sourceId === targetId) throw httpError("Elige un proveedor distinto", 400);
  const source = await autoSupplierOrThrow(tenantId, sourceId);
  const target = await Supplier.findOne({ where: { id: targetId, tenant_id: tenantId } });
  if (!target || target.origen !== "manual") {
    throw httpError("El destino debe ser un proveedor del catálogo", 400);
  }
  await sequelize.transaction(async (t) => {
    const where = { tenant_id: tenantId, supplier_id: source.id };
    await FuelTicket.update({ supplier_id: target.id } as never, { where, transaction: t });
    await MaintenanceRecord.update({ supplier_id: target.id } as never, { where, transaction: t });
    await Expense.update({ supplier_id: target.id } as never, { where, transaction: t });
    await AccountDocument.update(
      { supplier_id: target.id, entidad_nombre: target.razon_social } as never,
      { where, transaction: t },
    );
    await source.update({ estatus: "inactivo" } as never, { transaction: t });
  });
  return { razon_social: target.razon_social };
}
