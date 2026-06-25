#!/usr/bin/env tsx
/**
 * Importa catálogos SAT de municipio, localidad y colonia desde Excel.
 *
 * Uso:
 *   npx tsx scripts/import-sat-ubicaciones.ts [ruta/CatalogosCartaPorte31.xls]
 *   npm run db:import:sat-ubicaciones -- [ruta]
 */
import "dotenv/config";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as XLSX from "xlsx";
import "../src/models/index";
import { sequelize, SatMunicipio, SatLocalidad, SatColonia } from "../src/models";
import {
  parseSatColoniasRows,
  parseSatLocalidadesRows,
  parseSatMunicipiosRows,
  SAT_COLONIA_SHEETS,
  SAT_LOCALIDAD_SHEET,
  SAT_MUNICIPIO_SHEET,
} from "../src/utils/satUbicacionesImport";

const BATCH_SIZE = 1000;
const DEFAULT_PATH = path.join(os.homedir(), "Downloads", "CatalogosCartaPorte31.xls");

function resolveInputPath(arg?: string): string {
  const p = arg?.trim() || DEFAULT_PATH;
  const resolved = path.resolve(p);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Archivo no encontrado: ${resolved}`);
  }
  return resolved;
}

async function main() {
  const filePath = resolveInputPath(process.argv[2]);
  console.log(`Leyendo ${filePath}…`);

  const wb = XLSX.readFile(filePath);
  const importedAt = new Date();

  const munWs = wb.Sheets[SAT_MUNICIPIO_SHEET];
  if (!munWs) throw new Error(`Hoja "${SAT_MUNICIPIO_SHEET}" no encontrada`);
  const munRows = XLSX.utils.sheet_to_json(munWs, { header: 1, defval: "" }) as unknown[][];
  const municipios = parseSatMunicipiosRows(munRows);
  if (municipios.items.length === 0) throw new Error("No se encontraron municipios válidos");

  const locWs = wb.Sheets[SAT_LOCALIDAD_SHEET];
  if (!locWs) throw new Error(`Hoja "${SAT_LOCALIDAD_SHEET}" no encontrada`);
  const locRows = XLSX.utils.sheet_to_json(locWs, { header: 1, defval: "" }) as unknown[][];
  const localidades = parseSatLocalidadesRows(locRows);
  if (localidades.items.length === 0) throw new Error("No se encontraron localidades válidas");

  const coloniaItems: ReturnType<typeof parseSatColoniasRows>["items"] = [];
  let coloniaVersion: string | null = null;
  let coloniaSkipped = 0;

  for (const sheet of SAT_COLONIA_SHEETS) {
    const ws = wb.Sheets[sheet];
    if (!ws) {
      console.warn(`Hoja "${sheet}" no encontrada, se omite`);
      continue;
    }
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as unknown[][];
    const parsed = parseSatColoniasRows(rows);
    coloniaVersion = coloniaVersion ?? parsed.catalogo_version;
    coloniaSkipped += parsed.skipped;
    coloniaItems.push(...parsed.items);
  }
  if (coloniaItems.length === 0) throw new Error("No se encontraron colonias válidas");

  await sequelize.transaction(async (tx) => {
    await sequelize.query("TRUNCATE TABLE sat_municipios", { transaction: tx });
    for (let i = 0; i < municipios.items.length; i += BATCH_SIZE) {
      const batch = municipios.items.slice(i, i + BATCH_SIZE).map((item) => ({
        ...item,
        catalogo_version: municipios.catalogo_version,
        imported_at: importedAt,
      }));
      await SatMunicipio.bulkCreate(batch as never[], { transaction: tx });
    }

    await sequelize.query("TRUNCATE TABLE sat_localidades", { transaction: tx });
    for (let i = 0; i < localidades.items.length; i += BATCH_SIZE) {
      const batch = localidades.items.slice(i, i + BATCH_SIZE).map((item) => ({
        ...item,
        catalogo_version: localidades.catalogo_version,
        imported_at: importedAt,
      }));
      await SatLocalidad.bulkCreate(batch as never[], { transaction: tx });
    }

    await sequelize.query("TRUNCATE TABLE sat_colonias", { transaction: tx });
    for (let i = 0; i < coloniaItems.length; i += BATCH_SIZE) {
      const batch = coloniaItems.slice(i, i + BATCH_SIZE).map((item) => ({
        ...item,
        catalogo_version: coloniaVersion,
        imported_at: importedAt,
      }));
      await SatColonia.bulkCreate(batch as never[], { transaction: tx, ignoreDuplicates: true });
    }
  });

  console.log(
    `Importados ${municipios.items.length} municipios, ${localidades.items.length} localidades, ${coloniaItems.length} colonias`,
  );
  console.log(
    `Catálogo v${municipios.catalogo_version ?? "?"} (municipios/localidades), v${coloniaVersion ?? "?"} (colonias)`,
  );
  if (municipios.skipped > 0) console.log(`Municipios omitidos: ${municipios.skipped}`);
  if (localidades.skipped > 0) console.log(`Localidades omitidas: ${localidades.skipped}`);
  if (coloniaSkipped > 0) console.log(`Colonias omitidas: ${coloniaSkipped}`);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sequelize.close();
  });
