/** Normaliza número económico para búsqueda exacta. */
export function normalizeEconomicoExact(raw: string): string {
  return raw.trim();
}

/**
 * Clave flexible para cruce Tothem ↔ sistema (TLO04, TN04, T04 → "4"; T10 → "10").
 */
export function economicoMatchKey(raw: string): string | null {
  const u = raw.trim().toUpperCase().replace(/\s+/g, "");
  if (!u) return null;
  const m = u.match(/^(?:TLO|TN|T)?0*(\d+)$/i);
  if (m) return String(parseInt(m[1], 10));
  return u;
}

export function normalizeTruckTag(tag: string): string {
  return tag.trim().toUpperCase();
}
