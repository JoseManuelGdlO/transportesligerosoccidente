/**
 * Ejecuta la sincronización de combustibles una vez (sin esperar al cron).
 * Uso: npm run job:fuel-sync
 */
import "dotenv/config";
import "../models/index";
import { sequelize } from "../models";
import { runFuelSyncAll } from "../services/fuelSyncService";

async function main() {
  await sequelize.authenticate();
  const results = await runFuelSyncAll();
  for (const r of results) {
    console.log(JSON.stringify(r));
  }
  const failed = results.some((r) => r.status === "error");
  process.exit(failed ? 1 : 0);
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
