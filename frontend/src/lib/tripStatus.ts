import type { Trip, TripStatusRef, TripLifecycleSlug } from "@/types/tlo";

export const SYSTEM_STATUS_EN_CURSO: TripStatusRef = {
  id: "sys-en-curso",
  nombre: "En curso",
  color: "#6366f1",
  slug: "en_curso",
  is_system: true,
  activo: true,
};

export const SYSTEM_STATUS_CERRADO: TripStatusRef = {
  id: "sys-cerrado",
  nombre: "Cerrado",
  color: "#22c55e",
  slug: "cerrado",
  is_system: true,
  activo: true,
};

export const TRIP_STATUS_COLOR_OPTIONS = [
  { value: "#6366f1", label: "Índigo" },
  { value: "#22c55e", label: "Verde" },
  { value: "#f59e0b", label: "Ámbar" },
  { value: "#ef4444", label: "Rojo" },
  { value: "#8b5cf6", label: "Violeta" },
  { value: "#06b6d4", label: "Cian" },
  { value: "#64748b", label: "Gris" },
];

export function tripHasStatusSlug(trip: Trip, slug: TripLifecycleSlug): boolean {
  return (trip.statuses ?? []).some((s) => s.slug === slug);
}

export function tripIsClosed(trip: Trip): boolean {
  return tripHasStatusSlug(trip, "cerrado");
}

export function tripIsOpen(trip: Trip): boolean {
  return tripHasStatusSlug(trip, "en_curso");
}

export function tripHasStatusId(trip: Trip, id: string): boolean {
  return (trip.statuses ?? []).some((s) => s.id === id);
}

export function customStatusesFromTrip(trip: Trip): TripStatusRef[] {
  return (trip.statuses ?? []).filter((s) => !s.is_system);
}

export function statusLabelForPdf(trip: Trip): string {
  return (trip.statuses ?? []).map((s) => s.nombre).join(", ") || "—";
}

export function findStatusIdBySlug(statuses: TripStatusRef[], slug: TripLifecycleSlug): string | undefined {
  return statuses.find((s) => s.slug === slug)?.id;
}
