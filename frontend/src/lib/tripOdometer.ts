import type { Trip } from "@/types/tlo";

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

/** Viaje inmediato siguiente de la misma unidad. */
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
 */
export function previewKmFinalCascade(
  trip: Trip,
  trips: Trip[],
  newKmFinal: number,
  opts?: { truckId?: string; fechaSalida?: string },
): { preview: KmFinalCascadePreview | null; error?: string } {
  if (trip.km_final == null) return { preview: null };
  if (newKmFinal === trip.km_final) return { preview: null };

  const synthetic: Trip = {
    ...trip,
    truck_id: opts?.truckId ?? trip.truck_id,
    fecha_salida: opts?.fechaSalida ?? trip.fecha_salida,
  };
  const next = findNextTripForTruck(synthetic, trips, synthetic.truck_id);
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
