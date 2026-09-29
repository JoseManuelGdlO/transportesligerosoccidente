export type WeekPayrollEstado = "abierta" | "preliquidacion" | "cerrada";

/**
 * El resumen de la semana es lo que se pagará al cerrar el día.
 * Abiertas, preliquidaciones y cerradas entran; un override las saca o las deja.
 */
export function weekRowCountsInPayroll(
  estado: WeekPayrollEstado,
  override?: boolean,
  liquidadaOtraSemana?: boolean,
): boolean {
  if (override !== undefined) return override;
  if (liquidadaOtraSemana) return false;
  return estado === "abierta" || estado === "preliquidacion" || estado === "cerrada";
}
