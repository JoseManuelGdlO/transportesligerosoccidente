require("dotenv").config({ path: require("path").join(__dirname, ".env") });

const common = {
  username: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "tlgdb",
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT) || 3306,
  dialect: process.env.DB_DIALECT || "mysql",
  logging: process.env.NODE_ENV === "development" ? console.log : false,
};

module.exports = {
  development: common,
  production: common,
  test: { ...common, database: process.env.DB_NAME_TEST || "tlgdb_test" },
};
