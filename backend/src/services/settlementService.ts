import { randomUUID } from "node:crypto";
import { Op, type Transaction } from "sequelize";
import {
  sequelize,
  Driver,
  Trip,
  Settlement,
  Truck,
  DriverAdvance,
  DriverDiscount,
  DriverCompensation,
  DriverExtraViatico,
} from "../models";
import {
  computeSettlementTotals,
  filterEligibleSettlementTrips,
  computeNetoPagar,
  roundMoney,
} from "./calc";
import {
  loadActiveAccountItemBalances,
  computeAccountApplicationsForNeto,
  applySettlementAccountInstallments,
  revertSettlementAccountInstallments,
  createSettlementCarryoverItem,
  revertSettlementCarryoverItem,
} from "./driverAccountService";
import { applyExtraViaticosToTotals, resolveSnapshotNetoCarryover, sumExtraViaticos } from "./extraViaticos";
import { tripToJson } from "../utils/serialize";
import { num } from "../utils/numbers";
import { addDaysToDateStr } from "../utils/localDates";
import {
  conceptsFromSnapshot,
  predominantUnitType,
  type WeekExportFuente,
  type WeekExportOmitido,
  type WeekExportRow,
} from "./weekSummaryWorkbook";

export type TripInclusion = { id: string; included: boolean };

/** Monto de flete que solo vive en la liquidación. No se escribe en el viaje. */
export type SettlementFlete = { id: string; monto: number };

function fechaEnPeriodo(fecha: string, inicioStr: string, finStr: string): boolean {
  return fecha >= inicioStr && fecha <= finStr;
}

function inclusionMapFromList(
  eligibleIds: string[],
  tripInclusions?: TripInclusion[],
): Map<string, boolean> {
  const map = new Map<string, boolean>(eligibleIds.map((id) => [id, true]));
  if (tripInclusions === undefined) return map;
  for (const row of tripInclusions) {
    if (map.has(row.id)) map.set(row.id, row.included);
  }
  return map;
}

function inclusionMapFromSnapshot(snapshot: Record<string, unknown> | null | undefined): Map<string, boolean> | null {
  if (!snapshot || !Array.isArray(snapshot.trips)) return null;
  const map = new Map<string, boolean>();
  for (const t of snapshot.trips as { id?: string; included?: boolean }[]) {
    if (t.id) map.set(t.id, t.included !== false);
  }
  return map.size > 0 ? map : null;
}

function tripInclusionsFromMap(map: Map<string, boolean>): TripInclusion[] {
  return [...map.entries()].map(([id, included]) => ({ id, included }));
}

function fleteMapFromList(rows?: SettlementFlete[]): Map<string, number> {
  const map = new Map<string, number>();
  if (!rows) return map;
  for (const row of rows) {
    if (!row.id) continue;
    const monto = roundMoney(num(row.monto));
    if (!Number.isFinite(monto) || monto < 0) continue;
    map.set(row.id, monto);
  }
  return map;
}

function fleteListFromSnapshot(snapshot: Record<string, unknown> | null | undefined): SettlementFlete[] {
  if (!snapshot || !Array.isArray(snapshot.trips)) return [];
  const rows: SettlementFlete[] = [];
  for (const trip of snapshot.trips as { id?: string; flete_liquidacion?: unknown }[]) {
    if (!trip.id || trip.flete_liquidacion == null || trip.flete_liquidacion === "") continue;
    const monto = roundMoney(num(trip.flete_liquidacion));
    if (!Number.isFinite(monto) || monto < 0) continue;
    rows.push({ id: trip.id, monto });
  }
  return rows;
}

async function pendingAdvancesDiscountsAndCompensations(
  tenantId: string,
  driverId: string,
  inicioStr: string,
  finStr: string,
) {
  const [allAdvances, allDiscounts, allCompensations, allExtraViaticos] = await Promise.all([
    DriverAdvance.findAll({
      where: { tenant_id: tenantId, driver_id: driverId, settlement_id: null },
      order: [["fecha", "DESC"]],
    }),
    DriverDiscount.findAll({
      where: { tenant_id: tenantId, driver_id: driverId, settlement_id: null },
      order: [["fecha", "DESC"]],
    }),
    DriverCompensation.findAll({
      where: { tenant_id: tenantId, driver_id: driverId, settlement_id: null },
      order: [["fecha", "DESC"]],
    }),
    DriverExtraViatico.findAll({
      where: { tenant_id: tenantId, driver_id: driverId, settlement_id: null },
      order: [["fecha", "DESC"]],
    }),
  ]);
  const extraViaticosInPeriod = allExtraViaticos.filter((r) =>
    fechaEnPeriodo(String(r.fecha), inicioStr, finStr),
  );
  const advancesInPeriod = allAdvances.filter((r) => fechaEnPeriodo(String(r.fecha), inicioStr, finStr));
  const discountsInPeriod = allDiscounts.filter((r) => fechaEnPeriodo(String(r.fecha), inicioStr, finStr));
  const compensationsInPeriod = allCompensations.filter((r) =>
    fechaEnPeriodo(String(r.fecha), inicioStr, finStr),
  );
  const total_anticipos = advancesInPeriod.reduce((a, r) => a + num(r.monto), 0);
  const total_descuentos = discountsInPeriod.reduce((a, r) => a + num(r.monto), 0);
  const total_compensaciones = compensationsInPeriod.reduce((a, r) => a + num(r.monto), 0);
  return {
    advances: allAdvances,
    discounts: allDiscounts,
    compensations: allCompensations,
    extraViaticos: allExtraViaticos,
    extraViaticosInPeriod,
    advancesInPeriod,
    discountsInPeriod,
    compensationsInPeriod,
    total_anticipos,
    total_descuentos,
    total_compensaciones,
  };
}

