import { z } from "zod";
import type { Request, Response } from "express";
import { Trip, Truck, Driver, Client } from "../models";
import { asyncHandler } from "../utils/asyncHandler";
import { computeTrip } from "../services/calc";
import { tripIsClosed } from "../services/tripStatusService";

const criterioFechaSchema = z.enum(["salida", "llegada"]).default("salida");

const querySchema = z.object({
  desde: z.string().optional(),
  hasta: z.string().optional(),
  criterio_fecha: criterioFechaSchema.optional(),
});

type CriterioFecha = z.infer<typeof criterioFechaSchema>;

const EXPENSE_CATS = ["casetas", "refacciones", "hospedaje", "comidas", "otros"] as const;
type ExpenseCat = (typeof EXPENSE_CATS)[number];

function inRange(iso: string, desde?: string, hasta?: string): boolean {
  const d = new Date(iso);
  if (desde && d < new Date(`${desde}T00:00:00`)) return false;
  if (hasta && d > new Date(`${hasta}T23:59:59`)) return false;
  return true;
}

function tripSalidaIso(t: Trip): string {
  return t.fecha_salida instanceof Date ? t.fecha_salida.toISOString() : String(t.fecha_salida);
}

function tripLlegadaIso(t: Trip): string {
  if (!t.fecha_llegada) return tripSalidaIso(t);
  return t.fecha_llegada instanceof Date ? t.fecha_llegada.toISOString() : String(t.fecha_llegada);
}

function tripFechaIso(t: Trip, criterio: CriterioFecha): string {
  return criterio === "llegada" ? tripLlegadaIso(t) : tripSalidaIso(t);
}

function filterClosed(
  trips: Trip[],
  desde?: string,
  hasta?: string,
  criterio: CriterioFecha = "salida",
): Trip[] {
  return trips.filter((t) => {
    if (!tripIsClosed(t)) return false;
    return inRange(tripFechaIso(t, criterio), desde, hasta);
  });
}

function previousPeriod(desde: string, hasta: string): { desde: string; hasta: string } {
  const start = new Date(`${desde}T00:00:00`);
  const end = new Date(`${hasta}T00:00:00`);
  const days = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
  const prevEnd = new Date(start);
  prevEnd.setDate(prevEnd.getDate() - 1);
  const prevStart = new Date(prevEnd);
  prevStart.setDate(prevStart.getDate() - (days - 1));
  return {
    desde: prevStart.toISOString().slice(0, 10),
    hasta: prevEnd.toISOString().slice(0, 10),
  };
}

function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

type TripWithFin = { trip: Trip; fin: ReturnType<typeof computeTrip> };

function enrichTrips(closed: Trip[], drivers: Driver[]): TripWithFin[] {
  const driverById = (id: string) => drivers.find((d) => d.id === id);
  return closed.map((trip) => ({
    trip,
    fin: computeTrip(trip, driverById(trip.driver_id) ?? null),
  }));
}

function buildTotals(enriched: TripWithFin[]) {
  let ingreso = 0;
  let costo_total = 0;
  let utilidad = 0;
  let km = 0;
  let diesel_total = 0;
  let comision_total = 0;
  let viajes_negativos = 0;
  for (const { fin } of enriched) {
    ingreso += fin.ingreso;
    costo_total += fin.costo_total;
    utilidad += fin.utilidad;
    km += fin.km_recorridos;
    diesel_total += fin.diesel_total;
    comision_total += fin.comision;
    if (fin.utilidad < 0) viajes_negativos += 1;
  }
  return {
    viajes: enriched.length,
    ingreso,
    costo_total,
    utilidad,
    margen: ingreso > 0 ? (utilidad / ingreso) * 100 : 0,
    km,
    viajes_negativos,
    diesel_total,
    comision_total,
  };
}

function buildByTime(
  enriched: TripWithFin[],
  desde?: string,
  hasta?: string,
  criterio: CriterioFecha = "salida",
) {
  const buckets = new Map<string, { ingreso: number; costo: number; utilidad: number; viajes: number }>();

  if (desde && hasta) {
    const start = new Date(`${desde}T00:00:00`);
    const end = new Date(`${hasta}T00:00:00`);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      buckets.set(d.toISOString().slice(0, 10), { ingreso: 0, costo: 0, utilidad: 0, viajes: 0 });
    }
  }

  for (const { trip, fin } of enriched) {
    const key = tripFechaIso(trip, criterio).slice(0, 10);
    const b = buckets.get(key) ?? { ingreso: 0, costo: 0, utilidad: 0, viajes: 0 };
    b.ingreso += fin.ingreso;
    b.costo += fin.costo_total;
    b.utilidad += fin.utilidad;
    b.viajes += 1;
    buckets.set(key, b);
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([fecha, v]) => ({ fecha, ...v }));
}

