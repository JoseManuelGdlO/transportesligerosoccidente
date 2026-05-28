import { z } from "zod";
import type { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { routeToJson } from "../utils/serialize";
import * as routeService from "../services/routeService";

const tid = (req: Request) => req.user!.tenantId;

const paradaSchema = z.object({
  etiqueta: z.string().min(1),
  client_ubicacion_id: z.string().uuid().optional().nullable(),
});

const bodySchema = z.object({
  nombre: z.string().min(1),
  client_id: z.string().uuid().optional().nullable(),
  tipo_viaje: z.enum(["local", "foraneo"]).optional().nullable(),
  paradas: z.array(paradaSchema).min(2),
});

export const listRoutes = asyncHandler(async (req: Request, res: Response) => {
  const clientId = typeof req.query.client_id === "string" ? req.query.client_id : undefined;
  const all = req.query.all === "1" || req.query.all === "true";
  const rows = await routeService.listRoutes(tid(req), { client_id: clientId, all });
  res.json(rows.map((r) => routeToJson(r)));
});

export const getRoute = asyncHandler(async (req: Request, res: Response) => {
  const r = await routeService.getRouteOrThrow(tid(req), req.params.id);
  res.json(routeToJson(r));
});

export const createRoute = asyncHandler(async (req: Request, res: Response) => {
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const r = await routeService.createRoute(tid(req), parsed.data);
  res.status(201).json(routeToJson(r));
});

export const updateRoute = asyncHandler(async (req: Request, res: Response) => {
  const parsed = bodySchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const r = await routeService.updateRoute(tid(req), req.params.id, parsed.data);
  res.json(routeToJson(r));
});

export const deleteRoute = asyncHandler(async (req: Request, res: Response) => {
  await routeService.deleteRoute(tid(req), req.params.id);
  res.status(204).send();
});
