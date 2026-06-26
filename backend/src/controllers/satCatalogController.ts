import type { Request, Response } from "express";
import { z } from "zod";
import { asyncHandler } from "../utils/asyncHandler";
import * as satCatalogService from "../services/satCatalogService";
import * as satUbicacionCatalogService from "../services/satUbicacionCatalogService";

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

export const searchMunicipios = asyncHandler(async (req: Request, res: Response) => {
  const q = typeof req.query.q === "string" ? req.query.q : "";
  const estado = typeof req.query.estado === "string" ? req.query.estado : "";
  const limitRaw = typeof req.query.limit === "string" ? Number(req.query.limit) : 20;
  const limit = Number.isFinite(limitRaw) ? limitRaw : 20;
  const items = await satUbicacionCatalogService.searchMunicipios(q, estado, limit);
  res.json({ items });
});

export const getMunicipio = asyncHandler(async (req: Request, res: Response) => {
  const row = await satUbicacionCatalogService.getMunicipio(req.params.estado, req.params.clave);
  if (!row) {
    res.status(404).json({ error: "Municipio no encontrado en catálogo SAT" });
    return;
  }
  res.json(row);
});

export const searchLocalidades = asyncHandler(async (req: Request, res: Response) => {
  const q = typeof req.query.q === "string" ? req.query.q : "";
  const estado = typeof req.query.estado === "string" ? req.query.estado : "";
  const limitRaw = typeof req.query.limit === "string" ? Number(req.query.limit) : 20;
  const limit = Number.isFinite(limitRaw) ? limitRaw : 20;
  const items = await satUbicacionCatalogService.searchLocalidades(q, estado, limit);
  res.json({ items });
});

export const getLocalidad = asyncHandler(async (req: Request, res: Response) => {
  const row = await satUbicacionCatalogService.getLocalidad(req.params.estado, req.params.clave);
  if (!row) {
    res.status(404).json({ error: "Localidad no encontrada en catálogo SAT" });
    return;
  }
  res.json(row);
});

const cpParamSchema = z.string().regex(/^\d{5}$/);

export const searchColonias = asyncHandler(async (req: Request, res: Response) => {
  const q = typeof req.query.q === "string" ? req.query.q : "";
  const cp = typeof req.query.cp === "string" ? req.query.cp : "";
  const limitRaw = typeof req.query.limit === "string" ? Number(req.query.limit) : 20;
  const limit = Number.isFinite(limitRaw) ? limitRaw : 20;
  const items = await satUbicacionCatalogService.searchColonias(q, cp, limit);
  res.json({ items });
});

export const getColonia = asyncHandler(async (req: Request, res: Response) => {
  const cpParsed = cpParamSchema.safeParse(req.params.cp);
  if (!cpParsed.success) {
    res.status(400).json({ error: "Código postal inválido (debe ser 5 dígitos)" });
    return;
  }
  const row = await satUbicacionCatalogService.getColonia(cpParsed.data, req.params.clave);
  if (!row) {
    res.status(404).json({ error: "Colonia no encontrada en catálogo SAT" });
    return;
  }
  res.json(row);
});

export const searchEstados = asyncHandler(async (req: Request, res: Response) => {
  const q = typeof req.query.q === "string" ? req.query.q : "";
  const limitRaw = typeof req.query.limit === "string" ? Number(req.query.limit) : 20;
  const limit = Number.isFinite(limitRaw) ? limitRaw : 20;
  const items = await satUbicacionCatalogService.searchEstados(q, limit);
  res.json({ items });
});

export const getEstado = asyncHandler(async (req: Request, res: Response) => {
  const municipioClave =
    typeof req.query.municipio_clave === "string" ? req.query.municipio_clave : undefined;
  const row = await satUbicacionCatalogService.getEstado(req.params.clave, municipioClave);
  if (!row) {
    res.status(404).json({ error: "Estado no encontrado en catálogo SAT" });
    return;
  }
  res.json(row);
});
