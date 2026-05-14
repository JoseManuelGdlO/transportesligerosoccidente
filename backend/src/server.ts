import "dotenv/config";
import "./models/index";
import { createApp } from "./app";
import { sequelize } from "./models";

const port = Number(process.env.PORT) || 4000;

async function main() {
  await sequelize.authenticate();
  const app = createApp();
  app.listen(port, () => {
    console.log(`TLO API listening on http://localhost:${port}`);
  });
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
