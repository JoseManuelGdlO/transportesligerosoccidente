import cron from "node-cron";
import { defaultSyncDateRange, runFuelSyncAll } from "../services/fuelSyncService";

export function startFuelSyncJob(): void {
  const expr = process.env.CRON_FUEL_SYNC || "0 5 * * *";
  const enabled = process.env.FUEL_SYNC_ENABLED === "true";

  if (!enabled) {
    console.log("[cron] Combustibles: deshabilitado (FUEL_SYNC_ENABLED≠true)");
    return;
  }

  cron.schedule(expr, () => {
    const startedAt = Date.now();
    const range = defaultSyncDateRange();
    console.log(
      `[cron fuel-sync] disparo ${new Date().toISOString()} rango=${range.inicio}..${range.fin} TZ=${process.env.TZ || "default"}`,
    );

    void runFuelSyncAll(range)
      .then((results) => {
        const ok = results.filter((r) => r.status === "ok").length;
        const err = results.filter((r) => r.status === "error").length;
        const skipped = results.filter((r) => r.status === "skipped").length;
        console.log(
          `[cron fuel-sync] terminado duracion_ms=${Date.now() - startedAt} tenants=${results.length} ok=${ok} error=${err} skipped=${skipped}`,
        );
      })
      .catch((e) => console.error("[cron fuel-sync] fallo no controlado", e));
  });

  const range = defaultSyncDateRange();
  console.log(
    `[cron] Combustibles: planificación "${expr}" (${process.env.TZ || "default TZ"}) próximo rango típico ${range.inicio}..${range.fin}`,
  );
}
