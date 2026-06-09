import type { SettlementSummary } from "@/lib/calc";
import type { Driver, SettlementSummaryApi } from "@/types/tlo";

export function snapshotToPdfSummary(snapshot: SettlementSummaryApi): SettlementSummary {
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

export function resolveSettlementDriver(snapshot: SettlementSummaryApi, drivers: Driver[]): Driver | null {
  const fromSnapshot = snapshot.driver;
  if (fromSnapshot?.id) {
    const catalog = drivers.find((d) => d.id === fromSnapshot.id);
    if (catalog) return catalog;
    return fromSnapshot as Driver;
  }
  return null;
}
