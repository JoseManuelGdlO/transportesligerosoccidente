import type { Trip as TripModel } from "../models/Trip";
import { formatRutaResumen } from "./tripStopService";

export type TripRouteLabelInput = {
  origen: string;
  destino: string;
  Route?: { nombre?: string | null } | null;
  paradas?: { etiqueta: string; orden?: number }[] | null;
};

/** En visualización: "GDL / LOCAL / GDL" → "GDL → LOCAL → GDL". */
export function displayRouteSeparators(label: string): string {
  return label.replace(/\s*\/\s*/g, " → ");
}

/**
 * Etiqueta de ruta unificada (misma prioridad que prorrateo):
 * 1. Nombre del catálogo (con / convertido a →)
 * 2. Recorrido de paradas con " → "
 * 3. origen → destino
 */
export function tripRouteLabel(trip: TripRouteLabelInput): string {
  const nombre = trip.Route?.nombre?.trim();
  if (nombre) return displayRouteSeparators(nombre);

  const paradas = trip.paradas;
  if (paradas && paradas.length >= 2) {
    const sorted = [...paradas].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
    const resumen = formatRutaResumen(sorted);
    if (resumen) return resumen;
  }

  return `${trip.origen} → ${trip.destino}`;
}

export function tripRouteLabelFromModel(trip: TripModel): string {
  const withExtras = trip as TripModel & {
    Route?: { nombre?: string | null } | null;
    paradas?: { etiqueta: string; orden?: number }[] | null;
  };
  return tripRouteLabel({
    origen: trip.origen,
    destino: trip.destino,
    Route: withExtras.Route,
    paradas: withExtras.paradas,
  });
}
