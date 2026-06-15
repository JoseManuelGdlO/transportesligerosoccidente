import { computeTrip, ingresosComprobadosLiquidacion, type SettlementSummary } from "@/lib/calc";
import type { Driver, SettlementSummaryApi } from "@/types/tlo";

export type TripInclusionPayload = { id: string; included: boolean };

export function buildTripInclusionsFromTrips(trips: { id: string; included?: boolean }[]): Record<string, boolean> {
  return Object.fromEntries(trips.map((t) => [t.id, t.included !== false]));
}

export function tripInclusionsPayload(inclusions: Record<string, boolean>): TripInclusionPayload[] {
  return Object.entries(inclusions).map(([id, included]) => ({ id, included }));
}

export function applyTripInclusions(
  summary: SettlementSummaryApi,
  driver: Driver,
  inclusions: Record<string, boolean>,
): SettlementSummaryApi {
  const trips = summary.trips.map((t) => ({
    ...t,
    included: inclusions[t.id] !== false,
  }));
  const includedTrips = trips.filter((t) => t.included !== false);

  let total_ingresos = 0;
  let total_comisiones = 0;
  let total_km = 0;
  let viaticos_entregados = 0;
  let viaticos_comprobados = 0;
  for (const t of includedTrips) {
    const f = computeTrip(t, driver);
    total_ingresos += f.ingreso;
    total_comisiones += f.comision;
    total_km += f.km_recorridos;
    viaticos_entregados += t.viaticos_entregados || 0;
    viaticos_comprobados += f.gastos_comprobados + ingresosComprobadosLiquidacion(t);
  }
  const saldo_viaticos = viaticos_comprobados - viaticos_entregados;
  const no_comprobado = Math.max(0, viaticos_entregados - viaticos_comprobados);
  const neto_pagar =
    total_comisiones - no_comprobado - summary.total_descuentos - summary.total_anticipos;

  return {
    ...summary,
    trips,
    total_ingresos,
    total_comisiones,
    total_km,
    viaticos_entregados,
    viaticos_comprobados,
    saldo_viaticos,
    neto_pagar,
  };
}

export function snapshotToPdfSummary(snapshot: SettlementSummaryApi): SettlementSummary {
  const includedTrips = snapshot.trips.filter((t) => t.included !== false);
  const excluded = snapshot.trips.filter((t) => t.included === false);
  if (excluded.length === 0) {
    return {
      trips: snapshot.trips,
      total_ingresos: snapshot.total_ingresos,
      total_comisiones: snapshot.total_comisiones,
      total_km: snapshot.total_km,
      viaticos_entregados: snapshot.viaticos_entregados,
      viaticos_comprobados: snapshot.viaticos_comprobados,
      saldo_viaticos: snapshot.saldo_viaticos,
      total_descuentos: snapshot.total_descuentos,
      total_anticipos: snapshot.total_anticipos,
      neto_pagar: snapshot.neto_pagar,
      advances: snapshot.advances ?? [],
      discounts: snapshot.discounts ?? [],
    };
  }

  const driver = snapshot.driver;
  let total_ingresos = 0;
  let total_comisiones = 0;
  let total_km = 0;
  let viaticos_entregados = 0;
  let viaticos_comprobados = 0;
  for (const t of includedTrips) {
    const f = computeTrip(t, driver);
    total_ingresos += f.ingreso;
    total_comisiones += f.comision;
    total_km += f.km_recorridos;
    viaticos_entregados += t.viaticos_entregados || 0;
    viaticos_comprobados += f.gastos_comprobados + ingresosComprobadosLiquidacion(t);
  }
  const saldo_viaticos = viaticos_comprobados - viaticos_entregados;
  const no_comprobado = Math.max(0, viaticos_entregados - viaticos_comprobados);
  const neto_pagar =
    total_comisiones - no_comprobado - snapshot.total_descuentos - snapshot.total_anticipos;

  return {
    trips: includedTrips,
    total_ingresos,
    total_comisiones,
    total_km,
    viaticos_entregados,
    viaticos_comprobados,
    saldo_viaticos,
    total_descuentos: snapshot.total_descuentos,
    total_anticipos: snapshot.total_anticipos,
    neto_pagar,
    advances: snapshot.advances ?? [],
    discounts: snapshot.discounts ?? [],
  };
}

export function resolveSettlementDriver(snapshot: SettlementSummaryApi, drivers: Driver[]): Driver | null {
  const fromSnapshot = snapshot.driver;
  if (fromSnapshot?.id) {
    const catalog = drivers.find((d) => d.id === fromSnapshot.id);
    if (catalog) return catalog;
    return fromSnapshot as Driver;
  }
  return null;
}
