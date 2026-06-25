#!/usr/bin/env tsx
/**
 * Importa el catálogo SAT c_ClaveProdServCP desde Excel a sat_claves_productos.
 *
 * Uso:
 *   npx tsx scripts/import-sat-claves-productos.ts [ruta/CatalogosCartaPorte31.xls]
 *   npm run db:import:sat-claves -- [ruta]
 */
import "dotenv/config";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as XLSX from "xlsx";
import "../src/models/index";
import { sequelize, SatClaveProducto } from "../src/models";
import {
  parseSatClavesProductosRows,
  SAT_CLAVES_SHEET,
} from "../src/utils/satClavesProductosImport";

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
  const ws = wb.Sheets[SAT_CLAVES_SHEET];
  if (!ws) {
    throw new Error(`Hoja "${SAT_CLAVES_SHEET}" no encontrada en el archivo`);
  }

  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as unknown[][];
  const { catalogo_version, items, skipped } = parseSatClavesProductosRows(rows);
  if (items.length === 0) {
    throw new Error("No se encontraron filas válidas para importar");
  }

  const importedAt = new Date();
  const counts: Record<string, number> = {};

  await sequelize.transaction(async (tx) => {
    await sequelize.query("TRUNCATE TABLE sat_claves_productos", { transaction: tx });

    for (let i = 0; i < items.length; i += BATCH_SIZE) {
      const batch = items.slice(i, i + BATCH_SIZE).map((item) => {
        counts[item.material_peligroso] = (counts[item.material_peligroso] ?? 0) + 1;
        return {
          ...item,
          catalogo_version,
          imported_at: importedAt,
        };
      });
      await SatClaveProducto.bulkCreate(batch as never[], { transaction: tx });
    }
  });

  console.log(`Importadas ${items.length} claves (catálogo v${catalogo_version ?? "?"})`);
  console.log("Material peligroso:", counts);
  if (skipped > 0) console.log(`Filas omitidas: ${skipped}`);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sequelize.close();
  });
