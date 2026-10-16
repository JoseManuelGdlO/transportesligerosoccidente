export function montoCobroDefault(saldoInterno: number, saldoSat: number): number {
  return Math.round(Math.min(saldoInterno, saldoSat) * 100) / 100;
}

const PENDING_COMPLEMENT = /Hay un complemento pendiente \(([0-9a-fA-F-]{36})\)/;

/** Id del intento en error que el 409 incluye en el mensaje, para reintentar o descartar. */
export function pendingComplementIdFromError(message: string): string | null {
  return PENDING_COMPLEMENT.exec(message)?.[1] ?? null;
}
