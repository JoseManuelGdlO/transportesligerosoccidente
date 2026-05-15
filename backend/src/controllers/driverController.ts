import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Request, Response } from "express";
import { Op } from "sequelize";
import { Driver } from "../models";
import { asyncHandler } from "../utils/asyncHandler";
import { driverToJson } from "../utils/serialize";

const tid = (req: Request) => req.user!.tenantId;

const bodySchema = z.object({
  nombre: z.string().min(1),
  telefono: z.string().min(1),
  licencia: z.string().min(1),
  fecha_ingreso: z.string().min(1),
  comision_tipo: z.enum(["porcentaje", "fijo"]),
  comision_valor: z.number(),
  estatus: z.enum(["activo", "inactivo"]).optional(),
});

export const listDrivers = asyncHandler(async (req: Request, res: Response) => {
  const rows = await Driver.findAll({
    where: {
      tenant_id: tid(req),
      estatus: { [Op.ne]: "inactivo" },
    },
    order: [["nombre", "ASC"]],
  });
  res.json(rows.map(driverToJson));
});

export const getDriver = asyncHandler(async (req: Request, res: Response) => {
  const d = await Driver.findOne({ where: { id: req.params.id, tenant_id: tid(req) } });
  if (!d) {
    res.status(404).json({ error: "No encontrado" });
    return;
  }
  res.json(driverToJson(d));
});

export const createDriver = asyncHandler(async (req: Request, res: Response) => {
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const b = parsed.data;
  const d = await Driver.create({
    id: randomUUID(),
    tenant_id: tid(req),
    ...b,
    estatus: b.estatus ?? "activo",
  } as never);
  res.status(201).json(driverToJson(d));
});

export const updateDriver = asyncHandler(async (req: Request, res: Response) => {
  const d = await Driver.findOne({ where: { id: req.params.id, tenant_id: tid(req) } });
  if (!d) {
    res.status(404).json({ error: "No encontrado" });
    return;
  }
  const parsed = bodySchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  await d.update(parsed.data as never);
  res.json(driverToJson(d));
});

/** Baja lógica: marca `estatus` inactivo (no borra fila ni historial asociado). */
export const deleteDriver = asyncHandler(async (req: Request, res: Response) => {
  const d = await Driver.findOne({ where: { id: req.params.id, tenant_id: tid(req) } });
  if (!d) {
    res.status(404).json({ error: "No encontrado" });
    return;
  }
  if (d.estatus === "inactivo") {
    res.status(409).json({ error: "El operador ya está dado de baja" });
    return;
  }
  await d.update({ estatus: "inactivo" });
  res.json(driverToJson(d));
});
