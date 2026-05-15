import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Request, Response } from "express";
import { Op } from "sequelize";
import { Truck } from "../models";
import { asyncHandler } from "../utils/asyncHandler";
import { truckToJson } from "../utils/serialize";

const tid = (req: Request) => req.user!.tenantId;

const bodySchema = z.object({
  numero_economico: z.string().min(1),
  placas: z.string().min(1),
  marca: z.string().min(1),
  modelo: z.string().min(1),
  anio: z.number().int(),
  rendimiento_esperado: z.number(),
  costo_km_ref: z.number(),
  estatus: z.enum(["activo", "taller", "baja"]).optional(),
});

export const listTrucks = asyncHandler(async (req: Request, res: Response) => {
  const rows = await Truck.findAll({
    where: {
      tenant_id: tid(req),
      estatus: { [Op.ne]: "baja" },
    },
    order: [["numero_economico", "ASC"]],
  });
  res.json(rows.map(truckToJson));
});

export const getTruck = asyncHandler(async (req: Request, res: Response) => {
  const t = await Truck.findOne({ where: { id: req.params.id, tenant_id: tid(req) } });
  if (!t) {
    res.status(404).json({ error: "No encontrado" });
    return;
  }
  res.json(truckToJson(t));
});

export const createTruck = asyncHandler(async (req: Request, res: Response) => {
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const b = parsed.data;
  const t = await Truck.create({
    id: randomUUID(),
    tenant_id: tid(req),
    ...b,
    estatus: b.estatus ?? "activo",
  } as never);
  res.status(201).json(truckToJson(t));
});

export const updateTruck = asyncHandler(async (req: Request, res: Response) => {
  const t = await Truck.findOne({ where: { id: req.params.id, tenant_id: tid(req) } });
  if (!t) {
    res.status(404).json({ error: "No encontrado" });
    return;
  }
  const parsed = bodySchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  await t.update(parsed.data as never);
  res.json(truckToJson(t));
});

/** Baja lógica: marca `estatus` como baja (no borra fila ni historial asociado). */
export const deleteTruck = asyncHandler(async (req: Request, res: Response) => {
  const t = await Truck.findOne({ where: { id: req.params.id, tenant_id: tid(req) } });
  if (!t) {
    res.status(404).json({ error: "No encontrado" });
    return;
  }
  if (t.estatus === "baja") {
    res.status(409).json({ error: "La unidad ya está dada de baja" });
    return;
  }
  await t.update({ estatus: "baja" });
  res.json(truckToJson(t));
});
