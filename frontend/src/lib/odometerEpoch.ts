export type OdometerResetRef = {
  effective_at: string;
};

export function findApplicableReset<T extends OdometerResetRef>(resets: T[], atIso: string): T | null {
  const at = new Date(atIso).getTime();
  if (Number.isNaN(at)) return null;
  const sorted = [...resets].sort(
    (a, b) => new Date(a.effective_at).getTime() - new Date(b.effective_at).getTime(),
  );
  let applicable: T | null = null;
  for (const reset of sorted) {
    const t = new Date(reset.effective_at).getTime();
    if (t <= at) applicable = reset;
    else break;
  }
  return applicable;
}

export function filterTripsInSameEpoch<T extends { fecha_salida: string }>(
  trips: T[],
  resets: OdometerResetRef[],
  atIso: string,
): T[] {
  if (resets.length === 0) return trips;
  const at = new Date(atIso).getTime();
  const sorted = [...resets].sort(
    (a, b) => new Date(a.effective_at).getTime() - new Date(b.effective_at).getTime(),
  );
  let start: number | null = null;
  let end: number | null = null;
  for (const reset of sorted) {
    const t = new Date(reset.effective_at).getTime();
    if (t <= at) start = t;
    else {
      end = t;
      break;
    }
  }
  return trips.filter((trip) => {
    const t = new Date(trip.fecha_salida).getTime();
    if (start != null && t < start) return false;
    if (end != null && t >= end) return false;
    return true;
  });
}
