import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Request, Response } from "express";
import { Client, ClientUbicacion } from "../models";
import { asyncHandler } from "../utils/asyncHandler";
import { clientUbicacionToJson } from "../utils/serialize";

const tid = (req: Request) => req.user!.tenantId;

const bodySchema = z.object({
  nombre: z.string().min(1),
  tipo: z.enum(["Origen", "Destino", "Ambos"]).optional(),
  calle: z.string().optional(),
  numero_exterior: z.string().optional(),
  numero_interior: z.string().optional(),
  colonia: z.string().optional(),
  colonia_clave: z.string().optional(),
  localidad: z.string().optional(),
  localidad_clave: z.string().optional(),
  municipio: z.string().optional(),
  municipio_clave: z.string().optional(),
  estado: z.string().optional(),
  cp: z.string().optional(),
  pais: z.string().optional(),
  estatus: z.enum(["activo", "inactivo"]).optional(),
});

async function getClientOr404(req: Request, res: Response) {
  const client = await Client.findOne({
    where: { id: req.params.clientId, tenant_id: tid(req) },
  });
  if (!client) {
    res.status(404).json({ error: "Cliente no encontrado" });
    return null;
  }
  return client;
}

export const listClientUbicaciones = asyncHandler(async (req: Request, res: Response) => {
  const client = await getClientOr404(req, res);
  if (!client) return;
  const rows = await ClientUbicacion.findAll({
    where: { tenant_id: tid(req), client_id: client.id },
    order: [["nombre", "ASC"]],
  });
  res.json(rows.map(clientUbicacionToJson));
});

export const createClientUbicacion = asyncHandler(async (req: Request, res: Response) => {
  const client = await getClientOr404(req, res);
  if (!client) return;
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const row = await ClientUbicacion.create({
    id: randomUUID(),
    tenant_id: tid(req),
    client_id: client.id,
    ...parsed.data,
    tipo: parsed.data.tipo ?? "Ambos",
    estatus: parsed.data.estatus ?? "activo",
  } as never);
  res.status(201).json(clientUbicacionToJson(row));
});

export const updateClientUbicacion = asyncHandler(async (req: Request, res: Response) => {
  const client = await getClientOr404(req, res);
  if (!client) return;
  const row = await ClientUbicacion.findOne({
    where: { id: req.params.id, tenant_id: tid(req), client_id: client.id },
  });
  if (!row) {
    res.status(404).json({ error: "Ubicación no encontrada" });
    return;
  }
  const parsed = bodySchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  await row.update(parsed.data as never);
  res.json(clientUbicacionToJson(row));
});

export const deleteClientUbicacion = asyncHandler(async (req: Request, res: Response) => {
  const client = await getClientOr404(req, res);
  if (!client) return;
  const row = await ClientUbicacion.findOne({
    where: { id: req.params.id, tenant_id: tid(req), client_id: client.id },
  });
  if (!row) {
    res.status(404).json({ error: "Ubicación no encontrada" });
    return;
  }
  await row.destroy();
  res.status(204).send();
});
