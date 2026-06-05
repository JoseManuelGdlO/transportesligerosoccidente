import { Op } from "sequelize";
import { FuelTicket, Trip, Truck } from "../models";
import { getAssignmentsForTruck } from "./fuelProrationAssignmentService";
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

/** Fecha+hora como reloj UTC (convención compartida tickets/viajes). */
export function utcWallClockMs(dateStr: string, timeStr = "00:00:00"): number {
  const h = timeStr.slice(0, 8);
  return new Date(`${dateStr}T${h}.000Z`).getTime();
}

/** Marca de tiempo del ticket (fecha + hora) para delimitar ventanas sin colisiones el mismo día. */
export function ticketTimestampMs(ticket: FuelTicketModel): number {
  const h = ticket.hora ? String(ticket.hora).slice(0, 8) : "00:00:00";
  return utcWallClockMs(dateOnly(ticket.fecha), h);
}

export function tripTimestampMs(trip: TripModel): number {
  const iso = trip.fecha_salida.toISOString();
  return utcWallClockMs(iso.slice(0, 10), iso.slice(11, 19));
}

function endOfDayMs(dateStr: string): number {
  return new Date(`${dateStr}T23:59:59.999Z`).getTime();
}

/** Límite superior de la ventana de consumo del ticket (hasta la siguiente carga o fin de período). */
export function ticketWindowEndMs(ticket: FuelTicketModel, nextTicket: FuelTicketModel | null, fin: string): number {
  if (!nextTicket) return endOfDayMs(fin);
  if (dateOnly(ticket.fecha) === dateOnly(nextTicket.fecha)) {
    return ticketTimestampMs(nextTicket);
  }
  return endOfDayMs(dateOnly(ticket.fecha));
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
  asignacion_manual?: boolean;
};

