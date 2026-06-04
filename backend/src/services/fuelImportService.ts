import { randomUUID } from "node:crypto";
import * as XLSX from "xlsx";
import { FuelTicket, Truck } from "../models";
import type { FuelTicketOrigen } from "../models/FuelTicket";
import {
  economicoMatchKey,
  normalizeEconomicoExact,
  normalizeTruckTag,
} from "../utils/economicoMatch";

export type FuelImportError = {
  fila: number;
  mensaje: string;
  datos?: Record<string, unknown>;
};

export type FuelImportResult = {
  creados: number;
  duplicados: number;
  errores: FuelImportError[];
  inicio?: string;
  fin?: string;
};

export function normHeader(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, "_");
}

/** Columnas Tothem: Id Tothem, Descripcion C y Tag despachado no se mapean. */
export const HEADER_ALIASES: Record<string, string[]> = {
  folio: ["folio"],
  tag: ["tag", "folio_tag"],
  numero_economico: [
    "numero_economico",
    "no_economico",
    "economico",
    "unidad",
    "numero_de_unidad",
    "numero_econ",
    "numero_eco",
    "referencia",
  ],
  fecha: ["fecha", "date"],
  hora: ["hora", "time"],
  odometro: ["odometro", "kilometraje", "km"],
  litros: ["litros", "litro", "volumen"],
  precio_litro: [
    "precio_litro",
    "precio",
    "precio_por_litro",
    "precio_por_litr",
    "precio/l",
  ],
  importe_total: ["importe_total", "importe", "total", "monto"],
  ubicacion: ["ubicacion", "estacion", "gasolinera", "ruta"],
};

