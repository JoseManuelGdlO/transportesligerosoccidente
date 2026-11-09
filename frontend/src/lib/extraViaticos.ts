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
