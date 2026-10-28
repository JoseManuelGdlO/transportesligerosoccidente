import { randomUUID } from "node:crypto";
import { Op, type Transaction } from "sequelize";
import { FuelLoad, FuelProrationAssignment, FuelTicket, Route, Trip, Truck, sequelize } from "../models";
import {
  getConfirmedTripIdsForTruck,
  getDraftAssignmentsForTruck,
  saveDraftAssignmentsForTruck,
} from "./fuelProrationAssignmentService";
import type { FuelTicket as FuelTicketModel } from "../models/FuelTicket";
import type { Trip as TripModel } from "../models/Trip";
import { num } from "../utils/numbers";
import { tripRouteLabelFromModel } from "./tripRouteLabel";

function runInTransaction<T>(existing: Transaction | undefined, fn: (t: Transaction) => Promise<T>): Promise<T> {
  if (existing) return fn(existing);
  return sequelize.transaction(fn);
}

export type FuelProrationEstado = "pendiente" | "confirmado";

const tripWithRouteInclude = {
  model: Route,
  attributes: ["id", "nombre"],
  required: false,
};

/** Nombre de ruta del catálogo; si no hay, recorrido de paradas o origen → destino. */
export function tripRutaLabel(trip: TripModel): string {
  return tripRouteLabelFromModel(trip);
}

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

function compareTripOrder(a: TripModel, b: TripModel): number {
  const ta = tripTimestampMs(a);
  const tb = tripTimestampMs(b);
  if (ta !== tb) return ta - tb;
  return a.folio.localeCompare(b.folio);
}

