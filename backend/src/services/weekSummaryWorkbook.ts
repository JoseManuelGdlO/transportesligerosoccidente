import ExcelJS from "exceljs";
import { roundMoney } from "./calc";
import { num } from "../utils/numbers";

/** Columnas que el usuario puede mostrar u ocultar en el Excel. */
export const WEEK_EXPORT_CONCEPTS = [
  "tipo_unidad",
  "facturacion",
  "comision",
  "viaticos",
  "comprobaciones",
  "descuentos",
  "deposito_nomina",
  "compensacion",
  "anticipo",
  "total_efectivo",
] as const;

export type WeekExportConcept = (typeof WEEK_EXPORT_CONCEPTS)[number];

/** Métricas del PDF de liquidación que no van en las columnas base del resumen. */
export const WEEK_EXPORT_EXTRAS = [
  "viaticos_no_comprobados",
  "viaticos_a_favor",
  "subtotal",
  "saldo_anterior",
  "abono_cuenta",
  "saldo_actual",
  "neto_pagar",
  "km",
  "viajes",
] as const;

export type WeekExportExtra = (typeof WEEK_EXPORT_EXTRAS)[number];

export type WeekExportColumn = WeekExportConcept | WeekExportExtra;

export type WeekExportFuente = "preliquidacion" | "liquidacion";

export type WeekExportOrigen = WeekExportFuente | "vivo";

export type WeekExportConcepts = {
  tipo_unidad: string;
  facturacion: number;
  comision: number;
  viaticos: number;
  comprobaciones: number;
  descuentos: number;
  deposito_nomina: number;
  compensacion: number;
  anticipo: number;
  viaticos_no_comprobados: number;
  viaticos_a_favor: number;
  subtotal: number;
  saldo_anterior: number;
  abono_cuenta: number;
  saldo_actual: number;
  neto_pagar: number;
  km: number;
  viajes: number;
};

export type WeekExportRow = {
  driver_nombre: string;
  origen: WeekExportOrigen;
  concepts: WeekExportConcepts;
};

export type WeekExportOmitido = {
  driver_nombre: string;
  motivo: string;
};

const MESES = [
  "ENERO",
  "FEBRERO",
  "MARZO",
  "ABRIL",
  "MAYO",
  "JUNIO",
  "JULIO",
  "AGOSTO",
  "SEPTIEMBRE",
  "OCTUBRE",
  "NOVIEMBRE",
  "DICIEMBRE",
];

const COLUMN_META: Record<
  WeekExportColumn,
  { header: string; kind: "text" | "money" | "efectivo" | "count"; width: number }
> = {
  tipo_unidad: { header: "TIPO UNIDAD", kind: "text", width: 16 },
  facturacion: { header: "FACTURACION", kind: "money", width: 16 },
  comision: { header: "% OPERADOR", kind: "money", width: 16 },
  viaticos: { header: "VIATICOS", kind: "money", width: 14 },
  comprobaciones: { header: "COMPROBACIONES", kind: "money", width: 18 },
  descuentos: { header: "DESCUENTOS", kind: "money", width: 15 },
  deposito_nomina: { header: "DEPOSITO DE NOMINA", kind: "money", width: 18 },
  compensacion: { header: "COMPENSACION", kind: "money", width: 16 },
  anticipo: { header: "ANTICIPO", kind: "money", width: 14 },
  total_efectivo: { header: "TOTAL EFECTIVO", kind: "efectivo", width: 16 },
  viaticos_no_comprobados: { header: "VIATICOS NO COMPROBADOS", kind: "money", width: 18 },
  viaticos_a_favor: { header: "VIATICOS A FAVOR", kind: "money", width: 16 },
  subtotal: { header: "SUBTOTAL", kind: "money", width: 14 },
  saldo_anterior: { header: "SALDO ANTERIOR", kind: "money", width: 16 },
  abono_cuenta: { header: "ABONO A CUENTA", kind: "money", width: 16 },
  saldo_actual: { header: "SALDO ACTUAL", kind: "money", width: 15 },
  neto_pagar: { header: "NETO A PAGAR", kind: "money", width: 15 },
  km: { header: "KM", kind: "count", width: 12 },
  viajes: { header: "VIAJES", kind: "count", width: 12 },
};

