import { Op } from "sequelize";
import { FuelTicket, Trip, Truck } from "../models";
import type { FuelTicket as FuelTicketModel } from "../models/FuelTicket";
import type { Trip as TripModel } from "../models/Trip";
import { num } from "../utils/numbers";

export function tripKmRecorridos(trip: TripModel): number {
  if (trip.km_final == null) return 0;
  return Math.max(0, trip.km_final - trip.km_inicial);
}

function dateOnly(d: Date | string): string {
  if (typeof d === "string") return d.slice(0, 10);
  return d.toISOString().slice(0, 10);
}

function compareTicketOrder(a: FuelTicketModel, b: FuelTicketModel): number {
  const da = dateOnly(a.fecha);
  const db = dateOnly(b.fecha);
  if (da !== db) return da < db ? -1 : 1;
  const ha = a.hora ? String(a.hora) : "00:00:00";
  const hb = b.hora ? String(b.hora) : "00:00:00";
  return ha.localeCompare(hb);
}

export type ProratedTripRow = {
  trip_id: string;
  folio: string;
  origen: string;
  destino: string;
  fecha_salida: string;
  km_recorridos: number;
  litros_asignados: number;
  costo_asignado: number;
};

export type ProratedTicketBlock = {
  ticket_id: string;
  fecha: string;
  hora?: string;
  litros: number;
  precio_litro: number;
  importe_total: number;
  odometro: number;
  ubicacion: string;
  km_total_periodo: number;
  rendimiento_periodo: number | null;
  sin_asignar: boolean;
  viajes: ProratedTripRow[];
};

export type ProrationRangeResult = {
  truck_id: string;
  numero_economico: string;
  inicio: string;
  fin: string;
  tickets: ProratedTicketBlock[];
  resumen: {
    total_litros: number;
    total_km_viajes: number;
    total_viajes: number;
    rendimiento: number | null;
  };
};

export type FuelSummaryRow = {
  truck_id: string;
  numero_economico: string;
  placas: string;
  viajes: number;
  km_recorridos: number;
  litros: number;
  rendimiento: number | null;
};

function buildProratedBlock(
  ticket: FuelTicketModel,
  prevFecha: string | null,
  tripsInWindow: TripModel[],
): ProratedTicketBlock {
  const litros = num(ticket.litros);
  const precio = num(ticket.precio_litro);
  const withKm = tripsInWindow
    .map((t) => ({ trip: t, km: tripKmRecorridos(t) }))
    .filter((x) => x.km > 0);
  const kmTotal = withKm.reduce((s, x) => s + x.km, 0);

  const viajes: ProratedTripRow[] = withKm.map(({ trip, km }) => {
    const litrosAsignados = kmTotal > 0 ? (litros * km) / kmTotal : 0;
    return {
      trip_id: String(trip.id),
      folio: trip.folio,
      origen: trip.origen,
      destino: trip.destino,
      fecha_salida: dateOnly(trip.fecha_salida),
      km_recorridos: km,
      litros_asignados: Math.round(litrosAsignados * 100) / 100,
      costo_asignado: Math.round(litrosAsignados * precio * 100) / 100,
    };
  });

  return {
    ticket_id: String(ticket.id),
    fecha: dateOnly(ticket.fecha),
    hora: ticket.hora ? String(ticket.hora).slice(0, 8) : undefined,
    litros,
    precio_litro: precio,
    importe_total: num(ticket.importe_total),
    odometro: ticket.odometro,
    ubicacion: ticket.ubicacion,
    km_total_periodo: kmTotal,
    rendimiento_periodo: litros > 0 && kmTotal > 0 ? Math.round((kmTotal / litros) * 100) / 100 : null,
    sin_asignar: viajes.length === 0,
    viajes,
  };
}

function tripsBetweenDates(
  allTrips: TripModel[],
  truckId: string,
  afterExclusive: string | null,
  throughInclusive: string,
): TripModel[] {
  return allTrips.filter((t) => {
    if (String(t.truck_id) !== truckId) return false;
    const fd = dateOnly(t.fecha_salida);
    if (afterExclusive != null && fd <= afterExclusive) return false;
    if (fd > throughInclusive) return false;
    return true;
  });
}

