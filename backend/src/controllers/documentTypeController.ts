import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Request, Response } from "express";
import { DocumentType } from "../models";
import { asyncHandler } from "../utils/asyncHandler";
import { documentTypeToJson } from "../utils/documentSerialize";
import { Document } from "../models";

const tid = (req: Request) => req.user!.tenantId;

const createSchema = z.object({
  slug: z.string().min(1).max(64),
  nombre: z.string().min(1).max(255),
  aplica_a: z.enum(["operador", "unidad"]),
  dias_aviso: z.coerce.number().int().min(0).max(3650).optional(),
  requiere_vigencia: z.coerce.boolean().optional(),
  activo: z.coerce.boolean().optional(),
});

const patchSchema = createSchema.partial();

export const listDocumentTypes = asyncHandler(async (req: Request, res: Response) => {
  const rows = await DocumentType.findAll({
    where: { tenant_id: tid(req) },
    order: [
      ["aplica_a", "ASC"],
      ["nombre", "ASC"],
    ],
  });
  res.json(rows.map(documentTypeToJson));
});

export const createDocumentType = asyncHandler(async (req: Request, res: Response) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const d = await DocumentType.create({
    id: randomUUID(),
    tenant_id: tid(req),
    slug: parsed.data.slug,
    nombre: parsed.data.nombre,
    aplica_a: parsed.data.aplica_a,
    dias_aviso: parsed.data.dias_aviso ?? 30,
    requiere_vigencia: parsed.data.requiere_vigencia ?? true,
    activo: parsed.data.activo ?? true,
  });
  res.status(201).json(documentTypeToJson(d));
});

export const updateDocumentType = asyncHandler(async (req: Request, res: Response) => {
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const d = await DocumentType.findOne({ where: { id: req.params.id, tenant_id: tid(req) } });
  if (!d) {
    res.status(404).json({ error: "No encontrado" });
    return;
  }
  await d.update(parsed.data);
  res.json(documentTypeToJson(d));
});

export const deleteDocumentType = asyncHandler(async (req: Request, res: Response) => {
  const d = await DocumentType.findOne({ where: { id: req.params.id, tenant_id: tid(req) } });
  if (!d) {
    res.status(404).json({ error: "No encontrado" });
    return;
  }
  const n = await Document.count({ where: { document_type_id: d.id, tenant_id: tid(req) } });
  if (n > 0) {
    res.status(400).json({ error: "No se puede eliminar: hay documentos asociados a este tipo" });
    return;
  }
  await d.destroy();
  res.status(204).send();
});
