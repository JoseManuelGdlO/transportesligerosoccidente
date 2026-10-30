/**
 * Consecutivo local del folio CFDI que TLO envía a Sicofi.
 * Sicofi timbra el entero recibido; la serie vacía no se envía.
 */

/** Primera factura de esta serie. Un folio usado menor no baja el siguiente. */
export const FOLIO_CFDI_PISO = 4634;

/**
 * Entero positivo sin decimales ni ceros a la izquierda.
 * `"4634"` cuenta; `"CP-3940"`, `"0"` y `"4634.5"` no.
 */
export function parseFolioEntero(value: string | number | null | undefined): number | null {
  if (value == null) return null;
  const s = String(value).trim();
  if (!/^[1-9]\d*$/.test(s)) return null;
  const n = Number(s);
  if (!Number.isSafeInteger(n)) return null;
  return n;
}

/**
 * Siguiente folio a sugerir.
 * Sin usos: el piso. Con máximo `N`: `max(piso, N + 1)`.
 */
export function siguienteFolio(maxUsado: number | null | undefined): number {
  if (maxUsado == null || !Number.isFinite(maxUsado) || maxUsado < 1) return FOLIO_CFDI_PISO;
  return Math.max(FOLIO_CFDI_PISO, Math.floor(maxUsado) + 1);
}

/**
 * Folio que debe mostrar esta carta: el suyo si ya es un entero, si no el siguiente libre.
 */
export function folioParaCarta(
  propio: string | number | null | undefined,
  maxOtros: number | null | undefined,
): number {
  const n = parseFolioEntero(propio);
  if (n != null) return n;
  return siguienteFolio(maxOtros);
}

/** Mensaje de preview si el folio no se puede timbrar. `null` cuando es válido. */
export function issueFolioTimbrable(value: string | number | null | undefined): string | null {
  const n = parseFolioEntero(value);
  if (n == null || n < FOLIO_CFDI_PISO) {
    return `El folio debe ser un entero mayor o igual a ${FOLIO_CFDI_PISO}`;
  }
  return null;
}