export async function settlementSummary(
  tenantId: string,
  driverId: string,
  inicioStr: string,
  finStr: string,
  tripInclusions?: TripInclusion[],
  fleteLiquidacion?: SettlementFlete[],
): Promise<Record<string, unknown>> {
  const driver = await Driver.findOne({ where: { id: driverId, tenant_id: tenantId } });
  if (!driver) {
    const err = new Error("Operador no encontrado");
    (err as Error & { status?: number }).status = 404;
    throw err;
  }
  const inicio = new Date(`${inicioStr}T00:00:00`);
  const fin = new Date(`${finStr}T23:59:59`);
  const trips = await Trip.findAll({
    where: { tenant_id: tenantId, driver_id: driverId, settlement_id: null },
    include: [
      { association: "fuel" },
      { association: "expenses" },
      { association: "Client", attributes: ["id", "razon_social"] },
      { association: "Driver", attributes: ["id", "nombre"], required: false },
      { association: "paradas" },
      { association: "Route", attributes: ["id", "nombre"], required: false },
    ],
  });
  const {
    advances,
    discounts,
    compensations,
    extraViaticos,
    extraViaticosInPeriod,
    total_anticipos,
    total_descuentos,
    total_compensaciones,
  } = await pendingAdvancesDiscountsAndCompensations(tenantId, driverId, inicioStr, finStr);

  const eligible = filterEligibleSettlementTrips(driver, trips, inicio, fin);
  const inclusionMap = inclusionMapFromList(
    eligible.map((e) => String(e.trip.id)),
    tripInclusions,
  );
  const fleteMap = fleteMapFromList(fleteLiquidacion);
  const includedTrips = eligible
    .filter((e) => inclusionMap.get(String(e.trip.id)) !== false)
    .map((e) => e.trip);

  const tripTotals = computeSettlementTotals(driver, includedTrips, {
    total_anticipos,
    total_descuentos,
    total_compensaciones,
    total_cuenta_abonos: 0,
  });
  // Solo los extras dentro del periodo suman; los demás se listan con en_periodo=false.
  const viaticosMerged = applyExtraViaticosToTotals(
    {
      viaticos_entregados: tripTotals.viaticos_entregados,
      viaticos_comprobados: tripTotals.viaticos_comprobados,
    },
    extraViaticosInPeriod.map((r) => ({
      monto_entregado: num(r.monto_entregado),
      monto_comprobado: num(r.monto_comprobado),
    })),
  );
  const baseTotals = { ...tripTotals, ...viaticosMerged };
  const netoBase = computeNetoPagar({
    total_comisiones: baseTotals.total_comisiones,
    saldo_viaticos: baseTotals.saldo_viaticos,
    total_compensaciones,
    total_descuentos,
    total_anticipos,
    total_cuenta_abonos: 0,
  });

  const { items: accountItems } = await loadActiveAccountItemBalances(tenantId, driverId);
  const accountPreview = computeAccountApplicationsForNeto(netoBase, accountItems);

  return {
    driver: {
      id: driver.id,
      nombre: driver.nombre,
      comision_tipo: driver.comision_tipo,
      comision_valor_local: Number(driver.comision_valor_local ?? driver.comision_valor),
      comision_valor_foraneo: Number(driver.comision_valor_foraneo ?? driver.comision_valor),
      estatus: driver.estatus,
    },
    periodo: { inicio: inicioStr, fin: finStr },
    ...baseTotals,
    total_cuenta_abonos: accountPreview.total_cuenta_abonos,
    neto_pagar: accountPreview.neto_pagar,
    pendiente_arrastrado: roundMoney(Math.max(0, -accountPreview.neto_pagar)),
    account_items: accountItems,
    account_applications: accountPreview.applications,
    advances: advances.map((a) => ({
      id: a.id,
      monto: num(a.monto),
      fecha: String(a.fecha).slice(0, 10),
      descripcion: a.descripcion,
      en_periodo: fechaEnPeriodo(String(a.fecha), inicioStr, finStr),
    })),
    discounts: discounts.map((d) => ({
      id: d.id,
      tipo: d.tipo,
      monto: num(d.monto),
      fecha: String(d.fecha).slice(0, 10),
      descripcion: d.descripcion,
      en_periodo: fechaEnPeriodo(String(d.fecha), inicioStr, finStr),
    })),
    compensations: compensations.map((c) => ({
      id: c.id,
      tipo: c.tipo,
      monto: num(c.monto),
      fecha: String(c.fecha).slice(0, 10),
      descripcion: c.descripcion,
      en_periodo: fechaEnPeriodo(String(c.fecha), inicioStr, finStr),
    })),
    extra_viaticos: extraViaticos.map((r) => ({
      id: r.id,
      fecha: String(r.fecha).slice(0, 10),
      descripcion: r.descripcion,
      monto_entregado: num(r.monto_entregado),
      monto_comprobado: num(r.monto_comprobado),
      en_periodo: fechaEnPeriodo(String(r.fecha), inicioStr, finStr),
    })),
    trips: eligible.map(({ trip, en_periodo }) => {
      const id = String(trip.id);
      const flete = fleteMap.get(id);
      return {
        ...tripToJson(trip),
        en_periodo,
        included: inclusionMap.get(id) !== false,
        ...(flete !== undefined ? { flete_liquidacion: flete } : {}),
      };
    }),
  };
}

