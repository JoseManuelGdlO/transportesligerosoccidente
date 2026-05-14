import type { Request, Response, NextFunction } from "express";

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  console.error(err);
  const msg = err instanceof Error ? err.message : "Error interno";
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
