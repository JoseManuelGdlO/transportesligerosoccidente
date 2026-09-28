export type OdometerResetPeer = {
  id: string;
  effective_at: Date;
  old_km: number;
  new_km: number;
  motivo: string;
};

function sortResetsByEffectiveAtAsc(resets: OdometerResetPeer[]): OdometerResetPeer[] {
  return [...resets].sort((a, b) => a.effective_at.getTime() - b.effective_at.getTime());
}

/** Reinicio vigente en `at`: el último cuya fecha es anterior o igual. */
export function findApplicableReset(
  resets: OdometerResetPeer[],
  at: Date,
): OdometerResetPeer | null {
  const sorted = sortResetsByEffectiveAtAsc(resets);
  let applicable: OdometerResetPeer | null = null;
  for (const r of sorted) {
    if (r.effective_at.getTime() <= at.getTime()) {
      applicable = r;
    } else {
      break;
    }
  }
  return applicable;
}

function epochBounds(
  resets: OdometerResetPeer[],
  at: Date,
): { start: OdometerResetPeer | null; end: OdometerResetPeer | null } {
  const sorted = sortResetsByEffectiveAtAsc(resets);
  const start = findApplicableReset(sorted, at);
  const end = sorted.find((r) => r.effective_at.getTime() > at.getTime()) ?? null;
  return { start, end };
}

/** Viajes cuya salida cae en la misma época de odómetro que `at`. */
export function peersInSameEpoch<T extends { id: string; fecha_salida: Date }>(
  peers: T[],
  resets: OdometerResetPeer[],
  at: Date,
): T[] {
  if (resets.length === 0) return peers;
  const { start, end } = epochBounds(resets, at);
  const endMs = end?.effective_at.getTime() ?? null;
  const startMs = start?.effective_at.getTime() ?? null;

  return peers.filter((peer) => {
    const t = peer.fecha_salida.getTime();
    if (endMs !== null && t >= endMs) return false;
    if (startMs === null) return true;
    return t >= startMs;
  });
}