const REPORTE_RANGE_RE =
  /reporte\s+del\s+(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\s+al\s+(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/i;

function isoFromDmy(d: string, m: string, yRaw: string): string {
  const year = yRaw.length === 2 ? `20${yRaw}` : yRaw;
  return `${year}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

export function findFuelHeaderRowIndex(matrix: unknown[][]): number {
  const idx = matrix.findIndex((row) => {
    const cells = row.map((c) => normHeader(String(c)));
    const hasLitros = cells.some((c) => c === "litros" || c === "litro");
    const hasFecha = cells.includes("fecha");
    const hasOdometro = cells.includes("odometro") || cells.includes("kilometraje");
    return hasLitros && hasFecha && hasOdometro;
  });
  return idx >= 0 ? idx : 0;
}

function sheetMatrix(sheet: XLSX.WorkSheet): unknown[][] {
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
}

/** Lee «Reporte del DD/MM/YYYY al DD/MM/YYYY» en filas previas al encabezado de datos. */
export function parseReportDateRangeFromSheet(sheet: XLSX.WorkSheet): { inicio: string; fin: string } | null {
  const matrix = sheetMatrix(sheet);
  if (matrix.length === 0) return null;

  const headerIdx = findFuelHeaderRowIndex(matrix);
  for (let i = 0; i < headerIdx; i++) {
    const line = matrix[i]!.map((c) => String(c).trim()).join(" ");
    const m = line.match(REPORTE_RANGE_RE);
    if (m) {
      return {
        inicio: isoFromDmy(m[1]!, m[2]!, m[3]!),
        fin: isoFromDmy(m[4]!, m[5]!, m[6]!),
      };
    }
  }

  for (const row of matrix) {
    const line = row.map((c) => String(c).trim()).join(" ");
    const m = line.match(REPORTE_RANGE_RE);
    if (m) {
      return {
        inicio: isoFromDmy(m[1]!, m[2]!, m[3]!),
        fin: isoFromDmy(m[4]!, m[5]!, m[6]!),
      };
    }
  }
  return null;
}

function mapHeaders(row: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of Object.keys(row)) {
    const n = normHeader(key);
    for (const [canonical, aliases] of Object.entries(HEADER_ALIASES)) {
      if (aliases.includes(n) || n === canonical) {
        out[canonical] = key;
        break;
      }
    }
  }
  return out;
}

function cellStr(row: Record<string, unknown>, col?: string): string {
  if (!col) return "";
  const v = row[col];
  if (v == null) return "";
  return String(v).trim();
}

function cellNum(row: Record<string, unknown>, col?: string): number | null {
  const s = cellStr(row, col);
  if (!s) return null;
  const normalized = s.replace(/[\s\u00a0\u202f]/g, "").replace(/,/g, "");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

/** Tothem / portal: filas de título antes del encabezado real (fila 3 típica). */
export function sheetToFuelDataRows(sheet: XLSX.WorkSheet): Record<string, unknown>[] {
  const matrix = sheetMatrix(sheet);
  if (matrix.length === 0) return [];

  const headerIdx = findFuelHeaderRowIndex(matrix);
  const headers = matrix[headerIdx]!.map((c) => String(c).trim());
  const rows: Record<string, unknown>[] = [];

  for (let i = headerIdx + 1; i < matrix.length; i++) {
    const line = matrix[i]!;
    if (!line.some((c) => String(c).trim() !== "")) continue;
    const obj: Record<string, unknown> = {};
    headers.forEach((h, j) => {
      if (h) obj[h] = line[j] ?? "";
    });
    const first = normHeader(String(Object.values(obj)[0] ?? ""));
    if (first.includes("total_litros") || first.includes("total_importe")) continue;
    rows.push(obj);
  }
  return rows;
}

export function parseExcelDate(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") {
    const parsed = XLSX.SSF.parse_date_code(v);
    if (!parsed) return null;
    const y = parsed.y;
    const m = String(parsed.m).padStart(2, "0");
    const d = String(parsed.d).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (m) {
    const year = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${year}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

function parseExcelTime(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") {
    const parsed = XLSX.SSF.parse_date_code(v);
    if (!parsed) return null;
    return `${String(parsed.H).padStart(2, "0")}:${String(parsed.M).padStart(2, "0")}:${String(parsed.S).padStart(2, "0")}`;
  }
  const s = String(v).trim();
  if (/^\d{1,2}:\d{2}/.test(s)) return s.length === 5 ? `${s}:00` : s.slice(0, 8);
  return null;
}

function pushIndex(map: Map<string, Truck[]>, key: string, truck: Truck) {
  const list = map.get(key) ?? [];
  if (!list.some((t) => t.id === truck.id)) list.push(truck);
  map.set(key, list);
}

export type TruckIndexes = {
  byEconomicoExact: Map<string, Truck[]>;
  byEconomicoKey: Map<string, Truck[]>;
  byTag: Map<string, Truck[]>;
};

export function buildTruckIndexes(trucks: Truck[]): TruckIndexes {
  const byEconomicoExact = new Map<string, Truck[]>();
  const byEconomicoKey = new Map<string, Truck[]>();
  const byTag = new Map<string, Truck[]>();

  for (const t of trucks) {
    pushIndex(byEconomicoExact, normalizeEconomicoExact(t.numero_economico), t);
    const key = economicoMatchKey(t.numero_economico);
    if (key) pushIndex(byEconomicoKey, key, t);
    if (t.folio_tag) pushIndex(byTag, normalizeTruckTag(String(t.folio_tag)), t);
  }

  return { byEconomicoExact, byEconomicoKey, byTag };
}

export type CatalogConflict = { mensaje: string };

export function validateTruckIndexes(indexes: TruckIndexes): CatalogConflict[] {
  const conflicts: CatalogConflict[] = [];

  for (const [eco, list] of indexes.byEconomicoExact) {
    if (list.length > 1) {
      conflicts.push({
        mensaje: `Número económico "${eco}" duplicado en catálogo: ${list.map((t) => t.numero_economico).join(", ")}`,
      });
    }
  }

  for (const [tag, list] of indexes.byTag) {
    if (list.length > 1) {
      conflicts.push({
        mensaje: `TAG "${tag}" duplicado: ${list.map((t) => t.numero_economico).join(", ")}`,
      });
    }
  }

  for (const [key, list] of indexes.byEconomicoKey) {
    if (list.length > 1) {
      conflicts.push({
        mensaje: `Clave flexible "${key}" ambigua: ${list.map((t) => t.numero_economico).join(", ")}`,
      });
    }
  }

  return conflicts;
}

function catalogAmbiguityMessage(conflicts: CatalogConflict[]): string {
  const detail = conflicts.map((c) => c.mensaje).join("; ");
  return `Catálogo de camiones ambiguo: ${detail}`;
}

function resolveTruck(
  economico: string,
  tag: string,
  indexes: TruckIndexes,
): { truck: Truck | null; ambiguous: boolean; mensaje?: string } {
  const { byEconomicoExact, byEconomicoKey, byTag } = indexes;

  if (economico) {
    const exactList = byEconomicoExact.get(normalizeEconomicoExact(economico));
    if (exactList?.length === 1) return { truck: exactList[0]!, ambiguous: false };
    if (exactList && exactList.length > 1) {
      return {
        truck: null,
        ambiguous: true,
        mensaje: `Número económico "${economico}" ambiguo en catálogo (coincidencia exacta)`,
      };
    }

    const key = economicoMatchKey(economico);
    if (key) {
      const hits = byEconomicoKey.get(key);
      if (hits?.length === 1) return { truck: hits[0]!, ambiguous: false };
      if (hits && hits.length > 1) {
        return {
          truck: null,
          ambiguous: true,
          mensaje: `Número económico ambiguo (${economico}): varias unidades coinciden (clave "${key}")`,
        };
      }
    }
  }

  if (tag) {
    const tagList = byTag.get(normalizeTruckTag(tag));
    if (tagList?.length === 1) return { truck: tagList[0]!, ambiguous: false };
    if (tagList && tagList.length > 1) {
      return {
        truck: null,
        ambiguous: true,
        mensaje: `TAG "${tag}" ambiguo: ${tagList.map((t) => t.numero_economico).join(", ")}`,
      };
    }
  }

  return { truck: null, ambiguous: false };
}

function minMaxIsoDates(dates: string[]): { inicio: string; fin: string } | null {
  if (dates.length === 0) return null;
  const sorted = [...dates].sort();
  return { inicio: sorted[0]!, fin: sorted[sorted.length - 1]! };
}

function fuelDataStartRow(sheet: XLSX.WorkSheet): number {
  const matrix = sheetMatrix(sheet);
  const headerIdx = findFuelHeaderRowIndex(matrix);
  return headerIdx + 2;
}

export async function importFuelTicketsFromBuffer(
  tenantId: string,
  buffer: Buffer,
  origen: FuelTicketOrigen = "import_excel",
): Promise<FuelImportResult> {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: false });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) {
    return { creados: 0, duplicados: 0, errores: [{ fila: 0, mensaje: "El archivo no tiene hojas" }] };
  }
  const sheet = wb.Sheets[sheetName]!;
  const rows = sheetToFuelDataRows(sheet);
  if (rows.length === 0) {
    return { creados: 0, duplicados: 0, errores: [{ fila: 0, mensaje: "El archivo está vacío o sin filas de datos" }] };
  }

  const reportRange = parseReportDateRangeFromSheet(sheet);
  const headerMap = mapHeaders(rows[0]!);
  const trucks = await Truck.findAll({ where: { tenant_id: tenantId } });
  const indexes = buildTruckIndexes(trucks);
  const catalogConflicts = validateTruckIndexes(indexes);
  if (catalogConflicts.length > 0) {
    return {
      creados: 0,
      duplicados: 0,
      inicio: reportRange?.inicio,
      fin: reportRange?.fin,
      errores: [{ fila: 0, mensaje: catalogAmbiguityMessage(catalogConflicts) }],
    };
  }

  const toInsert: Array<Record<string, unknown>> = [];
  const errores: FuelImportError[] = [];
  const parsedFechas: string[] = [];
  const dataStartRow = fuelDataStartRow(sheet);

  rows.forEach((row, idx) => {
    const fila = dataStartRow + idx;
    const economico = cellStr(row, headerMap.numero_economico);
    const tagVal = cellStr(row, headerMap.tag);
    const folio = cellStr(row, headerMap.folio);
    const fecha = parseExcelDate(row[headerMap.fecha ?? ""]);
    const litros = cellNum(row, headerMap.litros);
    const precio = cellNum(row, headerMap.precio_litro);
    const odometro = cellNum(row, headerMap.odometro);
    const importe = cellNum(row, headerMap.importe_total);

    if (!folio) {
      errores.push({ fila, mensaje: "Folio faltante", datos: row });
      return;
    }
    if (!economico && !tagVal) {
      errores.push({ fila, mensaje: "Fila sin número económico ni TAG", datos: row });
      return;
    }
    if (!fecha) {
      errores.push({ fila, mensaje: "Fecha inválida o faltante", datos: row });
      return;
    }
    parsedFechas.push(fecha);
    if (litros == null || litros <= 0) {
      errores.push({ fila, mensaje: "Litros inválidos", datos: row });
      return;
    }
    if (precio == null || precio <= 0) {
      errores.push({ fila, mensaje: "Precio por litro inválido", datos: row });
      return;
    }
    if (odometro == null || odometro < 0) {
      errores.push({ fila, mensaje: "Odómetro inválido", datos: row });
      return;
    }

    const resolved = resolveTruck(economico, tagVal, indexes);
    if (resolved.ambiguous) {
      errores.push({
        fila,
        mensaje: resolved.mensaje ?? `Número económico ambiguo (${economico || "—"}): varias unidades coinciden`,
        datos: row,
      });
      return;
    }
    if (!resolved.truck) {
      errores.push({
        fila,
        mensaje: `No se encontró camión (económico: ${economico || "—"}, TAG: ${tagVal || "—"})`,
        datos: row,
      });
      return;
    }

    const hora = parseExcelTime(row[headerMap.hora ?? ""]);
    const total = importe != null && importe > 0 ? importe : Math.round(litros * precio * 100) / 100;
    const ubicacion = cellStr(row, headerMap.ubicacion) || "Gasolinera";

    toInsert.push({
      id: randomUUID(),
      tenant_id: tenantId,
      truck_id: resolved.truck.id,
      fecha,
      hora,
      folio,
      tag: tagVal || null,
      numero_economico_raw: economico || resolved.truck.numero_economico,
      placas_raw: resolved.truck.placas,
      odometro: Math.round(odometro),
      litros: String(litros),
      precio_litro: String(precio),
      importe_total: String(total),
      ubicacion,
      origen,
      external_id: `${folio}|${fecha}|${Math.round(odometro)}`,
      created_at: new Date(),
      updated_at: new Date(),
    });
  });

  const rowRange = minMaxIsoDates(parsedFechas);
  const inicio = reportRange?.inicio ?? rowRange?.inicio;
  const fin = reportRange?.fin ?? rowRange?.fin;
  const rangeFields = inicio && fin ? { inicio, fin } : {};

  if (toInsert.length === 0) {
    return { creados: 0, duplicados: 0, errores, ...rangeFields };
  }

  try {
    const created = await FuelTicket.bulkCreate(toInsert as never[], { ignoreDuplicates: true });
    const creados = created.length;
    const duplicados = toInsert.length - creados;
    return { creados, duplicados, errores, ...rangeFields };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al importar";
    errores.push({ fila: 0, mensaje: msg });
    return { creados: 0, duplicados: 0, errores, ...rangeFields };
  }
}
