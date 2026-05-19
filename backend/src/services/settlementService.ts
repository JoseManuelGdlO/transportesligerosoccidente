import { randomUUID } from "node:crypto";
import { Op } from "sequelize";
import { Driver, Trip, Settlement, DriverAdvance, DriverDiscount } from "../models";
import { computeSettlement } from "./calc";
import { tripToJson } from "../utils/serialize";
import { num } from "../utils/numbers";

async function pendingAdvancesAndDiscounts(
  tenantId: string,
  driverId: string,
  inicioStr: string,
  finStr: string,
) {
  const advances = await DriverAdvance.findAll({
    where: {
      tenant_id: tenantId,
      driver_id: driverId,
      settlement_id: null,
      fecha: { [Op.between]: [inicioStr, finStr] },
    },
  });
  const discounts = await DriverDiscount.findAll({
    where: {
      tenant_id: tenantId,
      driver_id: driverId,
      settlement_id: null,
      fecha: { [Op.between]: [inicioStr, finStr] },
    },
  });
  const total_anticipos = advances.reduce((a, r) => a + num(r.monto), 0);
  const total_descuentos = discounts.reduce((a, r) => a + num(r.monto), 0);
  return { advances, discounts, total_anticipos, total_descuentos };
}

export async function settlementSummary(
  tenantId: string,
  driverId: string,
  inicioStr: string,
  finStr: string,
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
    include: [{ association: "fuel" }, { association: "expenses" }],
  });
  const { advances, discounts, total_anticipos, total_descuentos } =
    await pendingAdvancesAndDiscounts(tenantId, driverId, inicioStr, finStr);
  const summary = computeSettlement(driver, trips, inicio, fin, {
    total_anticipos,
    total_descuentos,
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
    total_ingresos: summary.total_ingresos,
    total_comisiones: summary.total_comisiones,
    total_km: summary.total_km,
    viaticos_entregados: summary.viaticos_entregados,
    viaticos_comprobados: summary.viaticos_comprobados,
    saldo_viaticos: summary.saldo_viaticos,
    total_descuentos: summary.total_descuentos,
    total_anticipos: summary.total_anticipos,
    neto_pagar: summary.neto_pagar,
    advances: advances.map((a) => ({
      id: a.id,
      monto: num(a.monto),
      fecha: a.fecha,
      descripcion: a.descripcion,
    })),
    discounts: discounts.map((d) => ({
      id: d.id,
      tipo: d.tipo,
      monto: num(d.monto),
      fecha: d.fecha,
      descripcion: d.descripcion,
    })),
    trips: summary.trips.map((t) => tripToJson(t)),
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

export async function createDraftSettlement(
  tenantId: string,
  driverId: string,
  fechaInicio: string,
  fechaFin: string,
) {
  const existing = await Settlement.findOne({
    where: {
      tenant_id: tenantId,
      driver_id: driverId,
      fecha_inicio: fechaInicio,
      fecha_fin: fechaFin,
    },
  });
  if (existing) return existing;

  const summary = await settlementSummary(tenantId, driverId, fechaInicio, fechaFin);
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

export async function closeSettlement(
  tenantId: string,
  driverId: string,
  fechaInicio: string,
  fechaFin: string,
  settlementId?: string,
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

  const summaryData = await settlementSummary(tenantId, driverId, fechaInicio, fechaFin);
  const tripIds = (summaryData.trips as { id: string }[]).map((t) => t.id);

  let row = settlementId
    ? await Settlement.findOne({ where: { id: settlementId, tenant_id: tenantId, cerrado: false } })
    : null;

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
  await Trip.update({ settlement_id: sid }, { where: { id: { [Op.in]: tripIds }, tenant_id: tenantId } });

  const { advances, discounts } = await pendingAdvancesAndDiscounts(
    tenantId,
    driverId,
    fechaInicio,
    fechaFin,
  );
  for (const a of advances) await a.update({ settlement_id: sid } as never);
  for (const d of discounts) await d.update({ settlement_id: sid } as never);

  return row!;
}

export async function closeSettlementById(tenantId: string, settlementId: string) {
  const row = await Settlement.findOne({
    where: { id: settlementId, tenant_id: tenantId, cerrado: false },
  });
  if (!row) {
    const err = new Error("Pre-liquidación no encontrada");
    (err as Error & { status?: number }).status = 404;
    throw err;
  }
  return closeSettlement(tenantId, row.driver_id, row.fecha_inicio, row.fecha_fin, settlementId);
}