export type WeekSettlementEstado = "abierta" | "preliquidacion" | "cerrada";

export type WeekSettlementRow = {
  driver_id: string;
  driver_nombre: string;
  viajes: number;
  /** Km recorridos de los viajes incluidos en la liquidación. */
  km: number;
  facturacion: number;
  comisiones: number;
  neto_pagar: number;
  estado: WeekSettlementEstado;
  settlement_id: string | null;
  /** Monto de un cierre de otra semana. No entra al pago de la semana que se está viendo. */
  liquidada_otra_semana: { inicio: string; fin: string } | null;
};

function countIncludedTrips(trips: unknown): number {
  if (!Array.isArray(trips)) return 0;
  return trips.filter((t) => (t as { included?: boolean }).included !== false).length;
}

function kmOfSnapshotTrip(raw: unknown): number | null {
  if (!raw || typeof raw !== "object") return null;
  const trip = raw as { km_inicial?: unknown; km_final?: unknown };
  if (trip.km_final == null || trip.km_inicial == null) return null;
  const fin = Number(trip.km_final);
  const ini = Number(trip.km_inicial);
  if (!Number.isFinite(fin) || !Number.isFinite(ini)) return null;
  return Math.max(0, fin - ini);
}

/** Km de viajes incluidos. Si el snapshot no guardó odómetro, usa total_km. */
function includedKmFromSnapshot(snapshot: Record<string, unknown>): number {
  const trips = snapshot.trips;
  if (!Array.isArray(trips)) return num(snapshot.total_km);
  let sawKm = false;
  let sum = 0;
  for (const raw of trips) {
    if ((raw as { included?: boolean }).included === false) continue;
    const km = kmOfSnapshotTrip(raw);
    if (km == null) continue;
    sawKm = true;
    sum += km;
  }
  return sawKm ? sum : num(snapshot.total_km);
}

function weekRowFromSnapshot(
  driver: { id: string; nombre: string },
  settlementId: string,
  snapshot: Record<string, unknown>,
  estado: Extract<WeekSettlementEstado, "cerrada" | "preliquidacion">,
): WeekSettlementRow {
  return {
    driver_id: driver.id,
    driver_nombre: driver.nombre,
    viajes: countIncludedTrips(snapshot.trips),
    km: includedKmFromSnapshot(snapshot),
    facturacion: roundMoney(num(snapshot.total_ingresos)),
    comisiones: roundMoney(num(snapshot.total_comisiones)),
    neto_pagar: roundMoney(num(snapshot.neto_pagar)),
    estado,
    settlement_id: settlementId,
    liquidada_otra_semana: null,
  };
}

