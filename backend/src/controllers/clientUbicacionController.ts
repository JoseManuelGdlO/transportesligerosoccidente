import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Request, Response } from "express";
import { Client, ClientUbicacion } from "../models";
import { identityChanged, matchActiveUbicacion } from "../services/clientUbicacionCatalog";
import { asyncHandler } from "../utils/asyncHandler";
import { clientUbicacionToJson } from "../utils/serialize";

const tid = (req: Request) => req.user!.tenantId;

function upperText(value: string | undefined): string | undefined {
  if (value == null) return value;
  return value.trim().toUpperCase();
}

function normalizeUbicacionText<T extends { nombre?: string; razon_social?: string; calle?: string }>(
  data: T,
): T {
  return {
    ...data,
    ...(data.nombre !== undefined ? { nombre: upperText(data.nombre) } : {}),
    ...(data.razon_social !== undefined ? { razon_social: upperText(data.razon_social) } : {}),
    ...(data.calle !== undefined ? { calle: upperText(data.calle) } : {}),
  };
}

const bodySchema = z.object({
  nombre: z.string().min(1),
  rfc: z.string().max(13).optional(),
  razon_social: z.string().max(255).optional(),
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

export const listTenantUbicaciones = asyncHandler(async (req: Request, res: Response) => {
  const rows = await ClientUbicacion.findAll({
    where: { tenant_id: tid(req), estatus: "activo" },
    include: [{ model: Client, attributes: ["razon_social"] }],
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
  const data = normalizeUbicacionText(parsed.data);
  const match = await matchActiveUbicacion(tid(req), client.id, { ...data, client_id: client.id });
  if (match && "ambiguous" in match) {
    res.status(409).json({
      error: "Hay varias ubicaciones con esa calle y ese CP. Indica la colonia para no duplicar.",
    });
    return;
  }
  if (match && "match" in match) {
    const current = await ClientUbicacion.findByPk(match.match.id!);
    if (current && Object.keys(match.patch).length > 0) {
      await current.update(match.patch as never);
    }
    res.status(200).json({ ...clientUbicacionToJson(current!), reused: true });
    return;
  }
  const row = await ClientUbicacion.create({
    id: randomUUID(),
    tenant_id: tid(req),
    client_id: client.id,
    ...data,
    tipo: data.tipo ?? "Ambos",
    estatus: data.estatus ?? "activo",
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
  const data = normalizeUbicacionText(parsed.data);
  const stored = { ...row.get({ plain: true }), client_id: client.id };
  const next = {
    ...stored,
    ...data,
    client_id: client.id,
  };
  if (identityChanged(stored, next)) {
    const collision = await matchActiveUbicacion(tid(req), client.id, next, row.id);
    if (collision && ("match" in collision || "ambiguous" in collision)) {
      res.status(409).json({ error: "Esa ubicación ya existe" });
      return;
    }
  }
  await row.update(data as never);
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
