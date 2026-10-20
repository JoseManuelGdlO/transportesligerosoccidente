/**
 * Conserva el valor que ya se leyó de la ficha cuando el catálogo en memoria llega vacío.
 * Un dato nuevo y no vacío sí reemplaza al anterior.
 */
export function keepFilledFiscal(
  incoming: string | number | null | undefined,
  current: string | number,
): string {
  const next = incoming == null ? "" : String(incoming).trim();
  if (next) return next;
  return current == null ? "" : String(current);
}
