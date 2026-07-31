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

export type ValidateTripOptions = {
  /**
   * Al editar km_final de un viaje con sucesor: no exige igualdad con km_inicial del siguiente;
   * valida que el siguiente quede con distancia > 0 tras propagar.
   */
  propagateKmFinalToNext?: boolean;
};

export type KmFinalCascadePlan = {
  nextTripId: string;
  nextFolio: string;
  newKmInicial: number;
  previousDistance: number | null;
  newDistance: number | null;
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

function candidateOrderKey(candidate: TripScheduleCandidate): {
  fecha_salida: Date;
  folio: string;
} {
  return {
    fecha_salida: candidate.fecha_salida,
    folio: candidate.folio ?? "\uffff",
  };
}

/** Viaje inmediato siguiente de la misma unidad (cualquier estado), por fecha. */
export function findNextTripPeer(
  candidate: TripScheduleCandidate,
  peers: TripPeer[],
): TripPeer | null {
  const others = peers.filter((p) => p.id !== candidate.tripId);
  const ordered = [...others].sort(compareTripOrder);
  const key = candidateOrderKey(candidate);
  for (const peer of ordered) {
    if (compareTripOrder(peer, key) > 0) return peer;
  }
  return null;
}

/**
 * Sucesor de cascada de odómetro: peer cuyo km_inicial coincide con el km_final
 * actual (antes del cambio). Así el eslabón real de la cadena no depende de fechas.
 * Si no hay enlace, cae al siguiente cronológico.
 *
 * `previousKmFinal` = km_final guardado en BD. Si se omite, se toma del peer con
 * el mismo tripId dentro de `peers` (debe ser el valor previo al patch).
 */
export function findCascadeSuccessorPeer(
  candidate: TripScheduleCandidate,
  peers: TripPeer[],
  previousKmFinal?: number | null,
): TripPeer | null {
  const self = candidate.tripId
    ? peers.find((p) => p.id === candidate.tripId)
    : undefined;
  const linkKm =
    previousKmFinal != null
      ? previousKmFinal
      : self?.km_final != null
        ? Number(self.km_final)
        : null;

  if (linkKm != null) {
    const linked = peers.filter(
      (p) => p.id !== candidate.tripId && Number(p.km_inicial) === linkKm,
    );
    if (linked.length === 1) return linked[0]!;
    if (linked.length > 1) {
      const key = candidateOrderKey(candidate);
      const after = linked
        .filter((p) => compareTripOrder(p, key) > 0)
        .sort(compareTripOrder);
      if (after[0]) return after[0];
      return [...linked].sort(compareTripOrder)[0]!;
    }
  }

  return findNextTripPeer(candidate, peers);
}

/**
 * Plan de cascada: al cambiar km_final, el sucesor por odómetro toma ese valor como km_inicial.
 * `peers` debe ser la secuencia de la misma unidad en la que permanece el viaje
 * (no aplicar si el viaje cambia de camión).
 * Lanza si el siguiente cerrado quedaría con distancia negativa.
 */
export function planKmFinalCascade(
  candidate: TripScheduleCandidate,
  peers: TripPeer[],
  previousKmFinal?: number | null,
): KmFinalCascadePlan | null {
  if (candidate.km_final == null) return null;
  const next = findCascadeSuccessorPeer(candidate, peers, previousKmFinal);
  if (!next) return null;

  const newKmInicial = candidate.km_final;
  if (next.km_final != null && next.km_final < newKmInicial) {
    throw httpError(
      `El km final (${newKmInicial}) es mayor al km final del viaje siguiente ${next.folio} (${next.km_final}). El máximo permitido es ${next.km_final}`,
    );
  }

  const previousDistance = next.km_final != null ? next.km_final - next.km_inicial : null;
  const newDistance = next.km_final != null ? next.km_final - newKmInicial : null;

  return {
    nextTripId: next.id,
    nextFolio: next.folio,
    newKmInicial,
    previousDistance,
    newDistance,
  };
}

/**
 * Impide registrar/mover un viaje antes del último de la unidad.
 * Referencia = fecha_llegada del último (o fecha_salida si sigue abierto).
 * En edición de un viaje histórico (hay peers posteriores) no aplica,
 * para no bloquear correcciones de viajes anteriores.
 */
export function assertNotBeforeLastTrip(
  candidate: TripScheduleCandidate,
  peers: TripPeer[],
): void {
  const others = peers.filter((p) => p.id !== candidate.tripId);
  if (others.length === 0) return;

  const ordered = [...others].sort(compareTripOrder);
  const lastPeer = ordered[ordered.length - 1]!;
  const candidateForOrder = candidateOrderKey(candidate);
  const hasLaterPeer = compareTripOrder(lastPeer, candidateForOrder) > 0;
  const refDate = lastPeer.fecha_llegada ?? lastPeer.fecha_salida;
  const refMs = tripTimestampMs(refDate);
  const candStart = tripTimestampMs(candidate.fecha_salida);

  const isCreate = candidate.tripId == null;
  const violates =
    (isCreate && (hasLaterPeer || candStart < refMs)) ||
    (!isCreate && !hasLaterPeer && candStart < refMs);

  if (violates) {
    throw httpError(
      `No se puede iniciar un viaje con fecha anterior al último viaje de la unidad. ` +
        `El último es ${lastPeer.folio} (${formatTripRange(lastPeer)}). ` +
        `Usa una fecha de salida igual o posterior a ${refDate.toISOString()}.`,
    );
  }
}

/**
 * Valida traslape de fechas y continuidad estricta de odómetro
 * respecto a viajes de la misma unidad (peers).
 */
export function validateTripScheduleAndOdometer(
  candidate: TripScheduleCandidate,
  peers: TripPeer[],
  options?: ValidateTripOptions,
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

  assertNotBeforeLastTrip(candidate, peers);

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
  const candidateForOrder = candidateOrderKey(candidate);

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

  if (options?.propagateKmFinalToNext) {
    if (candidate.km_final != null) {
      planKmFinalCascade(candidate, peers);
    }
    return;
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
  options?: ValidateTripOptions,
): Promise<void> {
  const peers = await loadTruckTripPeers(tenantId, candidate.truckId, t);
  validateTripScheduleAndOdometer(candidate, peers, options);
}