const MONEY_FMT = '"$"#,##0.00;[Red]\\-"$"#,##0.00;"-"';
const HEADER_FILL = "FF4A4A4A";
const TOTAL_FILL = "FFF2F2F2";
const GRID = "FFD0D0D0";

type DateParts = { year: number; month: number; day: number };

function splitDate(iso: string): DateParts | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim().slice(0, 10));
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

/** Título del ejemplo: "RESUMEN LIQUIDACIONES DEL 25 DE OCTUBRE AL 30". */
export function resumenPeriodTitle(inicio: string, fin: string): string {
  const desde = splitDate(inicio);
  const hasta = splitDate(fin);
  if (!desde || !hasta) return `RESUMEN LIQUIDACIONES DEL ${inicio} AL ${fin}`;
  const left = `${desde.day} DE ${MESES[desde.month - 1]}`;
  const sameMonth = desde.month === hasta.month && desde.year === hasta.year;
  const right = sameMonth ? String(hasta.day) : `${hasta.day} DE ${MESES[hasta.month - 1]}`;
  const yearDesde = desde.year !== hasta.year ? ` DE ${desde.year}` : "";
  const yearHasta = desde.year !== hasta.year ? ` DE ${hasta.year}` : "";
  return `RESUMEN LIQUIDACIONES DEL ${left}${yearDesde} AL ${right}${yearHasta}`;
}

type MoneyLine = { tipo?: string; monto?: unknown; en_periodo?: boolean };

function inPeriodLines(raw: unknown): MoneyLine[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((row): row is MoneyLine => !!row && typeof row === "object");
}

/**
 * Parte el snapshot en las columnas del resumen.
 * El depósito de nómina es el descuento tipo nómina; el resto va a descuentos.
 * Los abonos a cuenta se suman a descuentos para que el total efectivo cuadre con el neto.
 */
export function conceptsFromSnapshot(snapshot: Record<string, unknown>, tipoUnidad: string): WeekExportConcepts {
  const lines = inPeriodLines(snapshot.discounts).filter((row) => row.en_periodo !== false);
  let nomina = 0;
  let otros = 0;
  for (const line of lines) {
    const monto = num(line.monto);
    if ((line.tipo ?? "").trim().toLowerCase() === "nomina") nomina += monto;
    else otros += monto;
  }
  const totalDescuentos = roundMoney(num(snapshot.total_descuentos));
  const classified = roundMoney(nomina + otros);
  if (lines.length === 0 || classified !== totalDescuentos) {
    nomina = Math.min(roundMoney(nomina), totalDescuentos);
    otros = roundMoney(totalDescuentos - nomina);
  } else {
    nomina = roundMoney(nomina);
    otros = roundMoney(otros);
  }
  const abonos = roundMoney(num(snapshot.total_cuenta_abonos));
  const comision = roundMoney(num(snapshot.total_comisiones));
  const compensacion = roundMoney(num(snapshot.total_compensaciones));
  const anticipo = roundMoney(num(snapshot.total_anticipos));
  const viaticos = roundMoney(num(snapshot.viaticos_entregados));
  const comprobaciones = roundMoney(num(snapshot.viaticos_comprobados));
  const saldoViaticos =
    snapshot.saldo_viaticos == null
      ? roundMoney(comprobaciones - viaticos)
      : roundMoney(num(snapshot.saldo_viaticos));
  const adeudo = adeudoFromSnapshot(snapshot);
  const neto = roundMoney(num(snapshot.neto_pagar));
  const pendiente =
    snapshot.pendiente_arrastrado == null
      ? roundMoney(Math.max(0, -neto))
      : roundMoney(Math.max(0, num(snapshot.pendiente_arrastrado)));
  return {
    tipo_unidad: tipoUnidad,
    facturacion: roundMoney(num(snapshot.total_ingresos)),
    comision,
    viaticos,
    comprobaciones,
    descuentos: roundMoney(otros + abonos),
    deposito_nomina: nomina,
    compensacion,
    anticipo,
    viaticos_no_comprobados: roundMoney(Math.max(0, -saldoViaticos)),
    viaticos_a_favor: roundMoney(Math.max(0, saldoViaticos)),
    subtotal: roundMoney(comision + compensacion + saldoViaticos - totalDescuentos - anticipo),
    saldo_anterior: adeudo.saldoAnterior,
    abono_cuenta: adeudo.abono,
    saldo_actual: adeudo.saldoActual,
    neto_pagar: pendiente > 0 ? 0 : neto,
    km: roundMoney(num(snapshot.total_km)),
    viajes: includedTripCount(snapshot.trips),
  };
}

