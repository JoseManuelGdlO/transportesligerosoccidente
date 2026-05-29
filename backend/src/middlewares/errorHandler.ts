import type { Request, Response, NextFunction } from "express";
import { config } from "../config/env";
import { logger } from "../utils/logger";

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  const msg = err instanceof Error ? err.message : "Error interno";
  let statusCode = 500;

  if (typeof err === "object" && err !== null && "status" in err && typeof (err as { status?: number }).status === "number") {
    statusCode = (err as { status: number }).status;
  } else if (
    typeof err === "object" &&
    err !== null &&
    "name" in err &&
    ((err as { name?: string }).name === "SequelizeUniqueConstraintError" ||
      (err as { name?: string }).name === "SequelizeForeignKeyConstraintError")
  ) {
    statusCode = (err as { name?: string }).name === "SequelizeUniqueConstraintError" ? 409 : 400;
  }

  logger.error(
    JSON.stringify({
      statusCode,
      message: msg,
      stack: config.nodeEnv === "development" && err instanceof Error ? err.stack : undefined,
      path: req.path,
      method: req.method,
    }),
  );

  if (typeof err === "object" && err !== null && "status" in err && typeof (err as { status?: number }).status === "number") {
    const code = (err as { status: number }).status;
    res.status(code).json({ error: msg });
    return;
  }
  if (typeof err === "object" && err !== null && "name" in err && (err as { name?: string }).name === "SequelizeUniqueConstraintError") {
    res.status(409).json({ error: "Conflicto: registro duplicado" });
    return;
  }
  if (typeof err === "object" && err !== null && "name" in err && (err as { name?: string }).name === "SequelizeForeignKeyConstraintError") {
    res.status(400).json({ error: "Referencia inválida" });
    return;
  }
  res.status(500).json({ error: msg });
}
