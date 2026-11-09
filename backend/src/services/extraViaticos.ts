import { roundMoney } from "./calc";

export type ExtraViaticoAmounts = { monto_entregado: number; monto_comprobado: number };

export function sumExtraViaticos(rows: ExtraViaticoAmounts[]) {
  let entregados = 0;
  let comprobados = 0;
  for (const r of rows) {
    entregados += Number(r.monto_entregado) || 0;
    comprobados += Number(r.monto_comprobado) || 0;
  }
  return { entregados: roundMoney(entregados), comprobados: roundMoney(comprobados) };
}

export function applyExtraViaticosToTotals(
  base: { viaticos_entregados: number; viaticos_comprobados: number },
  extras: ExtraViaticoAmounts[],
) {
  const { entregados, comprobados } = sumExtraViaticos(extras);
  const viaticos_entregados = roundMoney(base.viaticos_entregados + entregados);
  const viaticos_comprobados = roundMoney(base.viaticos_comprobados + comprobados);
  return {
    viaticos_entregados,
    viaticos_comprobados,
    saldo_viaticos: roundMoney(viaticos_comprobados - viaticos_entregados),
  };
}

export type SnapshotNetoDecision =
  | { ok: true; neto_pagar: number; pendiente_arrastrado: number }
  | { ok: false; reason: string };

/**
 * Decide si un snapshot cerrado puede absorber un nuevo `neto_calculado` sin tocar el
 * arrastre ya registrado en la cuenta del operador. Si el neto cruza el cero respecto al
 * pendiente previo (o el monto del pendiente cambiaría), no es seguro editar el snapshot:
 * hay que reabrir y volver a cerrar la liquidación.
 */
export function resolveSnapshotNetoCarryover(
  pendientePrevio: number,
  netoCalculado: number,
): SnapshotNetoDecision {
  const pendiente = roundMoney(pendientePrevio);
  const neto = roundMoney(netoCalculado);
  const reopen = "Reabre la liquidación y vuelve a cerrarla para recalcular el arrastre";

  if (pendiente > 0) {
    if (neto > 0) return { ok: false, reason: `El neto pasó a positivo con arrastre previo. ${reopen}` };
    if (roundMoney(-neto) !== pendiente) {
      return { ok: false, reason: `El monto pendiente cambiaría. ${reopen}` };
    }
    return { ok: true, neto_pagar: 0, pendiente_arrastrado: pendiente };
  }
  if (neto < 0) return { ok: false, reason: `El neto pasó a negativo y requeriría un arrastre nuevo. ${reopen}` };
  return { ok: true, neto_pagar: neto, pendiente_arrastrado: 0 };
}
