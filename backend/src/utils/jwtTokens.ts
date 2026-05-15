import jwt from "jsonwebtoken";

/** Acepta segundos numéricos o sufijo s|m|h|d (ej. `15m`, `24h`). */
function parseDurationToSeconds(raw: string | undefined): number | null {
  if (raw == null || raw === "") return null;
  const s = raw.trim();
  const m = s.match(/^(\d+)\s*([smhd])$/i);
  if (m) {
    const n = parseInt(m[1], 10);
    const u = m[2].toLowerCase();
    const mult = u === "s" ? 1 : u === "m" ? 60 : u === "h" ? 3600 : 86400;
    if (Number.isFinite(n) && n > 0) return n * mult;
    return null;
  }
  const num = Number(s);
  if (Number.isFinite(num) && num > 0) return num;
  return null;
}

/** Segundos de vida del JWT de acceso (Bearer en API). Prioridad: JWT_ACCESS_EXPIRES_SEC, JWT_EXPIRES_SEC, JWT_EXPIRES_IN, luego 3600 (1 h). */
export function accessExpiresSec(): number {
  return (
    parseDurationToSeconds(process.env.JWT_ACCESS_EXPIRES_SEC) ??
    parseDurationToSeconds(process.env.JWT_EXPIRES_SEC) ??
    parseDurationToSeconds(process.env.JWT_EXPIRES_IN) ??
    3600
  );
}

/** Segundos de vida del refresh token. Por defecto 7 días. Acepta el mismo formato que arriba. */
export function refreshExpiresSec(): number {
  return parseDurationToSeconds(process.env.JWT_REFRESH_EXPIRES_SEC) ?? 604800;
}

export function signAccessToken(secret: string, sub: string, tid: string): string {
  return jwt.sign({ sub, tid }, secret, { expiresIn: accessExpiresSec() });
}

export function signRefreshToken(secret: string, sub: string, tid: string): string {
  return jwt.sign({ sub, tid, typ: "refresh" }, secret, { expiresIn: refreshExpiresSec() });
}
