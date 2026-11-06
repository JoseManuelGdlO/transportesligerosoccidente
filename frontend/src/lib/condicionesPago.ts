/** Texto de condiciones de pago a partir de los días de crédito del cliente. */
export function condicionesPagoDesdeDias(dias: number | null | undefined): string {
  if (dias == null || !Number.isFinite(dias) || dias < 0) return "";
  const n = Math.floor(dias);
  if (n === 0) return "CONTADO";
  return `CREDITO ${n} DIAS`;
}