function objectRows(raw: unknown): Record<string, unknown>[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((row): row is Record<string, unknown> => !!row && typeof row === "object");
}

/** Adeudo del PDF: préstamos e incidencias, con saldo anterior, abono y saldo actual. */
function adeudoFromSnapshot(snapshot: Record<string, unknown>): {
  saldoAnterior: number;
  abono: number;
  saldoActual: number;
} {
  const tipos = new Set(["prestamo", "incidencia"]);
  const items = objectRows(snapshot.account_items).filter((item) => tipos.has(String(item.tipo ?? "")));
  const apps = objectRows(snapshot.account_applications).filter((app) => tipos.has(String(app.tipo ?? "")));
  const seen = new Set<string>();
  let saldoAnterior = 0;
  let abono = 0;
  let saldoActual = 0;

  for (const app of apps) {
    const id = String(app.item_id ?? "");
    seen.add(id);
    const abonoMonto = roundMoney(num(app.monto));
    const saldoDespues = roundMoney(num(app.saldo_despues));
    if (abonoMonto <= 0 && saldoDespues <= 0) continue;
    saldoAnterior += roundMoney(num(app.saldo_antes));
    abono += abonoMonto;
    saldoActual += saldoDespues;
  }

  for (const item of items) {
    const id = String(item.id ?? "");
    if (seen.has(id)) continue;
    const saldo = roundMoney(num(item.saldo));
    if (saldo <= 0) continue;
    saldoAnterior += saldo;
    saldoActual += saldo;
  }

  return {
    saldoAnterior: roundMoney(saldoAnterior),
    abono: roundMoney(abono),
    saldoActual: roundMoney(saldoActual),
  };
}

function includedTripCount(trips: unknown): number {
  if (!Array.isArray(trips)) return 0;
  return trips.filter((trip) => !!trip && typeof trip === "object" && (trip as { included?: boolean }).included !== false)
    .length;
}

/** Total efectivo con solo los conceptos visibles. Ocultar viáticos lo saca del neto. */
export function totalEfectivo(concepts: WeekExportConcepts, visible: ReadonlySet<WeekExportConcept>): number {
  let total = 0;
  if (visible.has("comision")) total += concepts.comision;
  if (visible.has("viaticos")) total -= concepts.viaticos;
  if (visible.has("comprobaciones")) total += concepts.comprobaciones;
  if (visible.has("descuentos")) total -= concepts.descuentos;
  if (visible.has("deposito_nomina")) total -= concepts.deposito_nomina;
  if (visible.has("compensacion")) total += concepts.compensacion;
  if (visible.has("anticipo")) total -= concepts.anticipo;
  return roundMoney(total);
}

