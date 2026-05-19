import { randomUUID } from "node:crypto";
import * as XLSX from "xlsx";
import { FuelTicket, Truck } from "../models";
import type { FuelTicketOrigen } from "../models/FuelTicket";

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

function normHeader(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, "_");
}

const HEADER_ALIASES: Record<string, string[]> = {
  /** TAG RFID del camión (columna "Tag" en Tothem). No confundir con "Folio" del dispensario. */
  folio_tag: ["folio_tag", "tag", "id_token", "folio_del_tag"],
  folio_proveedor: ["folio"],
  id_tothem: ["id_tothem", "id_tothems"],
  numero_economico: [
    "numero_economico",
    "no_economico",
    "economico",
    "unidad",
    "numero_de_unidad",
    "referencia",
  ],
  placas: ["placas", "placa", "descripcion_corta"],
  fecha: ["fecha", "date"],
  hora: ["hora", "time"],
  odometro: ["odometro", "kilometraje", "km"],
  litros: ["litros", "litro", "volumen"],
  precio_litro: ["precio_litro", "precio", "precio_por_litro", "precio/l"],
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

function normalizePlacas(p: string): string {
  return p.replace(/\s+/g, "").toUpperCase();
}

function normalizeEconomico(e: string): string {
  return e.trim();
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

  const byEconomico = new Map<string, Truck>();
  const byPlacas = new Map<string, Truck>();
  const byTag = new Map<string, Truck>();
  for (const t of trucks) {
    byEconomico.set(normalizeEconomico(t.numero_economico), t);
    byPlacas.set(normalizePlacas(t.placas), t);
    if (t.folio_tag) byTag.set(String(t.folio_tag).trim(), t);
  }

  const resolveTruck = (economico: string, placas: string, tag: string): Truck | null => {
    if (economico) {
      const hit = byEconomico.get(normalizeEconomico(economico));
      if (hit) return hit;
    }
    if (placas) {
      const hit = byPlacas.get(normalizePlacas(placas));
      if (hit) return hit;
    }
    if (tag) {
      const hit = byTag.get(tag.trim());
      if (hit) return hit;
    }
    return null;
  };

  const toInsert: Array<Record<string, unknown>> = [];
  const errores: FuelImportError[] = [];
  let duplicados = 0;

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
    const placas = cellStr(row, headerMap.placas);
    const tag = cellStr(row, headerMap.folio_tag);
    const idTothem = cellStr(row, headerMap.id_tothem);
    const folioProveedor = cellStr(row, headerMap.folio_proveedor);
    const fecha = parseExcelDate(row[headerMap.fecha ?? ""]);
    const litros = cellNum(row, headerMap.litros);
    const precio = cellNum(row, headerMap.precio_litro);
    const odometro = cellNum(row, headerMap.odometro);
    const importe = cellNum(row, headerMap.importe_total);

    if (!economico && !placas && !tag) {
      errores.push({ fila, mensaje: "Fila sin número económico, placas ni folio TAG", datos: row });
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

    const truck = resolveTruck(economico, placas, tag);
    if (!truck) {
      errores.push({
        fila,
        mensaje: `No se encontró camión (económico: ${economico || "—"}, placas: ${placas || "—"}, TAG: ${tag || "—"})`,
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
      folio_tag: tag || null,
      numero_economico_raw: economico || truck.numero_economico,
      placas_raw: placas || truck.placas,
      odometro: Math.round(odometro),
      litros: String(litros),
      precio_litro: String(precio),
      importe_total: String(total),
      ubicacion,
      origen,
      external_id:
        [idTothem, folioProveedor, fecha, String(Math.round(odometro))].filter(Boolean).join("|") ||
        (tag ? `${tag}-${fecha}-${odometro}` : null),
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
    duplicados = toInsert.length - creados;
    return { creados, duplicados, errores };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al importar";
    errores.push({ fila: 0, mensaje: msg });
    return { creados: 0, duplicados: 0, errores };
  }
}
