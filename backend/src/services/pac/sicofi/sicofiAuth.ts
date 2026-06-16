import { SICOFI_AUTH_TOKEN_PATH, sicofiTimeoutMs } from "./config";

const DEFAULT_EXPIRES_SEC = 3600;
const EXPIRY_MARGIN_MS = 60_000;

type TokenCacheEntry = { accessToken: string; expiresAt: number };

const tokenCache = new Map<string, TokenCacheEntry>();

/** Clave de caché: `{baseUrl}:{usuario}`. */
function cacheKey(baseUrl: string, usuario: string): string {
  return `${baseUrl}:${usuario}`;
}

/** Calcula timestamp de expiración con margen de 60s antes del TTL real. */
function computeExpiresAt(expiresInSec: number): number {
  const ttlMs = Math.max(expiresInSec * 1000 - EXPIRY_MARGIN_MS, EXPIRY_MARGIN_MS);
  return Date.now() + ttlMs;
}

/** Extrae token y TTL de la respuesta JSON de `/auth/token` (variantes de nombres de campo). */
function parseAuthTokenBody(parsed: Record<string, unknown>): { accessToken: string; expiresIn: number } {
  const raw =
    parsed.access_token ?? parsed.token ?? parsed.accessToken ?? parsed.AccessToken;
  const accessToken = typeof raw === "string" ? raw.trim() : "";
  if (!accessToken) {
    throw new Error("Sicofi auth no devolvió token JWT");
  }

  const expiresRaw = parsed.expires_in ?? parsed.expiresIn ?? parsed.expiration;
  const expiresIn =
    typeof expiresRaw === "number" && expiresRaw > 0 ? expiresRaw : DEFAULT_EXPIRES_SEC;

  return { accessToken, expiresIn };
}

/**
 * Obtiene un JWT de Sicofi vía `POST /auth/token` con Basic auth.
 * No usa caché; para token cacheado usar `getSicofiAccessToken`.
 *
 * @param baseUrl - URL base de la API (sin `/auth/token`).
 * @param usuario - Usuario Sicofi del tenant.
 * @param contrasena - Contraseña Sicofi descifrada.
 * @returns Token y timestamp de expiración en memoria.
 * @throws Si HTTP no OK, JSON inválido, sin token o timeout.
 */
export async function fetchSicofiAccessToken(
  baseUrl: string,
  usuario: string,
  contrasena: string,
): Promise<{ accessToken: string; expiresAt: number }> {
  const url = `${baseUrl.replace(/\/$/, "")}${SICOFI_AUTH_TOKEN_PATH}`;
  const basic = Buffer.from(`${usuario}:${contrasena}`).toString("base64");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), sicofiTimeoutMs());
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      signal: controller.signal,
    });
    const body = await res.text();
    if (!res.ok) {
      let msg = `Sicofi auth respondió ${res.status}`;
      try {
        const j = JSON.parse(body) as Record<string, unknown>;
        if (typeof j.error === "string") msg = j.error;
        else if (typeof j.message === "string") msg = j.message;
      } catch {
        if (body.trim()) msg = body.trim().slice(0, 500);
      }
      throw new Error(msg);
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(body) as Record<string, unknown>;
    } catch {
      throw new Error(`Respuesta inválida de Sicofi auth: ${body.trim().slice(0, 200)}`);
    }

    const { accessToken, expiresIn } = parseAuthTokenBody(parsed);
    return { accessToken, expiresAt: computeExpiresAt(expiresIn) };
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new Error("Timeout al obtener token Sicofi");
    }
    throw e;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Elimina el JWT cacheado para forzar renovación en el próximo timbrado.
 * Usado tras recibir 401 en Factura40.
 */
export function invalidateSicofiAccessToken(baseUrl: string, usuario: string): void {
  tokenCache.delete(cacheKey(baseUrl, usuario));
}

/**
 * Devuelve JWT cacheado si sigue vigente; si no, llama a `fetchSicofiAccessToken`.
 *
 * @param opts.forceRefresh - Si true, ignora caché y obtiene token nuevo.
 * @returns Token Bearer para el header `Authorization`.
 */
export async function getSicofiAccessToken(
  baseUrl: string,
  usuario: string,
  contrasena: string,
  opts?: { forceRefresh?: boolean },
): Promise<string> {
  const key = cacheKey(baseUrl, usuario);
  if (!opts?.forceRefresh) {
    const cached = tokenCache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.accessToken;
    }
  }

  const { accessToken, expiresAt } = await fetchSicofiAccessToken(baseUrl, usuario, contrasena);
  tokenCache.set(key, { accessToken, expiresAt });
  return accessToken;
}

/** Solo para tests: limpia la caché de tokens en memoria. */
export function clearSicofiTokenCacheForTests(): void {
  tokenCache.clear();
}
