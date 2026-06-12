export const SICOFI_AUTH_TOKEN_PATH = "/auth/token";
export const SICOFI_FACTURA40_PATH = "/Comprobante40/Factura40";

const DEFAULT_BASE = "https://demo.sicofi.com.mx/DFWSR/api";

/** Normaliza URL base (sin path Factura40 duplicado). */
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

export function resolveSicofiFactura40Url(tenant?: { pac_url?: string | null }): string {
  return `${resolveSicofiBaseUrl(tenant)}${SICOFI_FACTURA40_PATH}`;
}

export function sicofiTimeoutMs(): number {
  const n = Number(process.env.SICOFI_TIMEOUT_MS);
  return Number.isFinite(n) && n > 0 ? n : 120_000;
}
