import type { Driver, Trip, TripStatusRef, TripLifecycleSlug, Truck } from "@/types/tlo";

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

export function findOpenTripByTruck(
  trips: Trip[],
  truckId: string,
  excludeTripId?: string,
): Trip | undefined {
  return trips.find(
    (t) => t.truck_id === truckId && tripIsOpen(t) && t.id !== excludeTripId,
  );
}

export function findOpenTripByDriver(
  trips: Trip[],
  driverId: string,
  excludeTripId?: string,
): Trip | undefined {
  return trips.find(
    (t) => t.driver_id === driverId && tripIsOpen(t) && t.id !== excludeTripId,
  );
}

export type OpenTripConflictLabels = {
  trucks?: Truck[];
  drivers?: Driver[];
};

export function assertNoOpenTripConflictLocal(
  trips: Trip[],
  opts: { truck_id: string; driver_id: string; excludeTripId?: string },
  labels?: OpenTripConflictLabels,
): void {
  const truckConflict = findOpenTripByTruck(trips, opts.truck_id, opts.excludeTripId);
  if (truckConflict) {
    const eco =
      labels?.trucks?.find((t) => t.id === opts.truck_id)?.numero_economico?.trim() ||
      opts.truck_id;
    throw new Error(`La unidad ${eco} ya tiene el viaje ${truckConflict.folio} en curso`);
  }
  const driverConflict = findOpenTripByDriver(trips, opts.driver_id, opts.excludeTripId);
  if (driverConflict) {
    const nombre =
      labels?.drivers?.find((d) => d.id === opts.driver_id)?.nombre?.trim() ||
      opts.driver_id;
    throw new Error(`El operador ${nombre} ya tiene el viaje ${driverConflict.folio} en curso`);
  }
}

export function openTripByTruckId(trips: Trip[], excludeTripId?: string): Map<string, Trip> {
  const map = new Map<string, Trip>();
  for (const t of trips) {
    if (tripIsOpen(t) && t.id !== excludeTripId && !map.has(t.truck_id)) {
      map.set(t.truck_id, t);
    }
  }
  return map;
}

export function openTripByDriverId(trips: Trip[], excludeTripId?: string): Map<string, Trip> {
  const map = new Map<string, Trip>();
  for (const t of trips) {
    if (tripIsOpen(t) && t.id !== excludeTripId && !map.has(t.driver_id)) {
      map.set(t.driver_id, t);
    }
  }
  return map;
}