function compareProratedTripRow(a: ProratedTripRow, b: ProratedTripRow): number {
  if (a.fecha_salida !== b.fecha_salida) return a.fecha_salida < b.fecha_salida ? -1 : 1;
  return a.folio.localeCompare(b.folio);
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
  ruta: string;
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
  ruta: string;
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
  prorrateo_confirmado_at?: string | null;
  es_foraneo?: boolean;
  source_trip_id?: string | null;
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

export function buildProratedBlock(
  ticket: FuelTicketModel,
  tripsInWindow: TripModel[],
  manualTripIds: Set<string> = new Set(),
): ProratedTicketBlock {
  const litros = num(ticket.litros);
  const precio = num(ticket.precio_litro);
  const importe = num(ticket.importe_total);
  const withKm = tripsInWindow
    .map((t) => ({ trip: t, km: tripKmRecorridos(t) }))
    .filter((x) => x.km > 0)
    .sort((a, b) => compareTripOrder(a.trip, b.trip));
  const kmTotal = withKm.reduce((s, x) => s + x.km, 0);
  const shares = allocateByKm(
    litros,
    importe,
    withKm.map(({ trip, km }) => ({ trip_id: String(trip.id), km })),
  );
  const shareByTrip = new Map(shares.map((s) => [s.trip_id, s]));

  const viajes: ProratedTripRow[] = withKm.map(({ trip, km }) => {
    const tripId = String(trip.id);
    const share = shareByTrip.get(tripId);
    return {
      trip_id: tripId,
      folio: trip.folio,
      origen: trip.origen,
      destino: trip.destino,
      ruta: tripRutaLabel(trip),
      fecha_salida: dateOnly(trip.fecha_salida),
      km_recorridos: km,
      litros_asignados: share?.litros_asignados ?? 0,
      costo_asignado: share?.costo_asignado ?? 0,
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
    prorrateo_confirmado_at: ticket.prorrateo_confirmado_at
      ? ticket.prorrateo_confirmado_at.toISOString()
      : null,
    es_foraneo: !!ticket.es_foraneo,
    source_trip_id: ticket.source_trip_id ? String(ticket.source_trip_id) : null,
    viajes,
  };
}

export function isPatioTicket(ticket: { es_foraneo?: boolean | null }): boolean {
  return !ticket.es_foraneo;
}

export function allocateByKm(
  litros: number,
  importe: number,
  trips: { trip_id: string; km: number }[],
): { trip_id: string; litros_asignados: number; costo_asignado: number }[] {
  const kmTotal = trips.reduce((s, t) => s + t.km, 0);
  if (kmTotal <= 0 || trips.length === 0) return [];
  const rows = trips.map((t) => {
    const share = t.km / kmTotal;
    return {
      trip_id: t.trip_id,
      litros_asignados: Math.round(litros * share * 100) / 100,
      costo_asignado: Math.round(importe * share * 100) / 100,
    };
  });
  const last = rows[rows.length - 1]!;
  const litrosSum = rows.reduce((s, r) => s + r.litros_asignados, 0);
  const costoSum = rows.reduce((s, r) => s + r.costo_asignado, 0);
  last.litros_asignados = Math.round((last.litros_asignados + (litros - litrosSum)) * 100) / 100;
  last.costo_asignado = Math.round((last.costo_asignado + (importe - costoSum)) * 100) / 100;
  return rows;
}

type TankSegment = {
  openMs: number;
  closeMs: number | null;
  tickets: FuelTicketModel[];
};

export function buildTankBlocks(
  tickets: FuelTicketModel[],
  trips: TripModel[],
): ProratedTicketBlock[] {
  const sortedTickets = [...tickets].sort(compareTicketOrder);
  const patio = sortedTickets.filter((t) => isPatioTicket(t));
  const segments: TankSegment[] = [];

  for (let i = 0; i < patio.length; i++) {
    const open = patio[i]!;
    const next = patio[i + 1] ?? null;
    segments.push({
      openMs: ticketTimestampMs(open),
      closeMs: next ? ticketTimestampMs(next) : null,
      tickets: [open],
    });
  }

  for (const ticket of sortedTickets) {
    if (isPatioTicket(ticket)) continue;
    const ts = ticketTimestampMs(ticket);
    const host = [...segments].reverse().find((s) => s.openMs <= ts && (s.closeMs == null || ts < s.closeMs));
    if (host) {
      host.tickets.push(ticket);
      continue;
    }
    const nextPatio = patio.find((p) => ticketTimestampMs(p) > ts) ?? null;
    segments.push({
      openMs: ts,
      closeMs: nextPatio ? ticketTimestampMs(nextPatio) : null,
      tickets: [ticket],
    });
  }

  const withKm = trips
    .map((trip) => ({ trip, km: tripKmRecorridos(trip) }))
    .filter((x) => x.km > 0)
    .sort((a, b) => compareTripOrder(a.trip, b.trip));

  const blocks: ProratedTicketBlock[] = [];
  for (const segment of segments) {
    const segmentTrips = withKm.filter(({ trip }) => {
      const ts = tripTimestampMs(trip);
      if (ts <= segment.openMs) return false;
      if (segment.closeMs != null && ts >= segment.closeMs) return false;
      return true;
    });
    const kmTotal = segmentTrips.reduce((s, x) => s + x.km, 0);
    for (const ticket of segment.tickets) {
      const litros = num(ticket.litros);
      const importe = num(ticket.importe_total);
      const shares = allocateByKm(
        litros,
        importe,
        segmentTrips.map(({ trip, km }) => ({ trip_id: String(trip.id), km })),
      );
      const shareByTrip = new Map(shares.map((s) => [s.trip_id, s]));
      blocks.push({
        ticket_id: String(ticket.id),
        fecha: dateOnly(ticket.fecha),
        hora: ticket.hora ? String(ticket.hora).slice(0, 8) : undefined,
        litros,
        precio_litro: num(ticket.precio_litro),
        importe_total: importe,
        odometro: ticket.odometro,
        ubicacion: ticket.ubicacion,
        km_total_periodo: kmTotal,
        rendimiento_periodo: litros > 0 && kmTotal > 0 ? Math.round((kmTotal / litros) * 100) / 100 : null,
        sin_asignar: segmentTrips.length === 0,
        prorrateo_confirmado_at: ticket.prorrateo_confirmado_at
          ? ticket.prorrateo_confirmado_at.toISOString()
          : null,
        es_foraneo: !!ticket.es_foraneo,
        source_trip_id: ticket.source_trip_id ? String(ticket.source_trip_id) : null,
        viajes: segmentTrips.map(({ trip, km }) => {
          const share = shareByTrip.get(String(trip.id));
          return {
            trip_id: String(trip.id),
            folio: trip.folio,
            origen: trip.origen,
            destino: trip.destino,
            ruta: tripRutaLabel(trip),
            fecha_salida: dateOnly(trip.fecha_salida),
            km_recorridos: km,
            litros_asignados: share?.litros_asignados ?? 0,
            costo_asignado: share?.costo_asignado ?? 0,
          };
        }),
      });
    }
  }

  return blocks.sort((a, b) => {
    if (a.fecha !== b.fecha) return a.fecha < b.fecha ? -1 : 1;
    return (a.hora ?? "").localeCompare(b.hora ?? "");
  });
}

function buildEmptyTicketBlock(ticket: FuelTicketModel): ProratedTicketBlock {
  return buildProratedBlock(ticket, []);
}

function buildBlocksFromDraftMap(
  sortedTickets: FuelTicketModel[],
  draftAssignments: { trip_id: string; fuel_ticket_id: string }[],
  allTrips: TripModel[],
): ProratedTicketBlock[] {
  const tripById = new Map(allTrips.map((t) => [String(t.id), t]));
  const tripsPerTicket = new Map<string, TripModel[]>();
  for (const ticket of sortedTickets) {
    tripsPerTicket.set(String(ticket.id), []);
  }
  for (const { trip_id: tripId, fuel_ticket_id: ticketId } of draftAssignments) {
    const trip = tripById.get(tripId);
    if (!trip || tripKmRecorridos(trip) <= 0) {
      // Tickets from trip may be assigned before km_final; still show the trip with 0 km
      // so the block is not empty for source tickets. For auto tickets skip without km.
      const ticket = sortedTickets.find((t) => String(t.id) === ticketId);
      if (ticket?.source_trip_id && trip) {
        const list = tripsPerTicket.get(ticketId);
        if (list && !list.some((x) => String(x.id) === tripId)) list.push(trip);
      }
      continue;
    }
    const list = tripsPerTicket.get(ticketId);
    if (list && !list.some((x) => String(x.id) === tripId)) list.push(trip);
  }
  return sortedTickets.map((ticket) => {
    const trips = tripsPerTicket.get(String(ticket.id)) ?? [];
    return buildProratedBlock(ticket, trips);
  });
}

async function buildConfirmedBlocks(
  tenantId: string,
  tickets: FuelTicketModel[],
  allTrips: TripModel[],
): Promise<ProratedTicketBlock[]> {
  if (tickets.length === 0) return [];

  const ticketIds = tickets.map((t) => String(t.id));
  const assignments = await FuelProrationAssignment.findAll({
    where: { tenant_id: tenantId, fuel_ticket_id: { [Op.in]: ticketIds } },
  });

  const tripById = new Map(allTrips.map((t) => [String(t.id), t]));
  const blocks: ProratedTicketBlock[] = [];

  for (const ticket of tickets) {
    const ticketId = String(ticket.id);
    const rows = assignments.filter((a) => String(a.fuel_ticket_id) === ticketId);
    const viajes: ProratedTripRow[] = [];
    let kmTotal = 0;

    for (const row of rows) {
      const trip = tripById.get(String(row.trip_id));
      if (!trip) continue;
      const km = row.km_recorridos != null ? num(row.km_recorridos) : tripKmRecorridos(trip);
      const litros = row.litros_asignados != null ? num(row.litros_asignados) : 0;
      const costo = row.costo_asignado != null ? num(row.costo_asignado) : 0;
      kmTotal += km;
      viajes.push({
        trip_id: String(trip.id),
        folio: trip.folio,
        origen: trip.origen,
        destino: trip.destino,
        ruta: tripRutaLabel(trip),
        fecha_salida: dateOnly(trip.fecha_salida),
        km_recorridos: km,
        litros_asignados: litros,
        costo_asignado: costo,
      });
    }
    viajes.sort(compareProratedTripRow);

    const litros = num(ticket.litros);
    blocks.push({
      ticket_id: ticketId,
      fecha: dateOnly(ticket.fecha),
      hora: ticket.hora ? String(ticket.hora).slice(0, 8) : undefined,
      litros,
      precio_litro: num(ticket.precio_litro),
      importe_total: num(ticket.importe_total),
      odometro: ticket.odometro,
      ubicacion: ticket.ubicacion,
      km_total_periodo: kmTotal,
      rendimiento_periodo: litros > 0 && kmTotal > 0 ? Math.round((kmTotal / litros) * 100) / 100 : null,
      sin_asignar: viajes.length === 0,
      prorrateo_confirmado_at: ticket.prorrateo_confirmado_at
        ? ticket.prorrateo_confirmado_at.toISOString()
        : null,
      es_foraneo: !!ticket.es_foraneo,
      source_trip_id: ticket.source_trip_id ? String(ticket.source_trip_id) : null,
      viajes,
    });
  }

  return blocks;
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
    ruta: tripRutaLabel(trip),
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
  estado: FuelProrationEstado = "pendiente",
): Promise<ProrationRangeResult> {
  const truck = await Truck.findOne({ where: { id: truckId, tenant_id: tenantId } });
  if (!truck) throw Object.assign(new Error("Camión no encontrado"), { status: 404 });

  const ticketWhere: Record<string, unknown> = {
    tenant_id: tenantId,
    truck_id: truckId,
    fecha: { [Op.between]: [inicio, fin] },
  };
  if (estado === "pendiente") {
    ticketWhere.prorrateo_confirmado_at = null;
  } else {
    ticketWhere.prorrateo_confirmado_at = { [Op.ne]: null };
  }

  const ticketsInRange = await FuelTicket.findAll({
    where: ticketWhere,
    order: [
      ["fecha", "ASC"],
      ["hora", "ASC"],
    ],
  });

  const allTrips = await Trip.findAll({
    where: { tenant_id: tenantId, truck_id: truckId },
    include: [tripWithRouteInclude],
    order: [["fecha_salida", "ASC"]],
  });

  const sorted = [...ticketsInRange].sort(compareTicketOrder);

  let blocks: ProratedTicketBlock[];

  if (estado === "confirmado") {
    blocks = await buildConfirmedBlocks(tenantId, sorted, allTrips);
    const totalLitros = sorted.reduce((s, t) => s + num(t.litros), 0);
    return {
      truck_id: truckId,
      numero_economico: truck.numero_economico,
      inicio,
      fin,
      tickets: blocks,
      viajes_sin_asignar: [],
      viajes_sin_km: [],
      resumen: resumenFromBlocks(blocks, totalLitros, [], [], []),
    };
  }

  const confirmedTripIds = await getConfirmedTripIdsForTruck(tenantId, truckId);
  // Multi-ticket: no excluir viajes de ventanas/asignaciones pendientes solo por estar confirmados.
  const draftAssignments = await getDraftAssignmentsForTruck(tenantId, truckId);

  if (draftAssignments.length > 0) {
    blocks = buildBlocksFromDraftMap(sorted, draftAssignments, allTrips);
  } else {
    blocks = sorted.map((t) => buildEmptyTicketBlock(t));
  }

  const totalLitros = sorted.reduce((s, t) => s + num(t.litros), 0);
  const periodTrips = tripsInPeriod(allTrips, inicio, fin);
  const allAssignedIds = new Set([...assignedTripIdsFromBlocks(blocks), ...confirmedTripIds]);
  const { sinAsignar, sinKm } = partitionPeriodTrips(periodTrips, allAssignedIds);

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

export async function autoProratePending(
  tenantId: string,
  inicio: string,
  fin: string,
): Promise<FuelProrationAllResult> {
  const trucks = await Truck.findAll({
    where: { tenant_id: tenantId, estatus: { [Op.ne]: "baja" } },
    order: [["numero_economico", "ASC"]],
  });

  for (const truck of trucks) {
    const truckId = String(truck.id);

    const allTickets = await FuelTicket.findAll({
      where: {
        tenant_id: tenantId,
        truck_id: truckId,
      },
    });
    const pendingInRange = allTickets.filter((ticket) => {
      if (ticket.prorrateo_confirmado_at) return false;
      const fecha = dateOnly(ticket.fecha);
      return fecha >= inicio && fecha <= fin;
    });
    if (pendingInRange.length === 0) continue;

    const allTrips = await Trip.findAll({
      where: { tenant_id: tenantId, truck_id: truckId },
      include: [tripWithRouteInclude],
      order: [["fecha_salida", "ASC"]],
    });

    const blocks = buildTankBlocks(allTickets, allTrips);
    const pendingIds = new Set(pendingInRange.map((ticket) => String(ticket.id)));

    const draftAssignments: { trip_id: string; fuel_ticket_id: string }[] = [];
    for (const block of blocks) {
      if (!pendingIds.has(block.ticket_id)) continue;
      if (block.fecha < inicio || block.fecha > fin) continue;
      for (const v of block.viajes) {
        draftAssignments.push({ trip_id: v.trip_id, fuel_ticket_id: block.ticket_id });
      }
    }

    await saveDraftAssignmentsForTruck(tenantId, truckId, draftAssignments);
  }

  return prorateRangeAll(tenantId, inicio, fin, "pendiente");
}

export async function confirmTicketProration(
  tenantId: string,
  ticketId: string,
  transaction?: Transaction,
): Promise<void> {
  const ticket = await FuelTicket.findOne({
    where: { id: ticketId, tenant_id: tenantId },
    transaction,
  });
  if (!ticket) throw Object.assign(new Error("Ticket no encontrado"), { status: 404 });
  if (ticket.prorrateo_confirmado_at) {
    throw Object.assign(new Error("El ticket ya está confirmado"), { status: 400 });
  }

  const assignments = await FuelProrationAssignment.findAll({
    where: { tenant_id: tenantId, fuel_ticket_id: ticketId },
    transaction,
  });
  if (assignments.length === 0) {
    throw Object.assign(new Error("El ticket no tiene viajes asignados"), { status: 400 });
  }

  const tripIds = assignments.map((a) => String(a.trip_id));
  const trips = await Trip.findAll({
    where: { tenant_id: tenantId, id: { [Op.in]: tripIds } },
    transaction,
  });

  const withKm = trips.filter((t) => tripKmRecorridos(t) > 0).sort(compareTripOrder);
  if (withKm.length === 0) {
    throw Object.assign(new Error("Ningún viaje asignado tiene km registrado"), { status: 400 });
  }

  const precioLitro = num(ticket.precio_litro);
  const ubicacion = ticket.ubicacion;
  const fuelFecha = new Date(ticketTimestampMs(ticket));
  const ticketLitros = num(ticket.litros);
  const esForaneo = !!ticket.es_foraneo;
  const shares = allocateByKm(
    ticketLitros,
    num(ticket.importe_total),
    withKm.map((trip) => ({ trip_id: String(trip.id), km: tripKmRecorridos(trip) })),
  );
  const shareByTrip = new Map(shares.map((row) => [row.trip_id, row]));
  const kmByTrip = new Map(withKm.map((trip) => [String(trip.id), tripKmRecorridos(trip)]));

  await runInTransaction(transaction, async (t) => {
    for (const assignment of assignments) {
      const tripId = String(assignment.trip_id);
      const km = kmByTrip.get(tripId);
      if (km == null) {
        await assignment.destroy({ transaction: t });
        continue;
      }
      const computed = shareByTrip.get(tripId);
      const hasStoredShare = assignment.litros_asignados != null;
      const litrosAsignados = hasStoredShare ? num(assignment.litros_asignados) : (computed?.litros_asignados ?? 0);
      const costoAsignado = hasStoredShare ? num(assignment.costo_asignado) : (computed?.costo_asignado ?? 0);

      await assignment.update(
        {
          km_recorridos: String(km),
          litros_asignados: String(litrosAsignados),
          costo_asignado: String(costoAsignado),
        },
        { transaction: t },
      );

      if (litrosAsignados <= 0) {
        await FuelLoad.destroy({
          where: { tenant_id: tenantId, trip_id: tripId, fuel_ticket_id: ticketId },
          transaction: t,
        });
        continue;
      }

      const existingLoad = await FuelLoad.findOne({
        where: {
          tenant_id: tenantId,
          trip_id: tripId,
          fuel_ticket_id: ticketId,
        },
        transaction: t,
      });
      if (existingLoad) {
        await existingLoad.update(
          {
            litros: String(litrosAsignados),
            precio_litro: String(precioLitro),
            es_foraneo: esForaneo,
            es_estacion_empresa: !esForaneo,
          },
          { transaction: t },
        );
        continue;
      }

      await FuelLoad.create(
        {
          id: randomUUID(),
          tenant_id: tenantId,
          trip_id: tripId,
          litros: String(litrosAsignados),
          precio_litro: String(precioLitro),
          ubicacion,
          estacion_nombre: ubicacion,
          es_foraneo: esForaneo,
          es_estacion_empresa: !esForaneo,
          comprobante_url: null,
          fuel_ticket_id: ticketId,
          fecha: fuelFecha,
        } as never,
        { transaction: t },
      );
    }
    await ticket.update({ prorrateo_confirmado_at: new Date() }, { transaction: t });
  });
}

async function getConfirmedTicketOrThrow(tenantId: string, ticketId: string, transaction?: Transaction) {
  const ticket = await FuelTicket.findOne({
    where: { id: ticketId, tenant_id: tenantId },
    transaction,
  });
  if (!ticket) throw Object.assign(new Error("Ticket no encontrado"), { status: 404 });
  if (!ticket.prorrateo_confirmado_at) {
    throw Object.assign(new Error("El ticket no está confirmado"), { status: 400 });
  }
  return ticket;
}

export async function reopenTicketProration(
  tenantId: string,
  ticketId: string,
  transaction?: Transaction,
): Promise<void> {
  const ticket = await getConfirmedTicketOrThrow(tenantId, ticketId, transaction);

  await runInTransaction(transaction, async (t) => {
    await FuelLoad.destroy({
      where: { tenant_id: tenantId, fuel_ticket_id: ticketId },
      transaction: t,
    });
    await FuelProrationAssignment.update(
      {
        km_recorridos: null,
        litros_asignados: null,
        costo_asignado: null,
      },
      {
        where: { tenant_id: tenantId, fuel_ticket_id: ticketId },
        transaction: t,
      },
    );
    await ticket.update({ prorrateo_confirmado_at: null }, { transaction: t });
  });
}

export async function deleteConfirmedTicketProration(tenantId: string, ticketId: string): Promise<void> {
  const ticket = await getConfirmedTicketOrThrow(tenantId, ticketId);

  await sequelize.transaction(async (t) => {
    await FuelLoad.destroy({
      where: { tenant_id: tenantId, fuel_ticket_id: ticketId },
      transaction: t,
    });
    await FuelProrationAssignment.destroy({
      where: { tenant_id: tenantId, fuel_ticket_id: ticketId },
      transaction: t,
    });
    await ticket.destroy({ transaction: t });
  });
}

export function sumLitersForPeriod(opts: {
  periodTripIds: Set<string>;
  confirmed: { trip_id: string; litros: number }[];
  pendingBlocks: ProratedTicketBlock[];
  orphanLoads: { trip_id: string; litros: number }[];
}): number {
  let litros = 0;
  for (const row of opts.confirmed) {
    if (opts.periodTripIds.has(row.trip_id)) litros += row.litros;
  }
  for (const block of opts.pendingBlocks) {
    for (const viaje of block.viajes) {
      if (opts.periodTripIds.has(viaje.trip_id)) litros += viaje.litros_asignados;
    }
  }
  for (const load of opts.orphanLoads) {
    if (opts.periodTripIds.has(load.trip_id)) litros += load.litros;
  }
  return Math.round(litros * 100) / 100;
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

  const periodTrips = await Trip.findAll({
    where: {
      tenant_id: tenantId,
      fecha_salida: {
        [Op.gte]: new Date(`${inicio}T00:00:00.000Z`),
        [Op.lte]: new Date(`${fin}T23:59:59.999Z`),
      },
    },
  });

  const truckIds = [...new Set(periodTrips.map((trip) => String(trip.truck_id)))];
  const allTickets = truckIds.length
    ? await FuelTicket.findAll({
        where: { tenant_id: tenantId, truck_id: { [Op.in]: truckIds } },
      })
    : [];
  const allTrips = truckIds.length
    ? await Trip.findAll({
        where: { tenant_id: tenantId, truck_id: { [Op.in]: truckIds } },
      })
    : [];

  const confirmedTicketIds = allTickets
    .filter((ticket) => ticket.prorrateo_confirmado_at != null)
    .map((ticket) => String(ticket.id));
  const assignments = confirmedTicketIds.length
    ? await FuelProrationAssignment.findAll({
        where: { tenant_id: tenantId, fuel_ticket_id: { [Op.in]: confirmedTicketIds } },
      })
    : [];

  const periodTripIdList = periodTrips.map((trip) => String(trip.id));
  const orphanLoadRows = periodTripIdList.length
    ? await FuelLoad.findAll({
        where: {
          tenant_id: tenantId,
          trip_id: { [Op.in]: periodTripIdList },
          fuel_ticket_id: null,
        },
      })
    : [];

  const rows: FuelSummaryRow[] = [];
  for (const truck of trucks) {
    const tid = String(truck.id);
    const truckPeriodTrips = periodTrips.filter((trip) => String(trip.truck_id) === tid);
    const km = truckPeriodTrips.reduce((s, trip) => s + tripKmRecorridos(trip), 0);
    if (truckPeriodTrips.length === 0 && km === 0) continue;

    const periodTripIds = new Set(truckPeriodTrips.map((trip) => String(trip.id)));
    const truckTickets = allTickets.filter((ticket) => String(ticket.truck_id) === tid);
    const pendingIds = new Set(
      truckTickets.filter((ticket) => ticket.prorrateo_confirmado_at == null).map((ticket) => String(ticket.id)),
    );
    const confirmedIds = new Set(
      truckTickets.filter((ticket) => ticket.prorrateo_confirmado_at != null).map((ticket) => String(ticket.id)),
    );
    const confirmed = assignments
      .filter((row) => confirmedIds.has(String(row.fuel_ticket_id)) && row.litros_asignados != null)
      .map((row) => ({ trip_id: String(row.trip_id), litros: num(row.litros_asignados) }));
    const truckTrips = allTrips.filter((trip) => String(trip.truck_id) === tid);
    const pendingBlocks = buildTankBlocks(truckTickets, truckTrips).filter((block) => pendingIds.has(block.ticket_id));
    const orphanLoads = orphanLoadRows
      .filter((load) => periodTripIds.has(String(load.trip_id)))
      .map((load) => ({ trip_id: String(load.trip_id), litros: num(load.litros) }));
    const litros = sumLitersForPeriod({ periodTripIds, confirmed, pendingBlocks, orphanLoads });

    if (litros === 0 && km === 0 && truckPeriodTrips.length === 0) continue;
    rows.push({
      truck_id: tid,
      numero_economico: truck.numero_economico,
      placas: truck.placas,
      viajes: truckPeriodTrips.length,
      km_recorridos: km,
      litros,
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
  estado: FuelProrationEstado = "pendiente",
): Promise<FuelProrationAllResult> {
  const trucks = await Truck.findAll({
    where: { tenant_id: tenantId, estatus: { [Op.ne]: "baja" } },
    order: [["numero_economico", "ASC"]],
  });

  const unidades: ProrationRangeResult[] = [];
  for (const truck of trucks) {
    const report = await prorateRange(tenantId, String(truck.id), inicio, fin, estado);
    if (report.tickets.length > 0) unidades.push(report);
  }

  return { inicio, fin, unidades };
}
