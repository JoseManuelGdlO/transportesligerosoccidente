import express from "express";
import helmet from "helmet";
import cors from "cors";
import morgan from "morgan";
import v1 from "./routes/v1";
import { errorHandler } from "./middlewares/errorHandler";

/** Orígenes permitidos: `CORS_ORIGIN` puede ser lista separada por comas. En desarrollo se unen puertos típicos de Vite. */
function parseCorsOrigins(): string[] {
  const devDefaults = [
    "http://localhost:5173",
    "http://localhost:8080",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:8080",
  ];
  const raw = process.env.CORS_ORIGIN?.trim();
  const fromEnv = raw
    ? raw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
  if (process.env.NODE_ENV === "production") {
    return fromEnv;
  }
  return [...new Set([...fromEnv, ...devDefaults])];
}

export function createApp() {
  const app = express();
  app.use(helmet());
  const allowedOrigins = parseCorsOrigins();
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin) {
          callback(null, true);
          return;
        }
        if (allowedOrigins.includes(origin)) {
          callback(null, true);
          return;
        }
        callback(new Error(`CORS: origen no permitido: ${origin}`));
      },
      credentials: true,
    }),
  );
  app.use(morgan("dev"));
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.use("/api/v1", v1);

  app.use(errorHandler);
  return app;
}
