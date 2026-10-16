export function montoCobroDefault(saldoInterno: number, saldoSat: number): number {
  return Math.round(Math.min(saldoInterno, saldoSat) * 100) / 100;
}

const PENDING_COMPLEMENT = /Hay un complemento pendiente \(([0-9a-fA-F-]{36})\)/;

/** Id del intento en error que el 409 incluye en el mensaje, para reintentar o descartar. */
export function pendingComplementIdFromError(message: string): string | null {
  return PENDING_COMPLEMENT.exec(message)?.[1] ?? null;
}

export const MENSAJE_CORREO_DEFAULT =
  "Estimado cliente, adjunto enviamos el complemento de pago correspondiente a su depósito.";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Fragmento del POST de timbrado. Sin switch, no manda correo. Con switch, el correo tiene que ser válido. */
export function correoComplementoBody(
  enabled: boolean,
  email: string,
  mensaje: string,
): { ok: true; fields: { email?: string; email_mensaje?: string } } | { ok: false; error: string } {
  if (!enabled) return { ok: true, fields: {} };
  const trimmed = email.trim();
  if (!EMAIL_RE.test(trimmed)) return { ok: false, error: "El correo no es válido" };
  const texto = mensaje.trim();
  return {
    ok: true,
    fields: texto ? { email: trimmed, email_mensaje: texto } : { email: trimmed },
  };
}
