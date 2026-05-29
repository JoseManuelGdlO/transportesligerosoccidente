import cron from "node-cron";
import { defaultSyncDateRange, runFuelSyncAll } from "../services/fuelSyncService";
import { logger } from "../utils/logger";

export function startFuelSyncJob(): void {
  const expr = process.env.CRON_FUEL_SYNC || "0 5 * * *";
  const enabled = process.env.FUEL_SYNC_ENABLED === "true";

  if (!enabled) {
    logger.info("[cron] Combustibles: deshabilitado (FUEL_SYNC_ENABLED≠true)");
    return;
  }

  cron.schedule(expr, () => {
    const startedAt = Date.now();
    const range = defaultSyncDateRange();
    logger.info(
      `[cron fuel-sync] disparo ${new Date().toISOString()} rango=${range.inicio}..${range.fin} TZ=${process.env.TZ || "default"}`,
    );

    void runFuelSyncAll(range)
      .then((results) => {
        const ok = results.filter((r) => r.status === "ok").length;
        const err = results.filter((r) => r.status === "error").length;
        const skipped = results.filter((r) => r.status === "skipped").length;
        logger.info(
          `[cron fuel-sync] terminado duracion_ms=${Date.now() - startedAt} tenants=${results.length} ok=${ok} error=${err} skipped=${skipped}`,
        );
      })
      .catch((e) => logger.error(`[cron fuel-sync] fallo no controlado ${e instanceof Error ? e.message : String(e)}`));
  });

  const range = defaultSyncDateRange();
  logger.info(
    `[cron] Combustibles: planificación "${expr}" (${process.env.TZ || "default TZ"}) próximo rango típico ${range.inicio}..${range.fin}`,
  );
}
