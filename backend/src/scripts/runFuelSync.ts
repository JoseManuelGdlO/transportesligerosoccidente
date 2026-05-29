/**
 * Ejecuta la sincronización de combustibles una vez (sin esperar al cron).
 * Uso: npm run job:fuel-sync
 */
import "dotenv/config";
import "../models/index";
import { sequelize } from "../models";
import { runFuelSyncAll } from "../services/fuelSyncService";
import { logger } from "../utils/logger";

async function main() {
  await sequelize.authenticate();
  logger.info("[fuel-sync] job manual (npm run job:fuel-sync)");
  const results = await runFuelSyncAll();
  for (const r of results) {
    logger.info(`[fuel-sync] detalle: ${JSON.stringify(r)}`);
  }
  const failed = results.some((r) => r.status === "error");
  process.exit(failed ? 1 : 0);
}

void main().catch((e) => {
  logger.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
