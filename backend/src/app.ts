import express from "express";
import helmet from "helmet";
import cors from "cors";
import morgan from "morgan";
import v1 from "./routes/v1";
import { errorHandler } from "./middlewares/errorHandler";

function normalizeOrigin(o: string): string {
  return o.trim().replace(/\/+$/, "");
}

/** Orígenes permitidos: listas separadas por comas en `CORS_ORIGIN` y/o `PUBLIC_WEB_ORIGIN` (Easy Panel suele definir esta última). */
function parseCorsOrigins(): string[] {
  const devDefaults = [
    "http://localhost:5173",
    "http://localhost:8080",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:8080",
  ];
  const chunks: string[] = [];
  for (const key of [process.env.CORS_ORIGIN, process.env.PUBLIC_WEB_ORIGIN]) {
    if (!key?.trim()) continue;
    for (const part of key.split(",")) {
      const n = normalizeOrigin(part);
      if (n) chunks.push(n);
    }
  }
  const fromEnv = [...new Set(chunks)];
  if (process.env.NODE_ENV === "production") {
    return fromEnv;
  }
  return [...new Set([...fromEnv, ...devDefaults])];
}

export function createApp() {
  const app = express();
  app.use(helmet());
  const allowedOrigins = parseCorsOrigins();
  if (process.env.NODE_ENV === "production" && allowedOrigins.length === 0) {
    console.warn(
      "[cors] Producción sin orígenes: define CORS_ORIGIN o PUBLIC_WEB_ORIGIN (coma si son varios).",
    );
  }
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin) {
          callback(null, true);
          return;
        }
        const o = normalizeOrigin(origin);
        if (allowedOrigins.some((a) => normalizeOrigin(a) === o)) {
          callback(null, true);
          return;
        }
        // null, false: respuesta coherente para preflight; no usar Error() o el navegador ve “sin cabecera CORS”
        callback(null, false);
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