function dateOnly(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function isThisWeekPeriod(inicio: string, fin: string, inicioStr: string, finStr: string): boolean {
  return inicio === inicioStr && (fin === finStr || fin === addDaysToDateStr(finStr, 1));
}

/** Cierre más reciente de otra semana, por operador. */
function priorClosedByDriver(
  rows: Settlement[],
  inicioStr: string,
  finStr: string,
): Map<string, Settlement> {
  const map = new Map<string, Settlement>();
  for (const row of rows) {
    if (!row.cerrado || !row.snapshot || map.has(row.driver_id)) continue;
    const inicio = dateOnly(row.fecha_inicio);
    const fin = dateOnly(row.fecha_fin);
    if (isThisWeekPeriod(inicio, fin, inicioStr, finStr)) continue;
    map.set(row.driver_id, row);
  }
  return map;
}

/** Si hay cierre o borrador con el fin exacto, ese manda. Si no, el domingo guardado como lunes. */
function settlementsForWeekEnd(list: Settlement[], finStr: string): Settlement[] {
  const exact = list.filter((s) => dateOnly(s.fecha_fin) === finStr);
  return exact.length > 0 ? exact : list;
}

/**
 * Resumen de lo que se pagará al cerrar la semana, por operador activo.
 * Cerrada → snapshot del cierre. Preliquidación con snapshot → snapshot del borrador.
 * Abierta, o preliquidación sin snapshot → cálculo en vivo.
 * Los totales suman a todos. La pantalla puede dejar a alguien fuera.
 * Un cierre guardado con el domingo corrido al lunes cuenta para esa semana.
 */
export async function weekSettlementSummary(
  tenantId: string,
  inicioStr: string,
  finStr: string,
): Promise<{
  periodo: { inicio: string; fin: string };
  totales: {
    facturacion: number;
    neto_pagar: number;
    operadores: number;
    cerradas: number;
    viajes: number;
  };
  rows: WeekSettlementRow[];
}> {
  const drivers = await Driver.findAll({
    where: { tenant_id: tenantId, estatus: "activo" },
    order: [["nombre", "ASC"]],
  });

  const settlements = await Settlement.findAll({
    where: {
      tenant_id: tenantId,
      fecha_inicio: inicioStr,
      fecha_fin: { [Op.in]: [finStr, addDaysToDateStr(finStr, 1)] },
    },
  });

  const byDriver = new Map<string, Settlement[]>();
  for (const s of settlements) {
    const list = byDriver.get(s.driver_id) ?? [];
    list.push(s);
    byDriver.set(s.driver_id, list);
  }

  const priorClosed = priorClosedByDriver(
    await Settlement.findAll({
      where: { tenant_id: tenantId, cerrado: true },
      order: [
        ["fecha_fin", "DESC"],
        ["fecha_inicio", "DESC"],
      ],
    }),
    inicioStr,
    finStr,
  );

  const rows: WeekSettlementRow[] = [];
  for (const driver of drivers) {
    const list = settlementsForWeekEnd(byDriver.get(driver.id) ?? [], finStr);
    const closed = list.find((s) => s.cerrado);
    const draft = list.find((s) => !s.cerrado);

    if (closed?.snapshot) {
      rows.push(weekRowFromSnapshot(driver, closed.id, closed.snapshot, "cerrada"));
      continue;
    }

    if (draft?.snapshot) {
      rows.push(weekRowFromSnapshot(driver, draft.id, draft.snapshot, "preliquidacion"));
      continue;
    }

    const summary = await settlementSummary(tenantId, driver.id, inicioStr, finStr);
    const viajes = countIncludedTrips(summary.trips);
    const prior = viajes === 0 && !draft ? priorClosed.get(driver.id) : undefined;
    if (prior?.snapshot) {
      rows.push({
        ...weekRowFromSnapshot(driver, prior.id, prior.snapshot, "cerrada"),
        estado: "abierta",
        settlement_id: null,
        liquidada_otra_semana: {
          inicio: dateOnly(prior.fecha_inicio),
          fin: dateOnly(prior.fecha_fin),
        },
      });
      continue;
    }

    rows.push({
      driver_id: driver.id,
      driver_nombre: driver.nombre,
      viajes,
      km: num(summary.total_km),
      facturacion: roundMoney(num(summary.total_ingresos)),
      comisiones: roundMoney(num(summary.total_comisiones)),
      neto_pagar: roundMoney(num(summary.neto_pagar)),
      estado: draft ? "preliquidacion" : "abierta",
      settlement_id: draft?.id ?? null,
      liquidada_otra_semana: null,
    });
  }

  const payable = rows.filter((r) => !r.liquidada_otra_semana);
  return {
    periodo: { inicio: inicioStr, fin: finStr },
    totales: {
      facturacion: roundMoney(payable.reduce((a, r) => a + r.facturacion, 0)),
      neto_pagar: roundMoney(payable.reduce((a, r) => a + r.neto_pagar, 0)),
      operadores: payable.length,
      cerradas: payable.filter((r) => r.estado === "cerrada").length,
      viajes: payable.reduce((a, r) => a + r.viajes, 0),
    },
    rows,
  };
}

const SIN_PRELIQUIDACION =
  "No tienen preliquidación guardada y sus viajes ya están en una liquidación. No se usó el cierre para no mezclar fuentes.";

function snapshotRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/**
 * Filas del Excel de resumen.
 * Liquidación usa el cierre; si no hay, el cálculo en vivo (no el borrador).
 * Preliquidación usa el borrador; si el operador ya está cerrado y no hay borrador, se omite.
 */
export async function weekSettlementExportRows(
  tenantId: string,
  inicioStr: string,
  finStr: string,
  fuente: WeekExportFuente,
  driverIds: string[],
): Promise<{ rows: WeekExportRow[]; omitidos: WeekExportOmitido[] }> {
  const wanted = [...new Set(driverIds)];
  const drivers = await Driver.findAll({
    where: { tenant_id: tenantId, id: { [Op.in]: wanted } },
    order: [["nombre", "ASC"]],
  });
  const trucks = await Truck.findAll({
    where: { tenant_id: tenantId },
    attributes: ["id", "modelo"],
  });
  const trucksById = new Map(trucks.map((truck) => [String(truck.id), truck.modelo ?? ""]));

  const settlements = await Settlement.findAll({
    where: {
      tenant_id: tenantId,
      fecha_inicio: inicioStr,
      fecha_fin: { [Op.in]: [finStr, addDaysToDateStr(finStr, 1)] },
      driver_id: { [Op.in]: wanted },
    },
  });
  const byDriver = new Map<string, Settlement[]>();
  for (const settlement of settlements) {
    const list = byDriver.get(settlement.driver_id) ?? [];
    list.push(settlement);
    byDriver.set(settlement.driver_id, list);
  }

  const rows: WeekExportRow[] = [];
  const omitidos: WeekExportOmitido[] = [];
  for (const driver of drivers) {
    const list = settlementsForWeekEnd(byDriver.get(driver.id) ?? [], finStr);
    const closed = list.find((settlement) => settlement.cerrado);
    const draft = list.find((settlement) => !settlement.cerrado);
    const closedSnapshot = snapshotRecord(closed?.snapshot);
    const draftSnapshot = snapshotRecord(draft?.snapshot);

    let snapshot: Record<string, unknown> | null = null;
    let origen: WeekExportRow["origen"] = "vivo";
    if (fuente === "liquidacion") {
      if (closedSnapshot) {
        snapshot = closedSnapshot;
        origen = "liquidacion";
      }
    } else if (draftSnapshot) {
      snapshot = draftSnapshot;
      origen = "preliquidacion";
    } else if (closedSnapshot) {
      omitidos.push({ driver_nombre: driver.nombre, motivo: SIN_PRELIQUIDACION });
      continue;
    }

    if (!snapshot) {
      snapshot = await settlementSummary(tenantId, driver.id, inicioStr, finStr);
      origen = "vivo";
    }

    const fromTrips = predominantUnitType(snapshot.trips, trucksById);
    const assigned = driver.truck_id ? (trucksById.get(String(driver.truck_id)) ?? "").trim().toUpperCase() : "";
    rows.push({
      driver_nombre: driver.nombre,
      origen,
      concepts: conceptsFromSnapshot(snapshot, fromTrips || assigned),
    });
  }

  return { rows, omitidos };
}

export async function listSettlements(tenantId: string, driverId?: string) {
  const where: Record<string, unknown> = { tenant_id: tenantId };
  if (driverId) where.driver_id = driverId;
  const rows = await Settlement.findAll({
    where,
    order: [["fecha_inicio", "DESC"]],
    include: [{ model: Driver, attributes: ["id", "nombre"] }],
  });
  await enrichSettlementSnapshotsWithRoutes(tenantId, rows);
  return rows;
}

/**
 * Completa ruta y cliente en snapshots antiguos (guardados sin Route/paradas/Client)
 * para que PDF e histórico muestren la misma información que Viajes.
 */
async function enrichSettlementSnapshotsWithRoutes(tenantId: string, settlements: Settlement[]) {
  const tripIds = new Set<string>();
  for (const row of settlements) {
    const snap = row.snapshot as { trips?: { id?: string }[] } | null | undefined;
    if (!snap?.trips) continue;
    for (const t of snap.trips) {
      if (t?.id) tripIds.add(String(t.id));
    }
  }
  if (tripIds.size === 0) return;

  const trips = await Trip.findAll({
    where: { tenant_id: tenantId, id: { [Op.in]: [...tripIds] } },
    include: [
      { association: "paradas" },
      { association: "Route", attributes: ["id", "nombre"], required: false },
      { association: "Client", attributes: ["id", "razon_social"], required: false },
    ],
  });
  const byId = new Map(trips.map((t) => [String(t.id), tripToJson(t)]));

  for (const row of settlements) {
    const snap = row.snapshot as Record<string, unknown> | null | undefined;
    if (!snap || !Array.isArray(snap.trips)) continue;
    let changed = false;
    const nextTrips = (snap.trips as Record<string, unknown>[]).map((st) => {
      const live = byId.get(String(st.id));
      if (!live) return st;
      changed = true;
      return {
        ...st,
        route_nombre: live.route_nombre ?? st.route_nombre,
        ruta_resumen: live.ruta_resumen ?? st.ruta_resumen,
        paradas: live.paradas ?? st.paradas,
        origen: live.origen ?? st.origen,
        destino: live.destino ?? st.destino,
        client_id: live.client_id ?? st.client_id,
        client_nombre: live.client_nombre ?? st.client_nombre,
      };
    });
    if (changed) {
      row.setDataValue("snapshot", { ...snap, trips: nextTrips });
    }
  }
}

async function findOpenDraft(
  tenantId: string,
  driverId: string,
  fechaInicio: string,
  fechaFin: string,
) {
  return Settlement.findOne({
    where: {
      tenant_id: tenantId,
      driver_id: driverId,
      fecha_inicio: fechaInicio,
      fecha_fin: fechaFin,
      cerrado: false,
    },
  });
}

export async function createDraftSettlement(
  tenantId: string,
  driverId: string,
  fechaInicio: string,
  fechaFin: string,
  tripInclusions?: TripInclusion[],
  fleteLiquidacion?: SettlementFlete[],
) {
  const summary = await settlementSummary(
    tenantId,
    driverId,
    fechaInicio,
    fechaFin,
    tripInclusions,
    fleteLiquidacion,
  );
  const existing = await findOpenDraft(tenantId, driverId, fechaInicio, fechaFin);
  if (existing) {
    await existing.update({ snapshot: summary } as never);
    return existing;
  }

  return Settlement.create({
    id: randomUUID(),
    tenant_id: tenantId,
    driver_id: driverId,
    fecha_inicio: fechaInicio,
    fecha_fin: fechaFin,
    cerrado: false,
    cerrado_at: null,
    snapshot: summary,
  } as never);
}

export async function updateDraftSettlement(
  tenantId: string,
  settlementId: string,
  tripInclusions?: TripInclusion[],
  fleteLiquidacion?: SettlementFlete[],
) {
  const row = await Settlement.findOne({
    where: { id: settlementId, tenant_id: tenantId, cerrado: false },
  });
  if (!row) {
    const err = new Error("Pre-liquidación no encontrada");
    (err as Error & { status?: number }).status = 404;
    throw err;
  }
  const fletes =
    fleteLiquidacion === undefined
      ? fleteListFromSnapshot(row.snapshot as Record<string, unknown> | null)
      : fleteLiquidacion;
  const summary = await settlementSummary(
    tenantId,
    row.driver_id,
    row.fecha_inicio,
    row.fecha_fin,
    tripInclusions,
    fletes,
  );
  await row.update({ snapshot: summary } as never);
  return row;
}

export async function deleteDraftSettlement(tenantId: string, settlementId: string) {
  const row = await Settlement.findOne({
    where: { id: settlementId, tenant_id: tenantId },
  });
  if (!row) {
    const err = new Error("Pre-liquidación no encontrada");
    (err as Error & { status?: number }).status = 404;
    throw err;
  }
  if (row.cerrado) {
    const err = new Error("No se puede eliminar una liquidación cerrada");
    (err as Error & { status?: number }).status = 409;
    throw err;
  }
  await row.destroy();
}

export async function closeSettlement(
  tenantId: string,
  driverId: string,
  fechaInicio: string,
  fechaFin: string,
  settlementId?: string,
  tripInclusions?: TripInclusion[],
  fleteLiquidacion?: SettlementFlete[],
) {
  const driver = await Driver.findOne({ where: { id: driverId, tenant_id: tenantId } });
  if (!driver) {
    const err = new Error("Operador no encontrado");
    (err as Error & { status?: number }).status = 404;
    throw err;
  }

  const closedExists = await Settlement.findOne({
    where: {
      tenant_id: tenantId,
      driver_id: driverId,
      fecha_inicio: fechaInicio,
      fecha_fin: fechaFin,
      cerrado: true,
    },
  });
  if (closedExists) {
    const err = new Error("Liquidación ya cerrada para este periodo");
    (err as Error & { status?: number }).status = 409;
    throw err;
  }

  let draft = settlementId
    ? await Settlement.findOne({ where: { id: settlementId, tenant_id: tenantId, cerrado: false } })
    : null;

  let inclusions = tripInclusions;
  if (tripInclusions === undefined && draft?.snapshot) {
    const fromSnapshot = inclusionMapFromSnapshot(draft.snapshot as Record<string, unknown>);
    if (fromSnapshot) inclusions = tripInclusionsFromMap(fromSnapshot);
  }

  const fletes =
    fleteLiquidacion === undefined && draft?.snapshot
      ? fleteListFromSnapshot(draft.snapshot as Record<string, unknown>)
      : fleteLiquidacion;
  const summaryData = await settlementSummary(
    tenantId,
    driverId,
    fechaInicio,
    fechaFin,
    inclusions,
    fletes,
  );
  const tripIds = (summaryData.trips as { id: string; included?: boolean }[])
    .filter((trip) => trip.included !== false)
    .map((trip) => trip.id);

  return sequelize.transaction(async (t) => {
    const stillClosed = await Settlement.findOne({
      where: {
        tenant_id: tenantId,
        driver_id: driverId,
        fecha_inicio: fechaInicio,
        fecha_fin: fechaFin,
        cerrado: true,
      },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (stillClosed) {
      const err = new Error("Liquidación ya cerrada para este periodo");
      (err as Error & { status?: number }).status = 409;
      throw err;
    }

    let row = settlementId
      ? await Settlement.findOne({
          where: { id: settlementId, tenant_id: tenantId, cerrado: false },
          transaction: t,
          lock: t.LOCK.UPDATE,
        })
      : null;

    // Recalcula las cuotas con los saldos bloqueados dentro de la transacción:
    // un pago directo simultáneo (posterior al preview) reduce el saldo y el
    // snapshot debe reflejar el importe realmente aplicado.
    const netoBase = computeNetoPagar({
      total_comisiones: num(summaryData.total_comisiones),
      saldo_viaticos: num(summaryData.saldo_viaticos),
      total_compensaciones: num(summaryData.total_compensaciones),
      total_descuentos: num(summaryData.total_descuentos),
      total_anticipos: num(summaryData.total_anticipos),
      total_cuenta_abonos: 0,
    });
    const { items: freshItems } = await loadActiveAccountItemBalances(tenantId, driverId, {
      transaction: t,
      lock: true,
    });
    const freshPreview = computeAccountApplicationsForNeto(netoBase, freshItems);
    summaryData.total_cuenta_abonos = freshPreview.total_cuenta_abonos;
    summaryData.account_items = freshItems;
    summaryData.account_applications = freshPreview.applications;
    const netoCalculado = freshPreview.neto_pagar;
    const pendienteArrastrado = roundMoney(Math.max(0, -netoCalculado));
    summaryData.neto_calculado = netoCalculado;
    summaryData.pendiente_arrastrado = pendienteArrastrado;
    summaryData.neto_pagar = pendienteArrastrado > 0 ? 0 : netoCalculado;

    if (row) {
      await row.update(
        {
          cerrado: true,
          cerrado_at: new Date(),
          snapshot: summaryData,
        } as never,
        { transaction: t },
      );
    } else {
      row = await Settlement.create(
        {
          id: randomUUID(),
          tenant_id: tenantId,
          driver_id: driverId,
          fecha_inicio: fechaInicio,
          fecha_fin: fechaFin,
          cerrado: true,
          cerrado_at: new Date(),
          snapshot: summaryData,
        } as never,
        { transaction: t },
      );
    }

    const sid = row!.id;
    if (tripIds.length > 0) {
      await Trip.update(
        { settlement_id: sid },
        {
          where: {
            id: { [Op.in]: tripIds },
            tenant_id: tenantId,
            settlement_id: null,
          },
          transaction: t,
        },
      );
    }

    const { advancesInPeriod, discountsInPeriod, compensationsInPeriod, extraViaticosInPeriod } =
      await pendingAdvancesDiscountsAndCompensations(tenantId, driverId, fechaInicio, fechaFin);
    for (const a of advancesInPeriod) {
      await a.update({ settlement_id: sid } as never, { transaction: t });
    }
    for (const d of discountsInPeriod) {
      await d.update({ settlement_id: sid } as never, { transaction: t });
    }
    for (const c of compensationsInPeriod) {
      await c.update({ settlement_id: sid } as never, { transaction: t });
    }
    for (const e of extraViaticosInPeriod) {
      await e.update({ settlement_id: sid } as never, { transaction: t });
    }

    await applySettlementAccountInstallments(tenantId, driverId, sid, fechaFin, freshPreview.applications, t);

    if (pendienteArrastrado > 0) {
      const pending = await createSettlementCarryoverItem(
        tenantId,
        driverId,
        sid,
        fechaInicio,
        fechaFin,
        pendienteArrastrado,
        t,
      );
      summaryData.pendiente_item_id = pending.id;
      await row!.update({ snapshot: summaryData } as never, { transaction: t });
    }

    return row!;
  });
}

export async function closeSettlementById(
  tenantId: string,
  settlementId: string,
  tripInclusions?: TripInclusion[],
  fleteLiquidacion?: SettlementFlete[],
) {
  const row = await Settlement.findOne({
    where: { id: settlementId, tenant_id: tenantId, cerrado: false },
  });
  if (!row) {
    const err = new Error("Pre-liquidación no encontrada");
    (err as Error & { status?: number }).status = 404;
    throw err;
  }
  return closeSettlement(
    tenantId,
    row.driver_id,
    row.fecha_inicio,
    row.fecha_fin,
    settlementId,
    tripInclusions,
    fleteLiquidacion,
  );
}

export async function cancelSettlement(tenantId: string, settlementId: string) {
  const row = await Settlement.findOne({
    where: { id: settlementId, tenant_id: tenantId },
  });
  if (!row) {
    const err = new Error("Liquidación no encontrada");
    (err as Error & { status?: number }).status = 404;
    throw err;
  }
  if (!row.cerrado) {
    const err = new Error("La liquidación no está cerrada");
    (err as Error & { status?: number }).status = 409;
    throw err;
  }

  const otherDraft = await findOpenDraft(tenantId, row.driver_id, row.fecha_inicio, row.fecha_fin);
  if (otherDraft && otherDraft.id !== row.id) {
    const err = new Error("Ya existe una pre-liquidación abierta para este periodo");
    (err as Error & { status?: number }).status = 409;
    throw err;
  }

  const snapshot = row.snapshot as Record<string, unknown> | null;
  const fromSnapshot = inclusionMapFromSnapshot(snapshot);
  const tripInclusions = fromSnapshot ? tripInclusionsFromMap(fromSnapshot) : undefined;
  const fleteLiquidacion = fleteListFromSnapshot(snapshot);

  await sequelize.transaction(async (t) => {
    const locked = await Settlement.findOne({
      where: { id: settlementId, tenant_id: tenantId, cerrado: true },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (!locked) {
      const err = new Error("Liquidación no encontrada o ya no está cerrada");
      (err as Error & { status?: number }).status = 409;
      throw err;
    }

    const stillOther = await Settlement.findOne({
      where: {
        tenant_id: tenantId,
        driver_id: locked.driver_id,
        fecha_inicio: locked.fecha_inicio,
        fecha_fin: locked.fecha_fin,
        cerrado: false,
        id: { [Op.ne]: locked.id },
      },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (stillOther) {
      const err = new Error("Ya existe una pre-liquidación abierta para este periodo");
      (err as Error & { status?: number }).status = 409;
      throw err;
    }

    await Trip.update(
      { settlement_id: null },
      { where: { tenant_id: tenantId, settlement_id: locked.id }, transaction: t },
    );
    await DriverAdvance.update(
      { settlement_id: null },
      { where: { tenant_id: tenantId, settlement_id: locked.id }, transaction: t },
    );
    await DriverDiscount.update(
      { settlement_id: null },
      { where: { tenant_id: tenantId, settlement_id: locked.id }, transaction: t },
    );
    await DriverCompensation.update(
      { settlement_id: null },
      { where: { tenant_id: tenantId, settlement_id: locked.id }, transaction: t },
    );
    await DriverExtraViatico.update(
      { settlement_id: null },
      { where: { tenant_id: tenantId, settlement_id: locked.id }, transaction: t },
    );

    await revertSettlementAccountInstallments(tenantId, locked.id, t);
    await revertSettlementCarryoverItem(tenantId, locked.id, t);

    await locked.update(
      {
        cerrado: false,
        cerrado_at: null,
      } as never,
      { transaction: t },
    );
  });

  await row.reload();
  const summary = await settlementSummary(
    tenantId,
    row.driver_id,
    row.fecha_inicio,
    row.fecha_fin,
    tripInclusions,
    fleteLiquidacion,
  );
  await row.update({ snapshot: summary } as never);
  return row;
}

type SnapshotExtraViatico = {
  id?: string;
  monto_entregado?: unknown;
  monto_comprobado?: unknown;
  en_periodo?: boolean;
};

/**
 * Cuando se edita el comprobado de un extra ya ligado a una liquidación, el snapshot
 * (que es lo que ven el panel y el PDF) debe reflejarlo. Los viajes del snapshot son JSON
 * serializado y no se pueden recalcular con `computeSettlementTotals`, así que se resta
 * la aportación previa de los extras en periodo para obtener la base de viajes y se
 * vuelve a sumar con el valor nuevo. El neto se recalcula con las demás partidas del
 * snapshot y el `total_cuenta_abonos` ya aplicado (las cuotas de cuenta no se reaplican).
 */
export async function syncExtraViaticoComprobadoInSnapshot(
  tenantId: string,
  row: { id: string; settlement_id?: string | null; monto_comprobado: unknown },
  options: { transaction?: Transaction } = {},
): Promise<void> {
  if (!row.settlement_id) return;
  const settlement = await Settlement.findOne({
    where: { id: row.settlement_id, tenant_id: tenantId },
    transaction: options.transaction,
  });
  if (!settlement || !settlement.cerrado) return;
  const current = settlement.snapshot as Record<string, unknown> | null | undefined;
  if (!current || !Array.isArray(current.extra_viaticos)) return;

  const oldExtras = current.extra_viaticos as SnapshotExtraViatico[];
  if (!oldExtras.some((e) => e.id === row.id)) return;

  const newExtras = oldExtras.map((e) =>
    e.id === row.id ? { ...e, monto_comprobado: num(row.monto_comprobado) } : { ...e },
  );
  const toAmounts = (list: SnapshotExtraViatico[]) =>
    list
      .filter((e) => e.en_periodo !== false)
      .map((e) => ({ monto_entregado: num(e.monto_entregado), monto_comprobado: num(e.monto_comprobado) }));

  const prev = sumExtraViaticos(toAmounts(oldExtras));
  const merged = applyExtraViaticosToTotals(
    {
      viaticos_entregados: roundMoney(num(current.viaticos_entregados) - prev.entregados),
      viaticos_comprobados: roundMoney(num(current.viaticos_comprobados) - prev.comprobados),
    },
    toAmounts(newExtras),
  );

  const netoCalculado = computeNetoPagar({
    total_comisiones: num(current.total_comisiones),
    saldo_viaticos: merged.saldo_viaticos,
    total_compensaciones: num(current.total_compensaciones),
    total_descuentos: num(current.total_descuentos),
    total_anticipos: num(current.total_anticipos),
    total_cuenta_abonos: num(current.total_cuenta_abonos),
  });
  const decision = resolveSnapshotNetoCarryover(num(current.pendiente_arrastrado), netoCalculado);
  if (!decision.ok) {
    const err = new Error(decision.reason);
    (err as Error & { status?: number }).status = 409;
    throw err;
  }

  const snapshot: Record<string, unknown> = {
    ...current,
    ...merged,
    extra_viaticos: newExtras,
    neto_calculado: netoCalculado,
    neto_pagar: decision.neto_pagar,
    pendiente_arrastrado: decision.pendiente_arrastrado,
  };
  await settlement.update({ snapshot } as never, { transaction: options.transaction });
}
