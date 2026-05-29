import dotenv from "dotenv";
import path from "node:path";
import { Sequelize } from "sequelize";

dotenv.config({ path: path.join(__dirname, "../../.env") });

const sequelize = new Sequelize(
  process.env.DB_NAME || "tlgdb",
  process.env.DB_USER || "root",
  process.env.DB_PASSWORD || "",
  {
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT) || 3306,
    dialect: (process.env.DB_DIALECT as "mysql") || "mysql",
    logging: false,
    define: {
      underscored: true,
      timestamps: true,
    },
  },
);

export { sequelize };
