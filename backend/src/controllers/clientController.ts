import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Request, Response } from "express";
import { Client } from "../models";
import { asyncHandler } from "../utils/asyncHandler";
import { clientToJson } from "../utils/serialize";

const tid = (req: Request) => req.user!.tenantId;

const bodySchema = z.object({
  razon_social: z.string().min(1),
  rfc: z.string().min(1),
  contacto: z.string().min(1),
  telefono: z.string().min(1),
  calle: z.string().optional(),
  colonia: z.string().optional(),
  colonia_clave: z.string().optional(),
  municipio: z.string().optional(),
  municipio_clave: z.string().optional(),
  estado: z.string().optional(),
  cp: z.string().optional(),
  pais: z.string().optional(),
  numero_exterior: z.string().optional(),
  numero_interior: z.string().optional(),
  localidad: z.string().optional(),
  localidad_clave: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  regimen_fiscal: z.string().optional(),
  estatus: z.enum(["activo", "inactivo"]).optional(),
  observaciones: z.string().optional(),
  dias_credito: z.number().int().nonnegative().optional().nullable(),
});

export const listClients = asyncHandler(async (req: Request, res: Response) => {
  const rows = await Client.findAll({
    where: { tenant_id: tid(req) },
    order: [["razon_social", "ASC"]],
  });
  res.json(rows.map(clientToJson));
});

export const getClient = asyncHandler(async (req: Request, res: Response) => {
  const c = await Client.findOne({ where: { id: req.params.id, tenant_id: tid(req) } });
  if (!c) {
    res.status(404).json({ error: "No encontrado" });
    return;
  }
  res.json(clientToJson(c));
});

export const createClient = asyncHandler(async (req: Request, res: Response) => {
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const c = await Client.create({
    id: randomUUID(),
    tenant_id: tid(req),
    ...parsed.data,
  } as never);
  res.status(201).json(clientToJson(c));
});

export const updateClient = asyncHandler(async (req: Request, res: Response) => {
  const c = await Client.findOne({ where: { id: req.params.id, tenant_id: tid(req) } });
  if (!c) {
    res.status(404).json({ error: "No encontrado" });
    return;
  }
  const parsed = bodySchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  await c.update(parsed.data as never);
  res.json(clientToJson(c));
});

export const deleteClient = asyncHandler(async (req: Request, res: Response) => {
  const c = await Client.findOne({ where: { id: req.params.id, tenant_id: tid(req) } });
  if (!c) {
    res.status(404).json({ error: "No encontrado" });
    return;
  }
  await c.destroy();
  res.status(204).send();
});
