import "dotenv/config";
import "./models/index";
import { createApp } from "./app";
import { sequelize } from "./models";

const port = Number(process.env.PORT) || 4000;
/** En Docker conviene escuchar en todas las interfaces; el proxy (Easy Panel) habla con la IP del contenedor. */
const listenHost = process.env.LISTEN_HOST || "0.0.0.0";

async function main() {
  await sequelize.authenticate();
  const app = createApp();
  app.listen(port, listenHost, () => {
    console.log(`TLO API listening on http://${listenHost}:${port}`);
  });
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
