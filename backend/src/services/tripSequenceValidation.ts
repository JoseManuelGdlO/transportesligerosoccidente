import { type Transaction } from "sequelize";
import { Trip } from "../models";
import type { Trip as TripModel } from "../models/Trip";

export type TripPeer = {
  id: string;
  folio: string;
  fecha_salida: Date;
  fecha_llegada: Date | null;
  km_inicial: number;
  km_final: number | null;
};

export type TripScheduleCandidate = {
  tripId?: string;
  /** Para desempate estable al ordenar con peers del mismo instante. */
  folio?: string;
  fecha_salida: Date;
  fecha_llegada: Date | null;
  km_inicial: number;
  km_final: number | null;
};

function httpError(message: string, status = 400): Error {
  const err = new Error(message);
  (err as Error & { status?: number }).status = status;
  return err;
}

export function tripTimestampMs(value: Date | string): number {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

/** Fin del intervalo; sin llegada = abierto hasta +∞. */
export function tripIntervalEndMs(trip: { fecha_llegada: Date | null }): number {
  if (!trip.fecha_llegada) return Number.POSITIVE_INFINITY;
  return tripTimestampMs(trip.fecha_llegada);
}

/**
 * Traslape estricto: extremos que se tocan (A llega cuando B sale) están permitidos.
 * startA < endB && startB < endA
 */
export function intervalsOverlap(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export function compareTripOrder(
  a: { fecha_salida: Date | string; folio: string },
  b: { fecha_salida: Date | string; folio: string },
): number {
  const ta = tripTimestampMs(a.fecha_salida);
  const tb = tripTimestampMs(b.fecha_salida);
  if (ta !== tb) return ta < tb ? -1 : 1;
  return a.folio.localeCompare(b.folio);
}

function formatTripRange(trip: { fecha_salida: Date; fecha_llegada: Date | null }): string {
  const start = trip.fecha_salida.toISOString();
  if (!trip.fecha_llegada) return `${start} – (en curso)`;
  return `${start} – ${trip.fecha_llegada.toISOString()}`;
}

function isClosedPeer(trip: TripPeer): boolean {
  return trip.km_final != null;
}

export function peerFromTrip(trip: TripModel): TripPeer {
  return {
    id: String(trip.id),
    folio: trip.folio,
    fecha_salida: trip.fecha_salida instanceof Date ? trip.fecha_salida : new Date(trip.fecha_salida),
    fecha_llegada: trip.fecha_llegada
      ? trip.fecha_llegada instanceof Date
        ? trip.fecha_llegada
        : new Date(trip.fecha_llegada)
      : null,
    km_inicial: Number(trip.km_inicial),
    km_final: trip.km_final != null ? Number(trip.km_final) : null,
  };
}

/**
 * Valida traslape de fechas y continuidad estricta de odómetro
 * respecto a viajes de la misma unidad (peers).
 */
export function validateTripScheduleAndOdometer(
  candidate: TripScheduleCandidate,
  peers: TripPeer[],
): void {
  if (candidate.km_final != null && candidate.km_final <= candidate.km_inicial) {
    throw httpError("El km final debe ser mayor al inicial");
  }
  if (candidate.fecha_llegada) {
    const start = tripTimestampMs(candidate.fecha_salida);
    const end = tripTimestampMs(candidate.fecha_llegada);
    if (end < start) {
      throw httpError("La fecha de llegada no puede ser anterior a la de salida");
    }
  }

  const others = peers.filter((p) => p.id !== candidate.tripId);
  const candStart = tripTimestampMs(candidate.fecha_salida);
  const candEnd = tripIntervalEndMs(candidate);

  for (const peer of others) {
    const peerStart = tripTimestampMs(peer.fecha_salida);
    const peerEnd = tripIntervalEndMs(peer);
    if (intervalsOverlap(candStart, candEnd, peerStart, peerEnd)) {
      throw httpError(
        `Las fechas se traslapan con el viaje ${peer.folio} (${formatTripRange(peer)})`,
      );
    }
  }

  const ordered = [...others].sort(compareTripOrder);
  const candidateForOrder = {
    fecha_salida: candidate.fecha_salida,
    folio: candidate.folio ?? "\uffff",
  };

  let prevClosed: TripPeer | null = null;
  let nextClosed: TripPeer | null = null;
  for (const peer of ordered) {
    if (compareTripOrder(peer, candidateForOrder) < 0) {
      if (isClosedPeer(peer)) prevClosed = peer;
    } else if (compareTripOrder(peer, candidateForOrder) > 0) {
      if (isClosedPeer(peer) && !nextClosed) nextClosed = peer;
    }
  }

  if (prevClosed && prevClosed.km_final != null && candidate.km_inicial !== prevClosed.km_final) {
    throw httpError(
      `El km inicial debe ser ${prevClosed.km_final} (km final del viaje anterior ${prevClosed.folio})`,
    );
  }

  if (
    nextClosed &&
    candidate.km_final != null &&
    candidate.km_final !== nextClosed.km_inicial
  ) {
    throw httpError(
      `El km final debe ser ${nextClosed.km_inicial} (km inicial del viaje siguiente ${nextClosed.folio})`,
    );
  }
}

export async function loadTruckTripPeers(
  tenantId: string,
  truckId: string,
  t?: Transaction,
): Promise<TripPeer[]> {
  const rows = await Trip.findAll({
    where: { tenant_id: tenantId, truck_id: truckId },
    attributes: ["id", "folio", "fecha_salida", "fecha_llegada", "km_inicial", "km_final"],
    transaction: t,
  });
  return rows.map(peerFromTrip);
}

export async function assertTripScheduleAndOdometer(
  tenantId: string,
  candidate: TripScheduleCandidate & { truckId: string },
  t?: Transaction,
): Promise<void> {
  const peers = await loadTruckTripPeers(tenantId, candidate.truckId, t);
  validateTripScheduleAndOdometer(candidate, peers);
}