function buildByTruck(enriched: TripWithFin[], trucks: Truck[]) {
  return trucks
    .map((tk) => {
      const rows = enriched.filter((e) => e.trip.truck_id === tk.id);
      let ingreso = 0;
      let utilidad = 0;
      let km = 0;
      let diesel_total = 0;
      let costo_total = 0;
      for (const { fin } of rows) {
        ingreso += fin.ingreso;
        utilidad += fin.utilidad;
        km += fin.km_recorridos;
        diesel_total += fin.diesel_total;
        costo_total += fin.costo_total;
      }
      return {
        truck_id: tk.id,
        numero_economico: tk.numero_economico,
        marca: tk.marca,
        modelo: tk.modelo,
        viajes: rows.length,
        ingreso,
        utilidad,
        km,
        diesel_total,
        margen: ingreso > 0 ? (utilidad / ingreso) * 100 : 0,
        costo_por_km: km > 0 ? costo_total / km : 0,
        ingreso_por_km: km > 0 ? ingreso / km : 0,
      };
    })
    .sort((a, b) => b.utilidad - a.utilidad);
}

function buildByDriver(enriched: TripWithFin[], drivers: Driver[]) {
  return drivers
    .map((d) => {
      const rows = enriched.filter((e) => e.trip.driver_id === d.id);
      let ingreso = 0;
      let utilidad = 0;
      let comision = 0;
      let km = 0;
      let costo_total = 0;
      for (const { fin } of rows) {
        ingreso += fin.ingreso;
        utilidad += fin.utilidad;
        comision += fin.comision;
        km += fin.km_recorridos;
        costo_total += fin.costo_total;
      }
      return {
        driver_id: d.id,
        nombre: d.nombre,
        viajes: rows.length,
        ingreso,
        utilidad,
        comision,
        km,
        margen: ingreso > 0 ? (utilidad / ingreso) * 100 : 0,
        costo_por_km: km > 0 ? costo_total / km : 0,
        ingreso_por_km: km > 0 ? ingreso / km : 0,
      };
    })
    .sort((a, b) => b.utilidad - a.utilidad);
}

function buildByClient(enriched: TripWithFin[], clients: Client[]) {
  return clients
    .map((c) => {
      const rows = enriched.filter((e) => e.trip.client_id === c.id);
      let ingreso = 0;
      let utilidad = 0;
      let km = 0;
      for (const { fin } of rows) {
        ingreso += fin.ingreso;
        utilidad += fin.utilidad;
        km += fin.km_recorridos;
      }
      return {
        client_id: c.id,
        razon_social: c.razon_social,
        viajes: rows.length,
        ingreso,
        utilidad,
        km,
        margen: ingreso > 0 ? (utilidad / ingreso) * 100 : 0,
      };
    })
    .sort((a, b) => b.utilidad - a.utilidad);
}

function buildByTipoViaje(enriched: TripWithFin[]) {
  const types = ["local", "foraneo"] as const;
  return types.map((tipo) => {
    const rows = enriched.filter((e) => e.trip.tipo_viaje === tipo);
    let ingreso = 0;
    let utilidad = 0;
    let km = 0;
    for (const { fin } of rows) {
      ingreso += fin.ingreso;
      utilidad += fin.utilidad;
      km += fin.km_recorridos;
    }
    return {
      tipo_viaje: tipo,
      viajes: rows.length,
      ingreso,
      utilidad,
      km,
      margen: ingreso > 0 ? (utilidad / ingreso) * 100 : 0,
    };
  });
}

function buildByRoute(enriched: TripWithFin[]) {
  const map = new Map<
    string,
    { origen: string; destino: string; viajes: number; ingreso: number; utilidad: number; km: number }
  >();
  for (const { trip, fin } of enriched) {
    const key = `${trip.origen}|||${trip.destino}`;
    const row = map.get(key) ?? {
      origen: trip.origen,
      destino: trip.destino,
      viajes: 0,
      ingreso: 0,
      utilidad: 0,
      km: 0,
    };
    row.viajes += 1;
    row.ingreso += fin.ingreso;
    row.utilidad += fin.utilidad;
    row.km += fin.km_recorridos;
    map.set(key, row);
  }
  return [...map.values()]
    .map((r) => ({
      ...r,
      margen: r.ingreso > 0 ? (r.utilidad / r.ingreso) * 100 : 0,
    }))
    .sort((a, b) => b.utilidad - a.utilidad);
}

