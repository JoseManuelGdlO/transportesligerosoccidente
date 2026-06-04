/** Normaliza número económico para búsqueda exacta. */
export function normalizeEconomicoExact(raw: string): string {
  return raw.trim();
}

/**
 * Clave flexible para cruce Tothem ↔ sistema (TLO04, TN04, T04 → "4"; T10 → "10").
 * Si coexisten unidades con la misma clave (p. ej. TLO04 y TN04), el import debe fallar:
 * corregir catálogo o cruzar por TAG RFID en el Excel.
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
