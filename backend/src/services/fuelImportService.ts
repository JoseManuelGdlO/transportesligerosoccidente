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
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
  if (matrix.length === 0) return [];

  let headerIdx = matrix.findIndex((row) => {
    const cells = row.map((c) => normHeader(String(c)));
    const hasLitros = cells.some((c) => c === "litros" || c === "litro");
    const hasFecha = cells.includes("fecha");
    const hasOdometro = cells.includes("odometro") || cells.includes("kilometraje");
    return hasLitros && hasFecha && hasOdometro;
  });
  if (headerIdx < 0) headerIdx = 0;

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

function parseExcelDate(v: unknown): string | null {
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

function buildTruckIndexes(trucks: Truck[]) {
  const byEconomicoExact = new Map<string, Truck>();
  const byEconomicoKey = new Map<string, Truck[]>();
  const byTag = new Map<string, Truck>();

  for (const t of trucks) {
    byEconomicoExact.set(normalizeEconomicoExact(t.numero_economico), t);
    const key = economicoMatchKey(t.numero_economico);
    if (key) {
      const list = byEconomicoKey.get(key) ?? [];
      list.push(t);
      byEconomicoKey.set(key, list);
    }
    if (t.folio_tag) {
      byTag.set(normalizeTruckTag(String(t.folio_tag)), t);
    }
  }

  return { byEconomicoExact, byEconomicoKey, byTag };
}

function resolveTruck(
  economico: string,
  tag: string,
  indexes: ReturnType<typeof buildTruckIndexes>,
): { truck: Truck | null; ambiguous: boolean } {
  const { byEconomicoExact, byEconomicoKey, byTag } = indexes;

  if (economico) {
    const exact = byEconomicoExact.get(normalizeEconomicoExact(economico));
    if (exact) return { truck: exact, ambiguous: false };

    const key = economicoMatchKey(economico);
    if (key) {
      const hits = byEconomicoKey.get(key);
      if (hits?.length === 1) return { truck: hits[0]!, ambiguous: false };
      if (hits && hits.length > 1) return { truck: null, ambiguous: true };
    }
  }

  if (tag) {
    const hit = byTag.get(normalizeTruckTag(tag));
    if (hit) return { truck: hit, ambiguous: false };
  }

  return { truck: null, ambiguous: false };
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
  const sheet = wb.Sheets[sheetName];
  const rows = sheetToFuelDataRows(sheet);
  if (rows.length === 0) {
    return { creados: 0, duplicados: 0, errores: [{ fila: 0, mensaje: "El archivo está vacío o sin filas de datos" }] };
  }

  const headerMap = mapHeaders(rows[0]!);
  const trucks = await Truck.findAll({ where: { tenant_id: tenantId } });
  const indexes = buildTruckIndexes(trucks);

  const toInsert: Array<Record<string, unknown>> = [];
  const errores: FuelImportError[] = [];

  const dataStartRow =
    (() => {
      const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
      const headerIdx = matrix.findIndex((row) => {
        const cells = row.map((c) => normHeader(String(c)));
        return (
          cells.some((c) => c === "litros" || c === "litro") &&
          cells.includes("fecha") &&
          (cells.includes("odometro") || cells.includes("kilometraje"))
        );
      });
      return (headerIdx >= 0 ? headerIdx : 0) + 2;
    })();

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

    const { truck, ambiguous } = resolveTruck(economico, tagVal, indexes);
    if (ambiguous) {
      errores.push({
        fila,
        mensaje: `Número económico ambiguo (${economico || "—"}): varias unidades coinciden`,
        datos: row,
      });
      return;
    }
    if (!truck) {
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
      truck_id: truck.id,
      fecha,
      hora,
      folio,
      tag: tagVal || null,
      numero_economico_raw: economico || truck.numero_economico,
      placas_raw: truck.placas,
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

  if (toInsert.length === 0) {
    return { creados: 0, duplicados: 0, errores };
  }

  try {
    const created = await FuelTicket.bulkCreate(toInsert as never[], { ignoreDuplicates: true });
    const creados = created.length;
    const duplicados = toInsert.length - creados;
    return { creados, duplicados, errores };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al importar";
    errores.push({ fila: 0, mensaje: msg });
    return { creados: 0, duplicados: 0, errores };
  }
}
