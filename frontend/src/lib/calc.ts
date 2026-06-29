import type { Trip, Driver, Truck } from "@/types/tlo";

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
  rendimiento_real: number; // km/l
  costo_diesel_por_km: number;
}

export const driverCommissionRate = (trip: Trip, driver: Driver): number => {
  const isForaneo = trip.tipo_viaje === "foraneo";
  const local = driver.comision_valor_local ?? driver.comision_valor;
  const foraneo = driver.comision_valor_foraneo ?? driver.comision_valor;
  return isForaneo ? foraneo : local;
};

export const computeCommissionFromScheme = (trip: Trip, driver?: Driver): number => {
  if (!driver) return 0;
  const rate = driverCommissionRate(trip, driver);
  if (driver.comision_tipo === "porcentaje") {
    return (trip.tarifa * rate) / 100;
  }
  return rate;
};

export const computeCommission = (trip: Trip, driver?: Driver): number => {
  if (typeof trip.comision_override === "number") return trip.comision_override;
  return computeCommissionFromScheme(trip, driver);
};

const clampMontoComprobado = (e: { monto: number; monto_comprobado: number }) =>
  Math.min(Math.max(0, e.monto_comprobado), e.monto);

export function ingresosComprobadosLiquidacion(trip: Trip): number {
  return trip.expenses
    .filter((e) => e.tipo === "ingreso" && e.visible_en_liquidacion)
    .reduce((a, e) => a + clampMontoComprobado(e), 0);
}

export const computeTrip = (trip: Trip, driver?: Driver): TripFinancials => {
  const gastoRows = trip.expenses.filter((e) => e.tipo !== "ingreso");
  const ingresoRows = trip.expenses.filter((e) => e.tipo === "ingreso");
  const ingresos_extra = ingresoRows.reduce((a, e) => a + e.monto, 0);
  const ingreso = (trip.tarifa || 0) + ingresos_extra;
  const diesel_litros = trip.fuel.reduce((a, f) => a + f.litros, 0);
  const diesel_total = trip.fuel.reduce((a, f) => a + f.litros * f.precio_litro, 0);
  const gastos_comprobados = gastoRows.reduce((a, e) => a + clampMontoComprobado(e), 0);
  const gastos_no_comprobados = gastoRows.reduce((a, e) => a + (e.monto - clampMontoComprobado(e)), 0);
  const gastos_total = gastos_comprobados + gastos_no_comprobados;
  const comision = computeCommission(trip, driver);
  const costo_total = diesel_total + gastos_total + comision;
  const utilidad = ingreso - costo_total;
  const margen_pct = ingreso > 0 ? (utilidad / ingreso) * 100 : 0;
  const km_recorridos = trip.km_final && trip.km_inicial != null
    ? Math.max(0, trip.km_final - trip.km_inicial)
    : 0;
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
};

export interface SettlementSummary {
  trips: Trip[];
  total_ingresos: number;
  total_comisiones: number;
  total_km: number;
  viaticos_entregados: number;
  viaticos_comprobados: number;
  saldo_viaticos: number; // positivo = saldo a favor del operador
  total_descuentos: number;
  total_anticipos: number;
  total_compensaciones: number;
  neto_pagar: number;
  advances?: { id: string; fecha: string; descripcion: string; monto: number; en_periodo?: boolean }[];
  discounts?: { id: string; tipo: string; fecha: string; descripcion: string; monto: number; en_periodo?: boolean }[];
  compensations?: { id: string; tipo: string; fecha: string; descripcion: string; monto: number; en_periodo?: boolean }[];
}

/** Monto comprobado en exceso de viáticos entregados (suma al neto). */
export const viaticosAFavor = (saldoViaticos: number) => Math.max(0, saldoViaticos);

/** Viáticos entregados sin comprobar (solo para etiquetas/PDF). */
export const viaticosNoComprobado = (saldoViaticos: number) => Math.max(0, -saldoViaticos);

export function computeNetoPagar(opts: {
  total_comisiones: number;
  saldo_viaticos: number;
  total_compensaciones?: number;
  total_descuentos?: number;
  total_anticipos?: number;
}): number {
  const total_compensaciones = opts.total_compensaciones ?? 0;
  const total_descuentos = opts.total_descuentos ?? 0;
  const total_anticipos = opts.total_anticipos ?? 0;
  return (
    opts.total_comisiones +
    total_compensaciones +
    opts.saldo_viaticos -
    total_descuentos -
    total_anticipos
  );
}

export const computeSettlement = (
  driver: Driver,
  trips: Trip[],
  inicio: Date,
  fin: Date,
  opts?: { total_descuentos?: number; total_anticipos?: number; total_compensaciones?: number },
): SettlementSummary => {
  const inRange = trips.filter(t => {
    if (t.driver_id !== driver.id) return false;
    const d = new Date(t.fecha_salida);
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
    viaticos_entregados += t.viaticos_entregados || 0;
    viaticos_comprobados += f.gastos_comprobados + ingresosComprobadosLiquidacion(t);
  }
  const saldo_viaticos = viaticos_comprobados - viaticos_entregados;
  const total_descuentos = opts?.total_descuentos ?? 0;
  const total_anticipos = opts?.total_anticipos ?? 0;
  const total_compensaciones = opts?.total_compensaciones ?? 0;
  const neto_pagar = computeNetoPagar({
    total_comisiones,
    saldo_viaticos,
    total_compensaciones,
    total_descuentos,
    total_anticipos,
  });
  return {
    trips: inRange,
    total_ingresos,
    total_comisiones,
    total_km,
    viaticos_entregados,
    viaticos_comprobados,
    saldo_viaticos,
    total_descuentos,
    total_anticipos,
    total_compensaciones,
    neto_pagar,
  };
};

export const truckById = (trucks: Truck[], id: string) =>
  trucks.find(t => t.id === id);
export const driverById = (drivers: Driver[], id: string) =>
  drivers.find(d => d.id === id);