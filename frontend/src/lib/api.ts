const TOKEN_KEY = "tlo_token";
const REFRESH_TOKEN_KEY = "tlo_refresh_token";

export function apiBaseUrl(): string {
  return (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "") ?? "";
}

export function hasApiConfigured(): boolean {
  return apiBaseUrl().length > 0;
}

export function getStoredToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string | null): void {
  if (token) sessionStorage.setItem(TOKEN_KEY, token);
  else sessionStorage.removeItem(TOKEN_KEY);
}

export function getStoredRefreshToken(): string | null {
  return sessionStorage.getItem(REFRESH_TOKEN_KEY);
}

export function setStoredRefreshToken(token: string | null): void {
  if (token) sessionStorage.setItem(REFRESH_TOKEN_KEY, token);
  else sessionStorage.removeItem(REFRESH_TOKEN_KEY);
}

/** Limpia acceso y refresh (p. ej. al cerrar sesión). */
export function clearAuthTokens(): void {
  setStoredToken(null);
  setStoredRefreshToken(null);
}

let refreshInFlight: Promise<boolean> | null = null;

async function refreshAccessTokenSingleton(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    try {
      const rt = getStoredRefreshToken();
      if (!rt) return false;
      const base = apiBaseUrl();
      const res = await fetch(`${base}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: rt }),
      });
      if (!res.ok) {
        clearAuthTokens();
        return false;
      }
      const j = (await res.json()) as { token?: string; refresh_token?: string };
      if (typeof j.token === "string" && j.token.length > 0) setStoredToken(j.token);
      else {
        clearAuthTokens();
        return false;
      }
      if (typeof j.refresh_token === "string" && j.refresh_token.length > 0) {
        setStoredRefreshToken(j.refresh_token);
      }
      return true;
    } catch {
      clearAuthTokens();
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

/** Si no hay access token pero sí refresh, obtiene un nuevo access token. */
export async function tryRestoreSessionFromRefresh(): Promise<boolean> {
  if (getStoredToken()) return true;
  return refreshAccessTokenSingleton();
}

type ApiFetchInit = RequestInit & { _retry?: boolean };

export async function apiFetch(path: string, init: ApiFetchInit = {}): Promise<Response> {
  const base = apiBaseUrl();
  if (!base) throw new Error("VITE_API_BASE_URL no está configurada");
  const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;
  const headers = new Headers(init.headers);
  const token = getStoredToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init.body && typeof init.body === "string" && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const { _retry, ...rest } = init;
  let res = await fetch(url, { ...rest, headers });

  if (res.status === 401 && !_retry && getStoredRefreshToken()) {
    const refreshed = await refreshAccessTokenSingleton();
    if (refreshed) {
      const h2 = new Headers(rest.headers);
      const t2 = getStoredToken();
      if (t2) h2.set("Authorization", `Bearer ${t2}`);
      if (rest.body && typeof rest.body === "string" && !h2.has("Content-Type")) {
        h2.set("Content-Type", "application/json");
      }
      res = await fetch(url, { ...rest, headers: h2 });
    }
  }

  return res;
}

/** Lee JSON de una respuesta fetch; lanza Error con mensaje si !res.ok o JSON inválido. */
export async function readJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const j = JSON.parse(text) as { error?: string };
      if (typeof j.error === "string") msg = j.error;
    } catch {
      /* ignore */
    }
    throw new Error(msg || `HTTP ${res.status}`);
  }
  return text ? (JSON.parse(text) as T) : ([] as unknown as T);
}