/** Viaje referenciado sin prorrateo (sin ticket o sin km). */
export type FuelProrationTripRef = {
  trip_id: string;
  folio: string;
  origen: string;
  destino: string;
  fecha_salida: string;
  km_recorridos: number;
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
  viajes_sin_asignar: FuelProrationTripRef[];
  viajes_sin_km: FuelProrationTripRef[];
  resumen: {
    total_litros: number;
    total_km_viajes: number;
    /** Viajes con litros asignados a algún ticket (coincide con las tablas). */
    total_viajes: number;
    /** Viajes con fecha_salida dentro del filtro Desde–Hasta. */
    viajes_en_periodo: number;
    viajes_sin_asignar: number;
    viajes_sin_km: number;
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
  tripsInWindow: TripModel[],
  manualTripIds: Set<string> = new Set(),
): ProratedTicketBlock {
  const litros = num(ticket.litros);
  const precio = num(ticket.precio_litro);
  const withKm = tripsInWindow
    .map((t) => ({ trip: t, km: tripKmRecorridos(t) }))
    .filter((x) => x.km > 0);
  const kmTotal = withKm.reduce((s, x) => s + x.km, 0);

  const viajes: ProratedTripRow[] = withKm.map(({ trip, km }) => {
    const litrosAsignados = kmTotal > 0 ? (litros * km) / kmTotal : 0;
    const tripId = String(trip.id);
    return {
      trip_id: tripId,
      folio: trip.folio,
      origen: trip.origen,
      destino: trip.destino,
      fecha_salida: dateOnly(trip.fecha_salida),
      km_recorridos: km,
      litros_asignados: Math.round(litrosAsignados * 100) / 100,
      costo_asignado: Math.round(litrosAsignados * precio * 100) / 100,
      ...(manualTripIds.has(tripId) ? { asignacion_manual: true } : {}),
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

/** Viajes cuya salida cae en (afterExclusiveMs, throughInclusiveMs]. */
export function tripsInWindow(
  allTrips: TripModel[],
  truckId: string,
  afterExclusiveMs: number | null,
  throughInclusiveMs: number,
): TripModel[] {
  return allTrips.filter((t) => {
    if (String(t.truck_id) !== truckId) return false;
    const ts = tripTimestampMs(t);
    if (afterExclusiveMs != null && ts <= afterExclusiveMs) return false;
    if (ts > throughInclusiveMs) return false;
    return true;
  });
}

function tripsInPeriod(allTrips: TripModel[], inicio: string, fin: string): TripModel[] {
  return allTrips.filter((t) => {
    const fd = dateOnly(t.fecha_salida);
    return fd >= inicio && fd <= fin;
  });
}

function tripToRef(trip: TripModel): FuelProrationTripRef {
  return {
    trip_id: String(trip.id),
    folio: trip.folio,
    origen: trip.origen,
    destino: trip.destino,
    fecha_salida: dateOnly(trip.fecha_salida),
    km_recorridos: tripKmRecorridos(trip),
  };
}

function assignedTripIdsFromBlocks(blocks: ProratedTicketBlock[]): Set<string> {
  const ids = new Set<string>();
  for (const block of blocks) {
    for (const v of block.viajes) ids.add(v.trip_id);
  }
  return ids;
}

/** Resumen alineado con los viajes efectivamente prorrateados en los bloques (misma base que las tablas). */
export function resumenFromBlocks(
  blocks: ProratedTicketBlock[],
  totalLitros: number,
  periodTrips: TripModel[],
  viajesSinAsignar: FuelProrationTripRef[],
  viajesSinKm: FuelProrationTripRef[],
): ProrationRangeResult["resumen"] {
  const tripIds = new Set<string>();
  let totalKm = 0;
  for (const block of blocks) {
    for (const v of block.viajes) {
      tripIds.add(v.trip_id);
      totalKm += v.km_recorridos;
    }
  }
  return {
    total_litros: Math.round(totalLitros * 100) / 100,
    total_km_viajes: totalKm,
    total_viajes: tripIds.size,
    viajes_en_periodo: periodTrips.length,
    viajes_sin_asignar: viajesSinAsignar.length,
    viajes_sin_km: viajesSinKm.length,
    rendimiento: totalLitros > 0 && totalKm > 0 ? Math.round((totalKm / totalLitros) * 100) / 100 : null,
  };
}

export function partitionPeriodTrips(
  periodTrips: TripModel[],
  assignedIds: Set<string>,
): { sinAsignar: FuelProrationTripRef[]; sinKm: FuelProrationTripRef[] } {
  const sinAsignar: FuelProrationTripRef[] = [];
  const sinKm: FuelProrationTripRef[] = [];
  for (const trip of periodTrips) {
    const km = tripKmRecorridos(trip);
    if (km <= 0) {
      sinKm.push(tripToRef(trip));
      continue;
    }
    if (!assignedIds.has(String(trip.id))) sinAsignar.push(tripToRef(trip));
  }
  return { sinAsignar, sinKm };
}

export function buildProrationBlocks(
  sorted: FuelTicketModel[],
  allTrips: TripModel[],
  truckId: string,
  fin: string,
  anchorTicket: FuelTicketModel | null,
): ProratedTicketBlock[] {
  const blocks: ProratedTicketBlock[] = [];
  let prevEndMs: number | null = anchorTicket ? ticketTimestampMs(anchorTicket) : null;

  if (sorted.length > 0 && prevEndMs == null) {
    const firstTrip = allTrips[0];
    const firstTicketDate = dateOnly(sorted[0]!.fecha);
    if (firstTrip && dateOnly(firstTrip.fecha_salida) < firstTicketDate) {
      prevEndMs = endOfDayMs(dateOnly(firstTrip.fecha_salida));
    }
  }

  for (let i = 0; i < sorted.length; i++) {
    const ticket = sorted[i]!;
    const nextTicket = sorted[i + 1] ?? null;
    const throughMs = ticketWindowEndMs(ticket, nextTicket, fin);
    const windowStartMs = Math.max(
      prevEndMs ?? Number.NEGATIVE_INFINITY,
      ticketTimestampMs(ticket),
    );
    const windowTrips = tripsInWindow(allTrips, truckId, windowStartMs, throughMs);
    blocks.push(buildProratedBlock(ticket, windowTrips));
    prevEndMs = throughMs;
  }

  return blocks;
}

/** Aplica overrides manuales trip→ticket sobre bloques automáticos y recalcula litros por km. */
export function applyManualAssignments(
  blocks: ProratedTicketBlock[],
  sortedTickets: FuelTicketModel[],
  manualMap: Map<string, string>,
  allTrips: TripModel[],
): ProratedTicketBlock[] {
  if (manualMap.size === 0) return blocks;

  const tripById = new Map(allTrips.map((t) => [String(t.id), t]));
  const ticketById = new Map(sortedTickets.map((t) => [String(t.id), t]));
  const validManual = new Map(
    [...manualMap].filter(([, ticketId]) => ticketById.has(ticketId)),
  );
  if (validManual.size === 0) return blocks;

  const manualTripIds = new Set(validManual.keys());

  const tripsPerBlock = new Map<string, TripModel[]>();
  for (const block of blocks) {
    const trips = block.viajes
      .filter((v) => !manualTripIds.has(v.trip_id))
      .map((v) => tripById.get(v.trip_id))
      .filter((t): t is TripModel => t != null);
    tripsPerBlock.set(block.ticket_id, trips);
  }

  for (const [tripId, ticketId] of validManual) {
    const trip = tripById.get(tripId);
    if (!trip || tripKmRecorridos(trip) <= 0) continue;
    const list = tripsPerBlock.get(ticketId) ?? [];
    if (!list.some((t) => String(t.id) === tripId)) list.push(trip);
    tripsPerBlock.set(ticketId, list);
  }

  return blocks.map((block) => {
    const ticket = ticketById.get(block.ticket_id);
    if (!ticket) return block;
    const trips = tripsPerBlock.get(block.ticket_id) ?? [];
    return buildProratedBlock(ticket, trips, manualTripIds);
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
  const manualMap = await getAssignmentsForTruck(tenantId, truckId);
  let blocks = buildProrationBlocks(sorted, allTrips, truckId, fin, anchorTicket);
  blocks = applyManualAssignments(blocks, sorted, manualMap, allTrips);

  const totalLitros = sorted.reduce((s, t) => s + num(t.litros), 0);
  const periodTrips = tripsInPeriod(allTrips, inicio, fin);
  const assignedIds = assignedTripIdsFromBlocks(blocks);
  const { sinAsignar, sinKm } = partitionPeriodTrips(periodTrips, assignedIds);

  return {
    truck_id: truckId,
    numero_economico: truck.numero_economico,
    inicio,
    fin,
    tickets: blocks,
    viajes_sin_asignar: sinAsignar,
    viajes_sin_km: sinKm,
    resumen: resumenFromBlocks(blocks, totalLitros, periodTrips, sinAsignar, sinKm),
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
