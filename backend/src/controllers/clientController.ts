import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Request, Response } from "express";
import { Client } from "../models";
import { asyncHandler } from "../utils/asyncHandler";
import { clientToJson } from "../utils/serialize";

const bodySchema = z.object({
  razon_social: z.string().min(1),
  rfc: z.string().min(1),
  contacto: z.string().min(1),
  telefono: z.string().min(1),
});

export const listClients = asyncHandler(async (_req: Request, res: Response) => {
  const rows = await Client.findAll({ order: [["razon_social", "ASC"]] });
  res.json(rows.map(clientToJson));
});

export const getClient = asyncHandler(async (req: Request, res: Response) => {
  const c = await Client.findByPk(req.params.id);
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
  const c = await Client.create({ id: randomUUID(), ...parsed.data });
  res.status(201).json(clientToJson(c));
});

export const updateClient = asyncHandler(async (req: Request, res: Response) => {
  const c = await Client.findByPk(req.params.id);
  if (!c) {
    res.status(404).json({ error: "No encontrado" });
    return;
  }
  const parsed = bodySchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  await c.update(parsed.data);
  res.json(clientToJson(c));
});

export const deleteClient = asyncHandler(async (req: Request, res: Response) => {
  const c = await Client.findByPk(req.params.id);
  if (!c) {
    res.status(404).json({ error: "No encontrado" });
    return;
  }
  await c.destroy();
  res.status(204).send();
});
