export function montoCobroDefault(saldoInterno: number, saldoSat: number): number {
  return Math.round(Math.min(saldoInterno, saldoSat) * 100) / 100;
}