export async function prorateRange(
  tenantId: string,
  truckId: string,
  inicio: string,
  fin: string,
): Promise<ProrationRangeResult> {
  const truck = await Truck.findOne({ where: { id: truckId, tenant_id: tenantId } });
  if (!truck) throw Object.assign(new Error("Camión no encontrado"), { status: 404 });

  const ticketsInRange = await FuelTicket.findAll({
    where: {
      tenant_id: tenantId,
      truck_id: truckId,
      fecha: { [Op.between]: [inicio, fin] },
    },
    order: [
      ["fecha", "ASC"],
      ["hora", "ASC"],
    ],
  });

  const anchorTicket = await FuelTicket.findOne({
    where: {
      tenant_id: tenantId,
      truck_id: truckId,
      fecha: { [Op.lt]: inicio },
    },
    order: [
      ["fecha", "DESC"],
      ["hora", "DESC"],
    ],
  });

  const allTrips = await Trip.findAll({
    where: { tenant_id: tenantId, truck_id: truckId },
    order: [["fecha_salida", "ASC"]],
  });

  const sorted = [...ticketsInRange].sort(compareTicketOrder);
  const blocks: ProratedTicketBlock[] = [];
  let prevFecha: string | null = anchorTicket ? dateOnly(anchorTicket.fecha) : null;

  if (sorted.length > 0 && prevFecha == null) {
    const firstTrip = allTrips[0];
    if (firstTrip) prevFecha = dateOnly(firstTrip.fecha_salida);
  }

  for (const ticket of sorted) {
    const ticketFecha = dateOnly(ticket.fecha);
    const windowTrips = tripsBetweenDates(allTrips, truckId, prevFecha, ticketFecha);
    blocks.push(buildProratedBlock(ticket, prevFecha, windowTrips));
    prevFecha = ticketFecha;
  }

  const totalLitros = sorted.reduce((s, t) => s + num(t.litros), 0);
  const tripIdsInPeriod = new Set<string>();
  let totalKm = 0;
  for (const t of allTrips) {
    const fd = dateOnly(t.fecha_salida);
    if (fd >= inicio && fd <= fin) {
      tripIdsInPeriod.add(String(t.id));
      totalKm += tripKmRecorridos(t);
    }
  }

  return {
    truck_id: truckId,
    numero_economico: truck.numero_economico,
    inicio,
    fin,
    tickets: blocks,
    resumen: {
      total_litros: Math.round(totalLitros * 100) / 100,
      total_km_viajes: totalKm,
      total_viajes: tripIdsInPeriod.size,
      rendimiento: totalLitros > 0 ? Math.round((totalKm / totalLitros) * 100) / 100 : null,
    },
  };
}

export async function fuelSummaryByTruck(
  tenantId: string,
  inicio: string,
  fin: string,
): Promise<FuelSummaryRow[]> {
  const trucks = await Truck.findAll({
    where: { tenant_id: tenantId, estatus: { [Op.ne]: "baja" } },
    order: [["numero_economico", "ASC"]],
  });

  const tickets = await FuelTicket.findAll({
    where: {
      tenant_id: tenantId,
      fecha: { [Op.between]: [inicio, fin] },
    },
  });

  const trips = await Trip.findAll({
    where: {
      tenant_id: tenantId,
      fecha_salida: {
        [Op.gte]: new Date(`${inicio}T00:00:00.000Z`),
        [Op.lte]: new Date(`${fin}T23:59:59.999Z`),
      },
    },
  });

  const litrosByTruck = new Map<string, number>();
  for (const tk of tickets) {
    const id = String(tk.truck_id);
    litrosByTruck.set(id, (litrosByTruck.get(id) ?? 0) + num(tk.litros));
  }

  const rows: FuelSummaryRow[] = [];
  for (const truck of trucks) {
    const tid = String(truck.id);
    const truckTrips = trips.filter((t) => String(t.truck_id) === tid);
    const km = truckTrips.reduce((s, t) => s + tripKmRecorridos(t), 0);
    const litros = litrosByTruck.get(tid) ?? 0;
    if (litros === 0 && km === 0 && truckTrips.length === 0) continue;
    rows.push({
      truck_id: tid,
      numero_economico: truck.numero_economico,
      placas: truck.placas,
      viajes: truckTrips.length,
      km_recorridos: km,
      litros: Math.round(litros * 100) / 100,
      rendimiento: litros > 0 ? Math.round((km / litros) * 100) / 100 : null,
    });
  }

  return rows;
}

export type FuelProrationAllResult = {
  inicio: string;
  fin: string;
  unidades: ProrationRangeResult[];
};

/** Prorratea todas las unidades activas que tengan al menos un ticket en el período. */
export async function prorateRangeAll(
  tenantId: string,
  inicio: string,
  fin: string,
): Promise<FuelProrationAllResult> {
  const trucks = await Truck.findAll({
    where: { tenant_id: tenantId, estatus: { [Op.ne]: "baja" } },
    order: [["numero_economico", "ASC"]],
  });

  const unidades: ProrationRangeResult[] = [];
  for (const truck of trucks) {
    const report = await prorateRange(tenantId, String(truck.id), inicio, fin);
    if (report.tickets.length > 0) unidades.push(report);
  }

  return { inicio, fin, unidades };
}
