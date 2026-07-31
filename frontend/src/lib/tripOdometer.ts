import type { Trip } from "@/types/tlo";
import { fmtDateTime } from "@/lib/format";

function tripTimestampMs(value: string): number {
  return new Date(value).getTime();
}

export function compareTripOrder(
  a: { fecha_salida: string; folio: string },
  b: { fecha_salida: string; folio: string },
): number {
  const ta = tripTimestampMs(a.fecha_salida);
  const tb = tripTimestampMs(b.fecha_salida);
  if (ta !== tb) return ta < tb ? -1 : 1;
  return a.folio.localeCompare(b.folio);
}

function formatTripRange(trip: Pick<Trip, "fecha_salida" | "fecha_llegada">): string {
  const start = fmtDateTime(trip.fecha_salida);
  if (!trip.fecha_llegada) return `${start} – (en curso)`;
  return `${start} – ${fmtDateTime(trip.fecha_llegada)}`;
}

/**
 * Impide registrar/mover un viaje antes del último de la unidad.
 * Referencia = fecha_llegada del último (o fecha_salida si sigue abierto).
 * En edición de un viaje histórico (hay peers posteriores) no aplica.
 * Devuelve mensaje de error o null si es válido.
 */
export function tripBeforeLastError(
  trips: Trip[],
  opts: {
    truckId: string;
    fechaSalida: string;
    /** Si se omite, se trata como alta (create). */
    excludeTripId?: string;
    folio?: string;
  },
): string | null {
  const others = trips.filter(
    (t) => t.truck_id === opts.truckId && t.id !== opts.excludeTripId,
  );
  if (others.length === 0) return null;

  const ordered = [...others].sort(compareTripOrder);
  const lastPeer = ordered[ordered.length - 1]!;
  const candidateKey = {
    fecha_salida: opts.fechaSalida,
    folio: opts.folio ?? "\uffff",
  };

  const hasLaterPeer = compareTripOrder(lastPeer, candidateKey) > 0;
  const refIso = lastPeer.fecha_llegada ?? lastPeer.fecha_salida;
  const refMs = tripTimestampMs(refIso);
  const candStart = tripTimestampMs(opts.fechaSalida);
  const isCreate = opts.excludeTripId == null;

  const violates =
    (isCreate && (hasLaterPeer || candStart < refMs)) ||
    (!isCreate && !hasLaterPeer && candStart < refMs);

  if (!violates) return null;

  return (
    `No se puede iniciar un viaje con fecha anterior al último viaje de la unidad. ` +
    `El último es ${lastPeer.folio} (${formatTripRange(lastPeer)}). ` +
    `Usa una fecha de salida igual o posterior a ${fmtDateTime(refIso)}.`
  );
}

/** Viaje inmediato siguiente de la misma unidad, por fecha. */
export function findNextTripForTruck(
  trip: Trip,
  trips: Trip[],
  truckId = trip.truck_id,
): Trip | null {
  const others = trips.filter((t) => t.truck_id === truckId && t.id !== trip.id);
  const ordered = [...others].sort(compareTripOrder);
  const key = { fecha_salida: trip.fecha_salida, folio: trip.folio };
  for (const peer of ordered) {
    if (compareTripOrder(peer, key) > 0) return peer;
  }
  return null;
}

/**
 * Sucesor de cascada: peer de la unidad cuyo km_inicial = km_final actual del viaje
 * (eslabón de odómetro). Si no hay enlace, cae al siguiente por fecha.
 */
export function findCascadeSuccessorTrip(
  trip: Trip,
  trips: Trip[],
  truckId = trip.truck_id,
  opts?: { fechaSalida?: string },
): Trip | null {
  const others = trips.filter((t) => t.truck_id === truckId && t.id !== trip.id);
  if (trip.km_final != null) {
    const linked = others.filter((t) => t.km_inicial === trip.km_final);
    if (linked.length === 1) return linked[0]!;
    if (linked.length > 1) {
      const key = { fecha_salida: trip.fecha_salida, folio: trip.folio };
      const after = linked
        .filter((p) => compareTripOrder(p, key) > 0)
        .sort(compareTripOrder);
      if (after[0]) return after[0];
      return [...linked].sort(compareTripOrder)[0]!;
    }
  }
  const forOrder: Trip = {
    ...trip,
    fecha_salida: opts?.fechaSalida ?? trip.fecha_salida,
  };
  return findNextTripForTruck(forOrder, trips, truckId);
}

export type KmFinalCascadePreview = {
  nextTrip: Trip;
  deltaKm: number;
  previousDistance: number | null;
  newDistance: number | null;
  /** Mensaje listo para el diálogo de confirmación. */
  message: string;
};

/**
 * Si al cambiar km_final hay un viaje siguiente, calcula el impacto en su recorrido.
 * Devuelve error solo si el siguiente quedaría con distancia negativa
 * (km final de este viaje mayor al km final del siguiente).
 *
 * El sucesor se ancla al odómetro (km_inicial del peer = km_final actual), no solo
 * a la fecha. Si `truckId` difiere de `trip.truck_id`, no hay preview.
 */
export function previewKmFinalCascade(
  trip: Trip,
  trips: Trip[],
  newKmFinal: number,
  opts?: { truckId?: string; fechaSalida?: string },
): { preview: KmFinalCascadePreview | null; error?: string } {
  if (trip.km_final == null) return { preview: null };
  if (newKmFinal === trip.km_final) return { preview: null };

  const truckId = opts?.truckId ?? trip.truck_id;
  if (truckId !== trip.truck_id) return { preview: null };

  const next = findCascadeSuccessorTrip(trip, trips, trip.truck_id, {
    fechaSalida: opts?.fechaSalida,
  });
  if (!next) return { preview: null };

  const deltaKm = newKmFinal - trip.km_final;
  const previousDistance = next.km_final != null ? next.km_final - next.km_inicial : null;
  const newDistance = next.km_final != null ? next.km_final - newKmFinal : null;

  if (next.km_final != null && next.km_final < newKmFinal) {
    return {
      preview: null,
      error:
        `El km final (${newKmFinal}) es mayor al km final del viaje siguiente ${next.folio} (${next.km_final}). ` +
        `El máximo permitido es ${next.km_final}.`,
    };
  }

  const absDelta = Math.abs(deltaKm);
  const verb = deltaKm > 0 ? "subir" : "bajar";
  let message: string;
  if (previousDistance != null && newDistance != null && next.km_final != null) {
    const rangeNote = `(km inicial ${newKmFinal} → km final ${next.km_final})`;
    message =
      newDistance === 0
        ? `Al ${verb} ${absDelta} km este viaje, el viaje ${next.folio} pasará de ${previousDistance} km a 0 km ${rangeNote}. ¿Continuar?`
        : `Al ${verb} ${absDelta} km este viaje, el viaje ${next.folio} pasará de ${previousDistance} km a ${newDistance} km ${rangeNote}. ¿Continuar?`;
  } else {
    message =
      `Al ${verb} ${absDelta} km este viaje, el km inicial del viaje siguiente ${next.folio} pasará a ${newKmFinal}. ¿Continuar?`;
  }

  return {
    preview: {
      nextTrip: next,
      deltaKm,
      previousDistance,
      newDistance,
      message,
    },
  };
}
