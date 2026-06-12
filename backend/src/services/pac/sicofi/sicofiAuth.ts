import { SICOFI_AUTH_TOKEN_PATH, sicofiTimeoutMs } from "./config";

const DEFAULT_EXPIRES_SEC = 3600;
const EXPIRY_MARGIN_MS = 60_000;

type TokenCacheEntry = { accessToken: string; expiresAt: number };

const tokenCache = new Map<string, TokenCacheEntry>();

function cacheKey(baseUrl: string, usuario: string): string {
  return `${baseUrl}:${usuario}`;
}

function computeExpiresAt(expiresInSec: number): number {
  const ttlMs = Math.max(expiresInSec * 1000 - EXPIRY_MARGIN_MS, EXPIRY_MARGIN_MS);
  return Date.now() + ttlMs;
}

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

export function invalidateSicofiAccessToken(baseUrl: string, usuario: string): void {
  tokenCache.delete(cacheKey(baseUrl, usuario));
}

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

/** Solo para tests: limpia cache en memoria. */
export function clearSicofiTokenCacheForTests(): void {
  tokenCache.clear();
}
