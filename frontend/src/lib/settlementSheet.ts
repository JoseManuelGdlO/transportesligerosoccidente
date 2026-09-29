import type { SettlementSummary } from "@/lib/calc";
import { roundMoney, viaticosAFavor, viaticosNoComprobado } from "@/lib/calc";

export interface SettlementBalanceRow {
  id: string;
  concepto: string;
  saldoAnterior: number;
  abono: number;
  saldoActual: number;
}

export interface SettlementBalanceBox {
  rows: SettlementBalanceRow[];
  saldoAnterior: number;
  abono: number;
  saldoActual: number;
}

export type SettlementSheetLineKind = "plain" | "add" | "sub" | "subtotal" | "neto" | "note";

export interface SettlementSheetLine {
  label: string;
  amount: number;
  kind: SettlementSheetLineKind;
}

export interface SettlementSheetModel {
  prestamos: SettlementBalanceBox;
  incidencias: SettlementBalanceBox;
  lines: SettlementSheetLine[];
  netoPagar: number;
  pendienteArrastrado: number;
}

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function toBox(rows: SettlementBalanceRow[]): SettlementBalanceBox {
  return {
    rows,
    saldoAnterior: roundMoney(rows.reduce((sum, row) => sum + row.saldoAnterior, 0)),
    abono: roundMoney(rows.reduce((sum, row) => sum + row.abono, 0)),
    saldoActual: roundMoney(rows.reduce((sum, row) => sum + row.saldoActual, 0)),
  };
}

function balanceRows(summary: SettlementSummary, tipo: string): SettlementBalanceRow[] {
  const items = (summary.account_items ?? []).filter((item) => item.tipo === tipo);
  const apps = (summary.account_applications ?? []).filter((app) => app.tipo === tipo);
  const itemById = new Map(items.map((item) => [item.id, item]));
  const seen = new Set<string>();
  const rows: Array<SettlementBalanceRow & { fecha: string }> = [];

  for (const app of apps) {
    seen.add(app.item_id);
    const item = itemById.get(app.item_id);
    const saldoAnterior = roundMoney(num(app.saldo_antes));
    const abono = roundMoney(num(app.monto));
    const saldoActual = roundMoney(num(app.saldo_despues));
    if (abono <= 0 && saldoActual <= 0) continue;
    rows.push({
      id: app.item_id,
      concepto: (app.concepto || item?.concepto || "Concepto").trim() || "Concepto",
      saldoAnterior,
      abono,
      saldoActual,
      fecha: item?.fecha ?? "",
    });
  }

  for (const item of items) {
    if (seen.has(item.id)) continue;
    const saldo = roundMoney(num(item.saldo));
    if (saldo <= 0) continue;
    rows.push({
      id: item.id,
      concepto: (item.concepto || "Concepto").trim() || "Concepto",
      saldoAnterior: saldo,
      abono: 0,
      saldoActual: saldo,
      fecha: item.fecha ?? "",
    });
  }

  rows.sort((a, b) => {
    const byFecha = a.fecha.localeCompare(b.fecha);
    if (byFecha !== 0) return byFecha;
    return a.id.localeCompare(b.id);
  });

  return rows.map((row) => ({
    id: row.id,
    concepto: row.concepto,
    saldoAnterior: row.saldoAnterior,
    abono: row.abono,
    saldoActual: row.saldoActual,
  }));
}

/** Arma préstamos, incidencias y el resumen del PDF a partir del cálculo ya existente. */
export function buildSettlementSheet(summary: SettlementSummary): SettlementSheetModel {
  const prestamos = toBox(balanceRows(summary, "prestamo"));
  const incidencias = toBox(balanceRows(summary, "incidencia"));

  const comisiones = roundMoney(num(summary.total_comisiones));
  const compensaciones = roundMoney(num(summary.total_compensaciones));
  const saldoViaticos = roundMoney(num(summary.saldo_viaticos));
  const descuentos = roundMoney(num(summary.total_descuentos));
  const anticipos = roundMoney(num(summary.total_anticipos));
  const subtotal = roundMoney(comisiones + compensaciones + saldoViaticos - descuentos - anticipos);

  const others = (summary.account_applications ?? []).filter(
    (app) => app.tipo !== "prestamo" && app.tipo !== "incidencia",
  );
  const otherAbono = roundMoney(others.reduce((sum, app) => sum + num(app.monto), 0));
  const otherLabel = others.every((app) => app.tipo === "pendiente")
    ? "Abono a pendiente"
    : "Otros abonos a cuenta";

  const pendienteArrastrado = roundMoney(Math.max(0, num(summary.pendiente_arrastrado)));
  const netoPagar = pendienteArrastrado > 0 ? 0 : roundMoney(num(summary.neto_pagar));

  const lines: SettlementSheetLine[] = [
    { label: "Comisión", amount: comisiones, kind: "plain" },
    { label: "Compensaciones", amount: compensaciones, kind: "add" },
    { label: "Viáticos a favor", amount: viaticosAFavor(saldoViaticos), kind: "add" },
    { label: "Descuentos", amount: descuentos, kind: "sub" },
    { label: "Anticipos", amount: anticipos, kind: "sub" },
    { label: "Viáticos no comprobados", amount: viaticosNoComprobado(saldoViaticos), kind: "sub" },
    { label: "Subtotal", amount: subtotal, kind: "subtotal" },
    { label: "Abono a préstamos", amount: prestamos.abono, kind: "sub" },
    { label: "Abono a incidencias", amount: incidencias.abono, kind: "sub" },
  ];
  if (otherAbono > 0) {
    lines.push({ label: otherLabel, amount: otherAbono, kind: "sub" });
  }
  lines.push({ label: "Neto a pagar", amount: netoPagar, kind: "neto" });
  if (pendienteArrastrado > 0) {
    lines.push({
      label: "Queda en la cuenta para la siguiente liquidación",
      amount: pendienteArrastrado,
      kind: "note",
    });
  }

  return { prestamos, incidencias, lines, netoPagar, pendienteArrastrado };
}
