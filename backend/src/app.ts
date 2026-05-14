import express from "express";
import helmet from "helmet";
import cors from "cors";
import morgan from "morgan";
import v1 from "./routes/v1";
import { errorHandler } from "./middlewares/errorHandler";

export function createApp() {
  const app = express();
  app.use(helmet());
  app.use(
    cors({
      origin: process.env.CORS_ORIGIN || "http://localhost:5173",
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
