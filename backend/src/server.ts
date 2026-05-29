import "dotenv/config";
import "./models/index";
import { createApp } from "./app";
import { sequelize } from "./models";
import { startDocumentExpirationJob } from "./jobs/checkDocumentExpirations";
import { startFuelSyncJob } from "./jobs/syncFuelTickets";
import { logger } from "./utils/logger";

const port = Number(process.env.PORT) || 4000;
/** En Docker conviene escuchar en todas las interfaces; el proxy (Easy Panel) habla con la IP del contenedor. */
const listenHost = process.env.LISTEN_HOST || "0.0.0.0";

async function main() {
  await sequelize.authenticate();
  startDocumentExpirationJob();
  startFuelSyncJob();
  const app = createApp();
  app.listen(port, listenHost, () => {
    logger.info(`TLO API listening on http://${listenHost}:${port}`);
  });
}

void main().catch((e) => {
  logger.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
