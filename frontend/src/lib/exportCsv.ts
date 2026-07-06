export type CsvColumn<T> = {
  key: keyof T | string;
  label: string;
  format?: (value: unknown, row: T) => string;
};

function escapeCsvCell(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function cellValue<T>(row: T, col: CsvColumn<T>): string {
  const raw = (row as Record<string, unknown>)[col.key as string];
  if (col.format) return col.format(raw, row);
  if (raw == null) return "";
  return String(raw);
}

export function exportCsv<T>(filename: string, columns: CsvColumn<T>[], rows: T[]): void {
  const header = columns.map((c) => escapeCsvCell(c.label)).join(",");
  const body = rows.map((row) => columns.map((col) => escapeCsvCell(cellValue(row, col))).join(","));
  const csv = [header, ...body].join("\r\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportCsvSections(sections: { title: string; lines: string[] }[], filename: string): void {
  const content = sections
    .map((s) => [s.title, ...s.lines].join("\r\n"))
    .join("\r\n\r\n");
  const blob = new Blob(["\uFEFF" + content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
