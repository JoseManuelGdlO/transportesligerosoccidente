import type { Border, Borders, Cell, Fill, Worksheet, Workbook } from "exceljs";

/** Mismo lenguaje visual que el resumen semanal de liquidaciones. */
const HEADER_FILL = "FF4A4A4A";
const TOTAL_FILL = "FFF2F2F2";
const GRID = "FFD0D0D0";
const NEGATIVE = "FFB91C1C";
const MUTED = "FF4B5563";
const WHITE = "FFFFFFFF";
const MONEY_FMT = '"$"#,##0.00;[Red]\\-"$"#,##0.00;"-"';
const NUMBER_FMT = "#,##0.00";
const INTEGER_FMT = "#,##0";
const PERCENT_FMT = '0.00"%"';

export type CellKind = "text" | "money" | "number" | "integer" | "percent";

export type TableColumn = {
  key: string;
  header: string;
  kind?: CellKind;
  width?: number;
  /** Por defecto se suman dinero, números y enteros. `margen` recalcula utilidad / ingreso. */
  total?: "sum" | "none" | "margen";
};

export type CellValue = string | number | null | undefined;

export type TableSheet = {
  type: "table";
  name: string;
  title: string;
  subtitle?: string;
  columns: TableColumn[];
  rows: ReadonlyArray<Record<string, CellValue>>;
  totals?: boolean | { label?: string; values: Record<string, CellValue> };
};

export type PairRow = {
  label: string;
  value: CellValue;
  kind: CellKind;
};

export type PairsSheet = {
  type: "pairs";
  name: string;
  title: string;
  subtitle?: string;
  rows: readonly PairRow[];
};

export type WorkbookSheet = TableSheet | PairsSheet;

type ExcelModule = typeof import("exceljs");

function solid(argb: string): Fill {
  return { type: "pattern", pattern: "solid", fgColor: { argb } };
}

function thinBorder(): Partial<Borders> {
  const side: Partial<Border> = { style: "thin", color: { argb: GRID } };
  return { top: side, left: side, bottom: side, right: side };
}

async function loadExcel(): Promise<ExcelModule> {
  const loaded = (await import("exceljs")) as ExcelModule & { default?: ExcelModule };
  if (typeof loaded.Workbook === "function") return loaded;
  if (loaded.default && typeof loaded.default.Workbook === "function") return loaded.default;
  throw new Error("No se pudo cargar ExcelJS");
}

