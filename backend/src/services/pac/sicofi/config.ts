/** Path relativo del endpoint de autenticación Sicofi. */
export const SICOFI_AUTH_TOKEN_PATH = "/auth/token";

/** Path relativo del endpoint de timbrado CFDI 4.0. */
export const SICOFI_FACTURA40_PATH = "/Comprobante40/Factura40";

/** Path relativo del endpoint de cancelación CFDI. */
export const SICOFI_CANCELA_PATH = "/CancelaTimbrado/TimbradoR";

const DEFAULT_BASE = "https://demo.sicofi.com.mx/DFWSR/api";

/**
 * Normaliza la URL base de la API Sicofi (sin path Factura40 duplicado).
 * Prioridad: `tenant.pac_url` → `SICOFI_API_BASE_URL` → demo.
 *
 * @param tenant - Tenant con `pac_url` opcional.
 * @returns URL base sin barra final ni path de Factura40.
 */
export function resolveSicofiBaseUrl(tenant?: { pac_url?: string | null }): string {
  let raw =
    tenant?.pac_url?.trim() ||
    process.env.SICOFI_API_BASE_URL?.trim() ||
    DEFAULT_BASE;
  raw = raw.replace(/\/$/, "");
  if (raw.endsWith(SICOFI_FACTURA40_PATH)) {
    raw = raw.slice(0, -SICOFI_FACTURA40_PATH.length).replace(/\/$/, "");
  }
  return raw || DEFAULT_BASE;
}

/**
 * URL completa del endpoint Factura40 para el tenant dado.
 *
 * @param tenant - Tenant con `pac_url` opcional.
 * @returns `{baseUrl}/Comprobante40/Factura40`.
 */
export function resolveSicofiFactura40Url(tenant?: { pac_url?: string | null }): string {
  return `${resolveSicofiBaseUrl(tenant)}${SICOFI_FACTURA40_PATH}`;
}

/**
 * URL completa del endpoint CancelaTimbrado para el tenant dado.
 *
 * @param tenant - Tenant con `pac_url` opcional.
 * @returns `{baseUrl}/CancelaTimbrado/TimbradoR`.
 */
export function resolveSicofiCancelaUrl(tenant?: { pac_url?: string | null }): string {
  return `${resolveSicofiBaseUrl(tenant)}${SICOFI_CANCELA_PATH}`;
}

/**
 * Timeout HTTP en milisegundos para llamadas a Sicofi (auth y timbrado).
 *
 * @returns Valor de `SICOFI_TIMEOUT_MS` o 120_000 por defecto.
 */
export function sicofiTimeoutMs(): number {
  const n = Number(process.env.SICOFI_TIMEOUT_MS);
  return Number.isFinite(n) && n > 0 ? n : 120_000;
}
