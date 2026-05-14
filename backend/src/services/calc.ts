import type { Trip } from "../models/Trip";
import type { Driver } from "../models/Driver";
import { num } from "../utils/numbers";

export interface TripFinancials {
  ingreso: number;
  diesel_total: number;
  diesel_litros: number;
  gastos_total: number;
  gastos_comprobados: number;
  gastos_no_comprobados: number;
  comision: number;
  costo_total: number;
  utilidad: number;
  margen_pct: number;
  km_recorridos: number;
  costo_por_km: number;
  ingreso_por_km: number;
  rendimiento_real: number;
  costo_diesel_por_km: number;
}

export function computeCommission(trip: Trip, driver?: Driver | null): number {
  if (trip.comision_override != null && String(trip.comision_override) !== "") {
    return num(trip.comision_override);
  }
  if (!driver) return 0;
  if (driver.comision_tipo === "porcentaje") {
    return (num(trip.tarifa) * num(driver.comision_valor)) / 100;
  }
  return num(driver.comision_valor);
}

export function computeTrip(trip: Trip & { fuel?: { litros: unknown; precio_litro: unknown }[]; expenses?: { comprobado: boolean; monto: unknown }[] }, driver?: Driver | null): TripFinancials {
  const ingreso = num(trip.tarifa);
  const fuelRows = trip.fuel ?? [];
  const diesel_litros = fuelRows.reduce((a, f) => a + num(f.litros), 0);
  const diesel_total = fuelRows.reduce((a, f) => a + num(f.litros) * num(f.precio_litro), 0);
  const expRows = trip.expenses ?? [];
  const gastos_comprobados = expRows.filter((e) => e.comprobado).reduce((a, e) => a + num(e.monto), 0);
  const gastos_no_comprobados = expRows.filter((e) => !e.comprobado).reduce((a, e) => a + num(e.monto), 0);
  const gastos_total = gastos_comprobados + gastos_no_comprobados;
  const comision = computeCommission(trip, driver);
  const costo_total = diesel_total + gastos_total + comision;
  const utilidad = ingreso - costo_total;
  const margen_pct = ingreso > 0 ? (utilidad / ingreso) * 100 : 0;
  const km_recorridos =
    trip.km_final != null && trip.km_inicial != null ? Math.max(0, Number(trip.km_final) - Number(trip.km_inicial)) : 0;
  const costo_por_km = km_recorridos > 0 ? costo_total / km_recorridos : 0;
  const ingreso_por_km = km_recorridos > 0 ? ingreso / km_recorridos : 0;
  const rendimiento_real = diesel_litros > 0 ? km_recorridos / diesel_litros : 0;
  const costo_diesel_por_km = km_recorridos > 0 ? diesel_total / km_recorridos : 0;
  return {
    ingreso,
    diesel_total,
    diesel_litros,
    gastos_total,
    gastos_comprobados,
    gastos_no_comprobados,
    comision,
    costo_total,
    utilidad,
    margen_pct,
    km_recorridos,
    costo_por_km,
    ingreso_por_km,
    rendimiento_real,
    costo_diesel_por_km,
  };
}

export interface SettlementSummary {
  trips: Trip[];
  total_ingresos: number;
  total_comisiones: number;
  total_km: number;
  viaticos_entregados: number;
  viaticos_comprobados: number;
  saldo_viaticos: number;
  neto_pagar: number;
}

export function computeSettlement(
  driver: Driver,
  trips: (Trip & { fuel?: unknown[]; expenses?: unknown[] })[],
  inicio: Date,
  fin: Date,
): SettlementSummary {
  const inRange = trips.filter((t) => {
    if (t.driver_id !== driver.id) return false;
    const d = new Date(t.fecha_salida as unknown as string);
    return d >= inicio && d <= fin;
  });
  let total_ingresos = 0;
  let total_comisiones = 0;
  let total_km = 0;
  let viaticos_entregados = 0;
  let viaticos_comprobados = 0;
  for (const t of inRange) {
    const f = computeTrip(t, driver);
    total_ingresos += f.ingreso;
    total_comisiones += f.comision;
    total_km += f.km_recorridos;
    viaticos_entregados += num(t.viaticos_entregados);
    viaticos_comprobados += f.gastos_comprobados;
  }
  const saldo_viaticos = viaticos_comprobados - viaticos_entregados;
  const no_comprobado = Math.max(0, viaticos_entregados - viaticos_comprobados);
  const neto_pagar = total_comisiones - no_comprobado;
  return {
    trips: inRange,
    total_ingresos,
    total_comisiones,
    total_km,
    viaticos_entregados,
    viaticos_comprobados,
    saldo_viaticos,
    neto_pagar,
  };
}
