import type { Request, Response } from "express";
import { z } from "zod";
import { asyncHandler } from "../utils/asyncHandler";
import * as satCatalogService from "../services/satCatalogService";

const claveParamSchema = z.string().regex(/^\d{8}$/);

export const searchClavesProductos = asyncHandler(async (req: Request, res: Response) => {
  const q = typeof req.query.q === "string" ? req.query.q : "";
  const limitRaw = typeof req.query.limit === "string" ? Number(req.query.limit) : 20;
  const limit = Number.isFinite(limitRaw) ? limitRaw : 20;
  const items = await satCatalogService.searchClavesProducto(q, limit);
  res.json({ items });
});

export const getClaveProducto = asyncHandler(async (req: Request, res: Response) => {
  const parsed = claveParamSchema.safeParse(req.params.clave);
  if (!parsed.success) {
    res.status(400).json({ error: "Clave inválida (debe ser 8 dígitos)" });
    return;
  }
  const row = await satCatalogService.getClaveProducto(parsed.data);
  if (!row) {
    res.status(404).json({ error: "Clave no encontrada en catálogo SAT" });
    return;
  }
  res.json(row);
});