function buildByExpenseCategory(enriched: TripWithFin[]) {
  const map = new Map<ExpenseCat, number>();
  for (const cat of EXPENSE_CATS) map.set(cat, 0);
  for (const { trip } of enriched) {
    for (const e of trip.expenses ?? []) {
      if (e.tipo === "ingreso") continue;
      const cat = EXPENSE_CATS.includes(e.categoria as ExpenseCat) ? (e.categoria as ExpenseCat) : "otros";
      const monto = Number(e.monto) || 0;
      map.set(cat, (map.get(cat) ?? 0) + monto);
    }
  }
  const total = [...map.values()].reduce((a, v) => a + v, 0);
  return EXPENSE_CATS.map((categoria) => ({
    categoria,
    monto: map.get(categoria) ?? 0,
    pct: total > 0 ? ((map.get(categoria) ?? 0) / total) * 100 : 0,
  }));
}

function buildCostBreakdown(totales: ReturnType<typeof buildTotals>) {
  const gastos = Math.max(0, totales.costo_total - totales.diesel_total - totales.comision_total);
  return {
    diesel: totales.diesel_total,
    comisiones: totales.comision_total,
    gastos,
  };
}

function buildNegativeTrips(
  enriched: TripWithFin[],
  trucks: Truck[],
  drivers: Driver[],
  clients: Client[],
) {
  const truckById = (id: string) => trucks.find((t) => t.id === id);
  const driverById = (id: string) => drivers.find((d) => d.id === id);
  const clientById = (id: string) => clients.find((c) => c.id === id);

  return enriched
    .filter(({ fin }) => fin.utilidad < 0)
    .map(({ trip, fin }) => {
      const tk = truckById(trip.truck_id);
      const dr = driverById(trip.driver_id);
      const cl = trip.client_id ? clientById(trip.client_id) : undefined;
      return {
        trip_id: trip.id,
        folio: trip.folio,
        fecha_salida: tripSalidaIso(trip).slice(0, 10),
        origen: trip.origen,
        destino: trip.destino,
        razon_social: cl?.razon_social ?? null,
        operador: dr?.nombre ?? "—",
        numero_economico: tk?.numero_economico ?? "—",
        ingreso: fin.ingreso,
        costo_total: fin.costo_total,
        utilidad: fin.utilidad,
        margen: fin.margen_pct,
        km: fin.km_recorridos,
      };
    })
    .sort((a, b) => a.utilidad - b.utilidad);
}

function buildByTrip(
  enriched: TripWithFin[],
  trucks: Truck[],
  drivers: Driver[],
  clients: Client[],
  criterio: CriterioFecha = "salida",
) {
  const truckById = (id: string) => trucks.find((t) => t.id === id);
  const driverById = (id: string) => drivers.find((d) => d.id === id);
  const clientById = (id: string) => clients.find((c) => c.id === id);

  return enriched
    .map(({ trip, fin }) => {
      const tk = truckById(trip.truck_id);
      const dr = driverById(trip.driver_id);
      const cl = trip.client_id ? clientById(trip.client_id) : undefined;
      const fechaRef = tripFechaIso(trip, criterio).slice(0, 10);
      return {
        trip_id: trip.id,
        folio: trip.folio,
        fecha_salida: tripSalidaIso(trip).slice(0, 10),
        fecha_llegada: trip.fecha_llegada ? tripLlegadaIso(trip).slice(0, 10) : null,
        fecha_ref: fechaRef,
        origen: trip.origen,
        destino: trip.destino,
        razon_social: cl?.razon_social ?? null,
        operador: dr?.nombre ?? "—",
        numero_economico: tk?.numero_economico ?? "—",
        ingreso: fin.ingreso,
        diesel_total: fin.diesel_total,
        gastos_total: fin.gastos_total,
        comision: fin.comision,
        costo_total: fin.costo_total,
        utilidad: fin.utilidad,
        margen: fin.margen_pct,
        km: fin.km_recorridos,
      };
    })
    .sort((a, b) => a.fecha_ref.localeCompare(b.fecha_ref) || a.folio.localeCompare(b.folio));
}

