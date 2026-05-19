/**
 * Verifica parseo de Excel Tothem sin base de datos.
 * Uso: npx tsx src/scripts/verifyFuelImport.ts [ruta.xlsx]
 */
import { readFileSync } from "node:fs";
import * as XLSX from "xlsx";
import { sheetToFuelDataRows } from "../services/fuelImportService";

function normHeader(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, "_");
}

const HEADER_ALIASES: Record<string, string[]> = {
  folio_tag: ["folio_tag", "tag", "id_token", "folio_del_tag"],
  folio_proveedor: ["folio"],
  id_tothem: ["id_tothem", "id_tothems"],
  numero_economico: ["numero_economico", "no_economico", "economico", "unidad", "numero_de_unidad", "referencia"],
  placas: ["placas", "placa", "descripcion_corta"],
  fecha: ["fecha", "date"],
  hora: ["hora", "time"],
  odometro: ["odometro", "kilometraje", "km"],
  litros: ["litros", "litro", "volumen"],
  precio_litro: ["precio_litro", "precio", "precio_por_litro", "precio/l"],
  importe_total: ["importe_total", "importe", "total", "monto"],
};

function mapHeaders(row: Record<string, unknown>) {
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

function cellStr(row: Record<string, unknown>, col?: string) {
  if (!col) return "";
  const v = row[col];
  if (v == null) return "";
  return String(v).trim();
}

function cellNum(row: Record<string, unknown>, col?: string) {
  const s = cellStr(row, col);
  if (!s) return null;
  const normalized = s.replace(/[\s\u00a0\u202f]/g, "").replace(/,/g, "");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

const files = process.argv.slice(2).length
  ? process.argv.slice(2)
  : [
      "c:/Users/Joczm/Downloads/Combustible TLO (1).xlsx",
      "c:/Users/Joczm/Downloads/reporte_del_01_05_2026_al_19_05_2026.xlsx",
    ];

for (const f of files) {
  console.log("\n===", f, "===");
  const buf = readFileSync(f);
  const wb = XLSX.read(buf, { type: "buffer" });
  const sheet = wb.Sheets[wb.SheetNames[0]!]!;
  const rows = sheetToFuelDataRows(sheet);
  const headerMap = mapHeaders(rows[0] ?? {});
  console.log("Filas datos:", rows.length);
  console.log("Columnas mapeadas:", headerMap);

  let ok = 0;
  let bad = 0;
  for (const row of rows) {
    const fecha = cellStr(row, headerMap.fecha);
    const litros = cellNum(row, headerMap.litros);
    const odometro = cellNum(row, headerMap.odometro);
    const precio = cellNum(row, headerMap.precio_litro);
    if (litros && odometro != null && precio && fecha) ok++;
    else bad++;
  }
  console.log("Filas parseables:", ok, "con error:", bad);
  if (rows[0]) {
    const r = rows[0];
    console.log("Ejemplo:", {
      economico: cellStr(r, headerMap.numero_economico),
      tag: cellStr(r, headerMap.folio_tag),
      placas: cellStr(r, headerMap.placas),
      fecha: cellStr(r, headerMap.fecha),
      odometro: cellNum(r, headerMap.odometro),
      litros: cellNum(r, headerMap.litros),
    });
  }
}
