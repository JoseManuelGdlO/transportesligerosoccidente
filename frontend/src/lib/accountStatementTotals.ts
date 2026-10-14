export function accountStatementTotals(
  docs: Array<{
    estatus: "abierta" | "pagada" | "cancelada";
    estatus_display: string;
    saldo_pendiente: number;
    monto_original: number;
  }>,
): { pendiente: number; vencido: number; pagadas: number } {
  let pendiente = 0;
  let vencido = 0;
  let pagadas = 0;
  for (const d of docs) {
    if (d.estatus === "abierta") pendiente += d.saldo_pendiente;
    if (d.estatus_display === "Vencida") vencido += d.saldo_pendiente;
    if (d.estatus === "pagada") pagadas += d.monto_original;
  }
  return {
    pendiente: Math.round(pendiente * 100) / 100,
    vencido: Math.round(vencido * 100) / 100,
    pagadas: Math.round(pagadas * 100) / 100,
  };
}
