import { randomUUID } from "node:crypto";
import { Driver, Trip, Settlement } from "../models";
import { computeSettlement } from "./calc";
import { tripToJson } from "../utils/serialize";

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
    where: { tenant_id: tenantId, driver_id: driverId },
    include: [
      { association: "fuel" },
      { association: "expenses" },
    ],
  });
  const summary = computeSettlement(driver, trips, inicio, fin);
  return {
    driver: {
      id: driver.id,
      nombre: driver.nombre,
      comision_tipo: driver.comision_tipo,
      comision_valor: Number(driver.comision_valor),
      estatus: driver.estatus,
    },
    periodo: { inicio: inicioStr, fin: finStr },
    total_ingresos: summary.total_ingresos,
    total_comisiones: summary.total_comisiones,
    total_km: summary.total_km,
    viaticos_entregados: summary.viaticos_entregados,
    viaticos_comprobados: summary.viaticos_comprobados,
    saldo_viaticos: summary.saldo_viaticos,
    neto_pagar: summary.neto_pagar,
    trips: summary.trips.map((t) => tripToJson(t)),
  };
}

export async function closeSettlement(
  tenantId: string,
  driverId: string,
  fechaInicio: string,
  fechaFin: string,
) {
  const driver = await Driver.findOne({ where: { id: driverId, tenant_id: tenantId } });
  if (!driver) {
    const err = new Error("Operador no encontrado");
    (err as Error & { status?: number }).status = 404;
    throw err;
  }
  const inicio = new Date(`${fechaInicio}T00:00:00`);
  const fin = new Date(`${fechaFin}T23:59:59`);
  const trips = await Trip.findAll({
    where: { tenant_id: tenantId, driver_id: driverId },
    include: [
      { association: "fuel" },
      { association: "expenses" },
    ],
  });
  const summary = computeSettlement(driver, trips, inicio, fin);
  const existing = await Settlement.findOne({
    where: {
      tenant_id: tenantId,
      driver_id: driverId,
      fecha_inicio: fechaInicio,
      fecha_fin: fechaFin,
      cerrado: true,
    },
  });
  if (existing) {
    const err = new Error("Liquidación ya cerrada para este periodo");
    (err as Error & { status?: number }).status = 409;
    throw err;
  }
  return Settlement.create({
    id: randomUUID(),
    tenant_id: tenantId,
    driver_id: driverId,
    fecha_inicio: fechaInicio,
    fecha_fin: fechaFin,
    cerrado: true,
    cerrado_at: new Date(),
    snapshot: {
      total_ingresos: summary.total_ingresos,
      total_comisiones: summary.total_comisiones,
      total_km: summary.total_km,
      viaticos_entregados: summary.viaticos_entregados,
      viaticos_comprobados: summary.viaticos_comprobados,
      saldo_viaticos: summary.saldo_viaticos,
      neto_pagar: summary.neto_pagar,
      trip_ids: summary.trips.map((t) => t.id),
      trips: summary.trips.map((t) => ({
        id: t.id,
        folio: t.folio,
        num_factura: t.num_factura?.trim() || null,
        origen: t.origen,
        destino: t.destino,
        fecha_salida: t.fecha_salida,
      })),
    },
  } as never);
}
