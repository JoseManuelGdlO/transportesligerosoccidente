import cron from "node-cron";
import { runFuelSyncAll } from "../services/fuelSyncService";

export function startFuelSyncJob(): void {
  const expr = process.env.CRON_FUEL_SYNC || "0 5 * * *";
  const enabled = process.env.FUEL_SYNC_ENABLED === "true";

  if (!enabled) {
    console.log("[cron] Combustibles: deshabilitado (FUEL_SYNC_ENABLED≠true)");
    return;
  }

  cron.schedule(expr, () => {
    void runFuelSyncAll()
      .then((results) => {
        const ok = results.filter((r) => r.status === "ok").length;
        const err = results.filter((r) => r.status === "error").length;
        console.log(`[cron fuel-sync] tenants=${results.length} ok=${ok} error=${err}`);
      })
      .catch((e) => console.error("[cron fuel-sync]", e));
  });

  console.log(`[cron] Combustibles: planificación "${expr}" (${process.env.TZ || "default TZ"})`);
}
