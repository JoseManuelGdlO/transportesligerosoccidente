/**
 * Verifica parseo de Excel Tothem sin base de datos.
 * Uso: npx tsx src/scripts/verifyFuelImport.ts [ruta.xlsx]
 */
import { readFileSync } from "node:fs";
import * as XLSX from "xlsx";
import {
  HEADER_ALIASES,
  normHeader,
  parseReportDateRangeFromSheet,
  sheetToFuelDataRows,
} from "../services/fuelImportService";
import { economicoMatchKey } from "../utils/economicoMatch";
import { logger } from "../utils/logger";

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

const files = process.argv.slice(2);
if (files.length === 0) {
  logger.info("Uso: npx tsx src/scripts/verifyFuelImport.ts <archivo.xlsx> [más archivos…]");
  process.exit(1);
}

for (const f of files) {
  logger.info(`\n=== ${f} ===`);
  try {
    const buf = readFileSync(f);
    const wb = XLSX.read(buf, { type: "buffer" });
    const sheet = wb.Sheets[wb.SheetNames[0]!]!;
    const reportRange = parseReportDateRangeFromSheet(sheet);
    if (reportRange) {
      logger.info(`Rango del reporte: ${reportRange.inicio} – ${reportRange.fin}`);
    } else {
      logger.info("Rango del reporte: (no detectado en título)");
    }
    const rows = sheetToFuelDataRows(sheet);
    const headerMap = mapHeaders(rows[0] ?? {});
    logger.info(`Filas datos: ${rows.length}`);
    logger.info(`Columnas mapeadas: ${JSON.stringify(headerMap)}`);

    let ok = 0;
    let bad = 0;
    for (const row of rows) {
      const folio = cellStr(row, headerMap.folio);
      const fecha = cellStr(row, headerMap.fecha);
      const litros = cellNum(row, headerMap.litros);
      const odometro = cellNum(row, headerMap.odometro);
      const precio = cellNum(row, headerMap.precio_litro);
      const economico = cellStr(row, headerMap.numero_economico);
      const ubicacion = cellStr(row, headerMap.ubicacion);
      if (folio && litros && odometro != null && precio && fecha) ok++;
      else bad++;
      if (rows.indexOf(row) === 0) {
        logger.info(
          `Ejemplo: ${JSON.stringify({
            folio,
            tag: cellStr(row, headerMap.tag),
            economico,
            economicoKey: economico ? economicoMatchKey(economico) : null,
            ubicacion: ubicacion || "(Gasolinera)",
            fecha,
            odometro,
            litros,
          })}`,
        );
      }
    }
    logger.info(`Filas parseables: ${ok} con error: ${bad}`);
  } catch (e) {
    logger.error(`No se pudo leer ${f}: ${e instanceof Error ? e.message : e}`);
  }
}