function buildOverview(
  trips: Trip[],
  trucks: Truck[],
  drivers: Driver[],
  clients: Client[],
  desde?: string,
  hasta?: string,
  criterio: CriterioFecha = "salida",
) {
  const closed = filterClosed(trips, desde, hasta, criterio);
  const enriched = enrichTrips(closed, drivers);
  const totales = buildTotals(enriched);
  return {
    totales,
    by_time: buildByTime(enriched, desde, hasta, criterio),
    by_truck: buildByTruck(enriched, trucks),
    by_driver: buildByDriver(enriched, drivers),
    by_client: buildByClient(enriched, clients),
    by_tipo_viaje: buildByTipoViaje(enriched),
    by_route: buildByRoute(enriched),
    by_expense_category: buildByExpenseCategory(enriched),
    cost_breakdown: buildCostBreakdown(totales),
    negative_trips: buildNegativeTrips(enriched, trucks, drivers, clients),
    by_trip: buildByTrip(enriched, trucks, drivers, clients, criterio),
  };
}

async function loadReportData(tenantId: string) {
  const [trips, trucks, drivers, clients] = await Promise.all([
    Trip.findAll({
      where: { tenant_id: tenantId },
      include: [
        { association: "statuses", through: { attributes: [] } },
        { association: "fuel" },
        { association: "expenses" },
        {
          model: Driver,
          attributes: [
            "id",
            "nombre",
            "comision_tipo",
            "comision_valor",
            "comision_valor_local",
            "comision_valor_foraneo",
          ],
        },
      ],
    }),
    Truck.findAll({ where: { tenant_id: tenantId } }),
    Driver.findAll({ where: { tenant_id: tenantId } }),
    Client.findAll({ where: { tenant_id: tenantId } }),
  ]);
  return { trips, trucks, drivers, clients };
}

export const getAggregates = asyncHandler(async (req: Request, res: Response) => {
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const desde = parsed.data.desde;
  const hasta = parsed.data.hasta;
  const criterio_fecha = parsed.data.criterio_fecha ?? "salida";
  const tenantId = req.user!.tenantId;

  const { trips, trucks, drivers, clients } = await loadReportData(tenantId);
  const overview = buildOverview(trips, trucks, drivers, clients, desde, hasta, criterio_fecha);

  res.json({
    filtros: { desde: desde ?? null, hasta: hasta ?? null, criterio_fecha },
    by_truck: overview.by_truck,
    by_driver: overview.by_driver,
    by_client: overview.by_client,
  });
});

export const getOverview = asyncHandler(async (req: Request, res: Response) => {
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const desde = parsed.data.desde;
  const hasta = parsed.data.hasta;
  const criterio_fecha = parsed.data.criterio_fecha ?? "salida";
  const tenantId = req.user!.tenantId;

  const { trips, trucks, drivers, clients } = await loadReportData(tenantId);
  const current = buildOverview(trips, trucks, drivers, clients, desde, hasta, criterio_fecha);

  let variacion: Record<string, number | null> | null = null;
  let periodo_anterior: { desde: string; hasta: string } | null = null;

  if (desde && hasta) {
    periodo_anterior = previousPeriod(desde, hasta);
    const prev = buildOverview(
      trips,
      trucks,
      drivers,
      clients,
      periodo_anterior.desde,
      periodo_anterior.hasta,
      criterio_fecha,
    );
    variacion = {
      ingreso_pct: pctChange(current.totales.ingreso, prev.totales.ingreso),
      costo_pct: pctChange(current.totales.costo_total, prev.totales.costo_total),
      utilidad_pct: pctChange(current.totales.utilidad, prev.totales.utilidad),
      margen_pct: pctChange(current.totales.margen, prev.totales.margen),
      viajes_pct: pctChange(current.totales.viajes, prev.totales.viajes),
      km_pct: pctChange(current.totales.km, prev.totales.km),
    };
  }

  res.json({
    periodo: { desde: desde ?? null, hasta: hasta ?? null, criterio_fecha },
    periodo_anterior,
    totales: current.totales,
    variacion,
    by_time: current.by_time,
    by_truck: current.by_truck,
    by_driver: current.by_driver,
    by_client: current.by_client,
    by_tipo_viaje: current.by_tipo_viaje,
    by_route: current.by_route,
    by_expense_category: current.by_expense_category,
    cost_breakdown: current.cost_breakdown,
    negative_trips: current.negative_trips,
    by_trip: current.by_trip,
  });
});