function sheetName(name: string, wb: Workbook): string {
  const base = name.replace(/[\\/*?:[\]]/g, " ").replace(/\s+/g, " ").trim().slice(0, 31) || "Hoja";
  const taken = new Set(wb.worksheets.map((ws) => ws.name));
  if (!taken.has(base)) return base;
  for (let i = 2; i < 50; i += 1) {
    const suffix = ` ${i}`;
    const next = `${base.slice(0, 31 - suffix.length)}${suffix}`;
    if (!taken.has(next)) return next;
  }
  return base;
}

function paintTitle(ws: Worksheet, colCount: number, title: string, subtitle?: string): number {
  const span = Math.max(colCount, 2);
  ws.mergeCells(1, 1, 1, span);
  const titleCell = ws.getCell(1, 1);
  titleCell.value = title;
  titleCell.font = { bold: true, color: { argb: WHITE }, name: "Calibri", size: 14 };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(1).height = 24;
  for (let col = 1; col <= span; col += 1) {
    ws.getCell(1, col).fill = solid(HEADER_FILL);
  }

  if (!subtitle) return 2;
  ws.mergeCells(2, 1, 2, span);
  const sub = ws.getCell(2, 1);
  sub.value = subtitle;
  sub.font = { italic: true, name: "Calibri", size: 11, color: { argb: MUTED } };
  sub.alignment = { horizontal: "left", vertical: "middle" };
  return 3;
}

function paintHeader(cell: Cell, header: string) {
  cell.value = header;
  cell.font = { bold: true, color: { argb: WHITE }, name: "Calibri", size: 10 };
  cell.fill = solid(HEADER_FILL);
  cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  cell.border = thinBorder();
}

function paintCell(cell: Cell, value: CellValue, kind: CellKind, bold: boolean) {
  const fontBase = { name: "Calibri", size: 11, bold };
  cell.border = thinBorder();
  cell.alignment = { vertical: "middle", horizontal: kind === "text" ? "left" : "right" };

  if (value == null || value === "") {
    cell.value = null;
    cell.font = fontBase;
    return;
  }
  if (typeof value === "string" || kind === "text") {
    cell.value = String(value);
    cell.font = fontBase;
    cell.alignment = { vertical: "middle", horizontal: "left" };
    return;
  }
  if (!Number.isFinite(value)) {
    cell.value = null;
    cell.font = fontBase;
    return;
  }

  cell.value = value;
  const negative = value < 0 ? { argb: NEGATIVE } : undefined;
  if (kind === "money") {
    cell.numFmt = MONEY_FMT;
    cell.font = { ...fontBase, color: negative };
  } else if (kind === "integer") {
    cell.numFmt = INTEGER_FMT;
    cell.font = fontBase;
  } else if (kind === "percent") {
    cell.numFmt = PERCENT_FMT;
    cell.font = { ...fontBase, color: negative };
  } else {
    cell.numFmt = NUMBER_FMT;
    cell.font = { ...fontBase, color: negative };
  }
}

function columnWidth(col: TableColumn): number {
  const kind = col.kind ?? "text";
  const byKind = kind === "money" ? 16 : kind === "text" ? 18 : kind === "percent" ? 13 : 14;
  const byHeader = Math.min(40, col.header.length + 3);
  return col.width ?? Math.max(byKind, byHeader);
}

function canSum(col: TableColumn): boolean {
  if (col.total === "none") return false;
  if (col.total === "sum") return true;
  const kind = col.kind ?? "text";
  return kind === "money" || kind === "number" || kind === "integer";
}

function marginRatio(rows: ReadonlyArray<Record<string, CellValue>>): number {
  const ingreso = rows.reduce((acc, row) => acc + (typeof row.ingreso === "number" ? row.ingreso : 0), 0);
  const utilidad = rows.reduce((acc, row) => acc + (typeof row.utilidad === "number" ? row.utilidad : 0), 0);
  if (ingreso <= 0) return 0;
  return roundFor("percent", (utilidad / ingreso) * 100);
}

function roundFor(kind: CellKind, value: number): number {
  if (kind === "integer") return Math.round(value);
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function writeTable(wb: Workbook, sheet: TableSheet) {
  const columns = sheet.columns;
  const ws = wb.addWorksheet(sheetName(sheet.name, wb), {
    pageSetup: {
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      paperSize: 9,
    },
  });
  const headerRowIndex = paintTitle(ws, columns.length, sheet.title, sheet.subtitle);
  const headerRow = ws.getRow(headerRowIndex);
  headerRow.height = 32;
  columns.forEach((col, index) => {
    paintHeader(headerRow.getCell(index + 1), col.header);
    ws.getColumn(index + 1).width = columnWidth(col);
  });

  sheet.rows.forEach((row, rowIndex) => {
    const excelRow = ws.getRow(headerRowIndex + 1 + rowIndex);
    columns.forEach((col, index) => {
      paintCell(excelRow.getCell(index + 1), row[col.key], col.kind ?? "text", false);
    });
  });

  if (sheet.totals && columns.length > 0) {
    const totalRow = ws.getRow(headerRowIndex + 1 + sheet.rows.length);
    const explicit = sheet.totals === true ? null : sheet.totals;
    columns.forEach((col, index) => {
      const cell = totalRow.getCell(index + 1);
      cell.fill = solid(TOTAL_FILL);
      if (index === 0) {
        paintCell(cell, explicit?.label ?? "TOTALES", "text", true);
        cell.fill = solid(TOTAL_FILL);
        return;
      }
      if (explicit) {
        const value = explicit.values[col.key];
        paintCell(cell, value ?? null, col.kind ?? "text", true);
        cell.fill = solid(TOTAL_FILL);
        return;
      }
      if (col.total === "margen") {
        paintCell(cell, marginRatio(sheet.rows), "percent", true);
        cell.fill = solid(TOTAL_FILL);
        return;
      }
      if (!canSum(col)) {
        paintCell(cell, null, col.kind ?? "text", true);
        cell.fill = solid(TOTAL_FILL);
        return;
      }
      const kind = col.kind ?? "number";
      const sum = sheet.rows.reduce((acc, row) => {
        const value = row[col.key];
        return acc + (typeof value === "number" && Number.isFinite(value) ? value : 0);
      }, 0);
      paintCell(cell, roundFor(kind, sum), kind, true);
      cell.fill = solid(TOTAL_FILL);
    });
  }

  if (sheet.rows.length > 0) {
    ws.autoFilter = {
      from: { row: headerRowIndex, column: 1 },
      to: { row: headerRowIndex + sheet.rows.length, column: columns.length },
    };
  }
  ws.views = [{ state: "frozen", ySplit: headerRowIndex }];
  ws.pageSetup.printTitlesRow = `${headerRowIndex}:${headerRowIndex}`;
}

function writePairs(wb: Workbook, sheet: PairsSheet) {
  const ws = wb.addWorksheet(sheetName(sheet.name, wb), {
    pageSetup: {
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      paperSize: 9,
    },
  });
  const headerRowIndex = paintTitle(ws, 2, sheet.title, sheet.subtitle);
  const headerRow = ws.getRow(headerRowIndex);
  headerRow.height = 32;
  paintHeader(headerRow.getCell(1), "CONCEPTO");
  paintHeader(headerRow.getCell(2), "VALOR");
  ws.getColumn(1).width = 36;
  ws.getColumn(2).width = 22;

  sheet.rows.forEach((row, index) => {
    const excelRow = ws.getRow(headerRowIndex + 1 + index);
    paintCell(excelRow.getCell(1), row.label, "text", false);
    paintCell(excelRow.getCell(2), row.value, row.kind, false);
  });
  ws.views = [{ state: "frozen", ySplit: headerRowIndex }];
  ws.pageSetup.printTitlesRow = `${headerRowIndex}:${headerRowIndex}`;
}

export async function buildWorkbookBuffer(sheets: WorkbookSheet[]): Promise<Uint8Array> {
  if (sheets.length === 0) throw new Error("No hay hojas para exportar");
  const { Workbook } = await loadExcel();
  const wb = new Workbook();
  wb.creator = "Transportes Ligeros de Occidente";
  wb.created = new Date();
  for (const sheet of sheets) {
    if (sheet.type === "pairs") writePairs(wb, sheet);
    else writeTable(wb, sheet);
  }
  const raw = (await wb.xlsx.writeBuffer()) as ArrayBuffer | Uint8Array;
  if (raw instanceof Uint8Array) return raw;
  return new Uint8Array(raw);
}

export async function downloadWorkbook(filename: string, sheets: WorkbookSheet[]): Promise<void> {
  const bytes = await buildWorkbookBuffer(sheets);
  const blob = new Blob([bytes], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`;
  link.click();
  URL.revokeObjectURL(url);
}
