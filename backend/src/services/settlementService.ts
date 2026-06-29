import { randomUUID } from "node:crypto";
import { Op } from "sequelize";
import { Driver, Trip, Settlement, DriverAdvance, DriverDiscount, DriverCompensation } from "../models";
import {
  computeSettlementTotals,
  filterEligibleSettlementTrips,
} from "./calc";
import { tripToJson } from "../utils/serialize";
import { num } from "../utils/numbers";

export type TripInclusion = { id: string; included: boolean };

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

async function pendingAdvancesDiscountsAndCompensations(
  tenantId: string,
  driverId: string,
  inicioStr: string,
  finStr: string,
) {
  const [allAdvances, allDiscounts, allCompensations] = await Promise.all([
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
  ]);
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
    include: [{ association: "fuel" }, { association: "expenses" }, { association: "Client", attributes: ["id", "razon_social"] }],
  });
  const { advances, discounts, compensations, total_anticipos, total_descuentos, total_compensaciones } =
    await pendingAdvancesDiscountsAndCompensations(tenantId, driverId, inicioStr, finStr);

  const eligible = filterEligibleSettlementTrips(driver, trips, inicio, fin);
  const inclusionMap = inclusionMapFromList(
    eligible.map((e) => String(e.trip.id)),
    tripInclusions,
  );
  const includedTrips = eligible
    .filter((e) => inclusionMap.get(String(e.trip.id)) !== false)
    .map((e) => e.trip);
  const totals = computeSettlementTotals(driver, includedTrips, {
    total_anticipos,
    total_descuentos,
    total_compensaciones,
  });

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
    ...totals,
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
    trips: eligible.map(({ trip, en_periodo }) => {
      const id = String(trip.id);
      return {
        ...tripToJson(trip),
        en_periodo,
        included: inclusionMap.get(id) !== false,
      };
    }),
  };
}

export async function listSettlements(tenantId: string, driverId?: string) {
  const where: Record<string, unknown> = { tenant_id: tenantId };
  if (driverId) where.driver_id = driverId;
  return Settlement.findAll({
    where,
    order: [["fecha_inicio", "DESC"]],
    include: [{ model: Driver, attributes: ["id", "nombre"] }],
  });
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
) {
  const summary = await settlementSummary(tenantId, driverId, fechaInicio, fechaFin, tripInclusions);
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
) {
  const row = await Settlement.findOne({
    where: { id: settlementId, tenant_id: tenantId, cerrado: false },
  });
  if (!row) {
    const err = new Error("Pre-liquidación no encontrada");
    (err as Error & { status?: number }).status = 404;
    throw err;
  }
  const summary = await settlementSummary(
    tenantId,
    row.driver_id,
    row.fecha_inicio,
    row.fecha_fin,
    tripInclusions,
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

  let row = settlementId
    ? await Settlement.findOne({ where: { id: settlementId, tenant_id: tenantId, cerrado: false } })
    : null;

  let inclusions = tripInclusions;
  if (tripInclusions === undefined && row?.snapshot) {
    const fromSnapshot = inclusionMapFromSnapshot(row.snapshot as Record<string, unknown>);
    if (fromSnapshot) inclusions = tripInclusionsFromMap(fromSnapshot);
  }

  const summaryData = await settlementSummary(tenantId, driverId, fechaInicio, fechaFin, inclusions);
  const tripIds = (summaryData.trips as { id: string; included?: boolean }[])
    .filter((t) => t.included !== false)
    .map((t) => t.id);

  if (row) {
    await row.update({
      cerrado: true,
      cerrado_at: new Date(),
      snapshot: summaryData,
    } as never);
  } else {
    row = await Settlement.create({
      id: randomUUID(),
      tenant_id: tenantId,
      driver_id: driverId,
      fecha_inicio: fechaInicio,
      fecha_fin: fechaFin,
      cerrado: true,
      cerrado_at: new Date(),
      snapshot: summaryData,
    } as never);
  }

  const sid = row!.id;
  if (tripIds.length > 0) {
    await Trip.update({ settlement_id: sid }, { where: { id: { [Op.in]: tripIds }, tenant_id: tenantId } });
  }

  const { advancesInPeriod, discountsInPeriod, compensationsInPeriod } =
    await pendingAdvancesDiscountsAndCompensations(tenantId, driverId, fechaInicio, fechaFin);
  for (const a of advancesInPeriod) await a.update({ settlement_id: sid } as never);
  for (const d of discountsInPeriod) await d.update({ settlement_id: sid } as never);
  for (const c of compensationsInPeriod) await c.update({ settlement_id: sid } as never);

  return row!;
}

export async function closeSettlementById(
  tenantId: string,
  settlementId: string,
  tripInclusions?: TripInclusion[],
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
  );
}