/** Modelo de la unidad que más viajes incluidos tiene. */
export function predominantUnitType(trips: unknown, trucksById: ReadonlyMap<string, string>): string {
  if (!Array.isArray(trips)) return "";
  const counts = new Map<string, number>();
  for (const raw of trips) {
    if (!raw || typeof raw !== "object") continue;
    const trip = raw as { included?: boolean; truck_id?: unknown };
    if (trip.included === false) continue;
    const label = (trucksById.get(String(trip.truck_id ?? "")) ?? "").trim();
    if (!label) continue;
    const key = label.toUpperCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let best = "";
  let bestCount = 0;
  for (const [label, count] of counts) {
    if (count > bestCount) {
      best = label;
      bestCount = count;
    }
  }
  return best;
}

function conceptAmount(
  key: WeekExportColumn,
  concepts: WeekExportConcepts,
  visible: ReadonlySet<WeekExportConcept>,
): number {
  if (key === "total_efectivo") return totalEfectivo(concepts, visible);
  if (key === "tipo_unidad") return 0;
  return concepts[key];
}

function visibleConcepts(selected: readonly WeekExportConcept[]): WeekExportConcept[] {
  const set = new Set(selected);
  return WEEK_EXPORT_CONCEPTS.filter((key) => set.has(key));
}

function selectedExtras(selected: readonly WeekExportExtra[]): WeekExportExtra[] {
  const set = new Set(selected);
  return WEEK_EXPORT_EXTRAS.filter((key) => set.has(key));
}

function thinBorder(): Partial<ExcelJS.Borders> {
  const side: Partial<ExcelJS.Border> = { style: "thin", color: { argb: GRID } };
  return { top: side, left: side, bottom: side, right: side };
}

function paintMoney(cell: ExcelJS.Cell, value: number, bold: boolean) {
  cell.value = value;
  cell.numFmt = MONEY_FMT;
  cell.alignment = { horizontal: "right" };
  cell.font = {
    bold,
    color: value < 0 ? { argb: "FFB91C1C" } : undefined,
    name: "Calibri",
    size: 11,
  };
  cell.border = thinBorder();
}

function paintCount(cell: ExcelJS.Cell, value: number, bold: boolean) {
  cell.value = value;
  cell.numFmt = "#,##0";
  cell.alignment = { horizontal: "right" };
  cell.font = { bold, name: "Calibri", size: 11 };
  cell.border = thinBorder();
}

export async function buildWeekSummaryWorkbook(input: {
  inicio: string;
  fin: string;
  fuente: WeekExportFuente;
  conceptos: readonly WeekExportConcept[];
  adicionales: readonly WeekExportExtra[];
  rows: readonly WeekExportRow[];
  omitidos: readonly WeekExportOmitido[];
}): Promise<Buffer> {
  const mainColumns = visibleConcepts(input.conceptos);
  const columns: WeekExportColumn[] = [...mainColumns, ...selectedExtras(input.adicionales)];
  const visible = new Set(mainColumns);
  const colCount = 1 + columns.length;
  const fuenteLabel = input.fuente === "liquidacion" ? "Liquidación" : "Preliquidación";

  const wb = new ExcelJS.Workbook();
  wb.creator = "Transportes Ligeros de Occidente";
  const ws = wb.addWorksheet("Resumen", {
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 1, paperSize: 9 },
    views: [{ state: "frozen", ySplit: 3 }],
  });

  ws.mergeCells(1, 1, 1, Math.max(colCount, 2));
  const title = ws.getCell(1, 1);
  title.value = resumenPeriodTitle(input.inicio, input.fin);
  title.font = { bold: true, color: { argb: "FFFFFFFF" }, name: "Calibri", size: 14 };
  title.alignment = { horizontal: "center", vertical: "middle" };
  title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
  ws.getRow(1).height = 24;
  for (let col = 1; col <= Math.max(colCount, 2); col += 1) {
    ws.getCell(1, col).fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
  }

  ws.mergeCells(2, 1, 2, Math.max(colCount, 2));
  const fuenteCell = ws.getCell(2, 1);
  fuenteCell.value = `Fuente: ${fuenteLabel}`;
  fuenteCell.font = { italic: true, name: "Calibri", size: 11, color: { argb: "FF4B5563" } };
  fuenteCell.alignment = { horizontal: "left", vertical: "middle" };

  const headerRow = ws.getRow(3);
  headerRow.height = 32;
  const headers = ["OPERADOR", ...columns.map((key) => COLUMN_META[key].header)];
  headers.forEach((header, index) => {
    const cell = headerRow.getCell(index + 1);
    cell.value = header;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, name: "Calibri", size: 10 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = thinBorder();
  });

  ws.getColumn(1).width = 36;
  columns.forEach((key, index) => {
    ws.getColumn(index + 2).width = COLUMN_META[key].width;
  });

  const sums = new Map<WeekExportColumn, number>();
  for (const key of columns) {
    if (key !== "tipo_unidad") sums.set(key, 0);
  }

  input.rows.forEach((row, rowIndex) => {
    const excelRow = ws.getRow(4 + rowIndex);
    const name = row.origen === "vivo" ? `${row.driver_nombre.toUpperCase()} *` : row.driver_nombre.toUpperCase();
    const nameCell = excelRow.getCell(1);
    nameCell.value = name;
    nameCell.font = { name: "Calibri", size: 11 };
    nameCell.alignment = { vertical: "middle" };
    nameCell.border = thinBorder();

    columns.forEach((key, index) => {
      const cell = excelRow.getCell(index + 2);
      const meta = COLUMN_META[key];
      if (meta.kind === "text") {
        cell.value = row.concepts.tipo_unidad || "";
        cell.alignment = { horizontal: "center", vertical: "middle" };
        cell.font = { name: "Calibri", size: 11 };
        cell.border = thinBorder();
        return;
      }
      const amount = conceptAmount(key, row.concepts, visible);
      if (meta.kind === "count") paintCount(cell, amount, false);
      else paintMoney(cell, amount, meta.kind === "efectivo");
      sums.set(key, roundMoney((sums.get(key) ?? 0) + amount));
    });
  });

  const totalRowIndex = 4 + input.rows.length;
  const totalRow = ws.getRow(totalRowIndex);
  const totalLabel = totalRow.getCell(1);
  totalLabel.value = "TOTALES";
  totalLabel.font = { bold: true, name: "Calibri", size: 11 };
  totalLabel.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TOTAL_FILL } };
  totalLabel.border = thinBorder();

  columns.forEach((key, index) => {
    const cell = totalRow.getCell(index + 2);
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TOTAL_FILL } };
    if (COLUMN_META[key].kind === "text") {
      cell.value = "";
      cell.border = thinBorder();
      return;
    }
    const total = sums.get(key) ?? 0;
    if (COLUMN_META[key].kind === "count") paintCount(cell, total, true);
    else paintMoney(cell, total, true);
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TOTAL_FILL } };
  });

  const notes: string[] = [];
  if (input.rows.some((row) => row.origen === "vivo")) {
    notes.push(
      "* Cálculo en vivo: ese operador no tiene la fuente elegida guardada en el periodo. No se usó el otro documento.",
    );
  }
  if (input.omitidos.length > 0) {
    const names = input.omitidos.map((row) => row.driver_nombre).join(", ");
    notes.push(`No incluidos: ${names}. ${input.omitidos[0]?.motivo ?? ""}`.trim());
  }
  if (notes.length > 0) {
    const noteRow = totalRowIndex + 2;
    notes.forEach((note, index) => {
      const cell = ws.getCell(noteRow + index, 1);
      cell.value = note;
      cell.font = { italic: true, size: 9, name: "Calibri", color: { argb: "FF6B7280" } };
      ws.mergeCells(noteRow + index, 1, noteRow + index, Math.max(colCount, 2));
    });
  }

  const raw = await wb.xlsx.writeBuffer();
  return Buffer.from(raw);
}
