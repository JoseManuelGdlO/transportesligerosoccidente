import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Op } from "sequelize";
import { z } from "zod";
import type { Request, Response } from "express";
import type { Express } from "express";
import { Document, DocumentType, Driver, Truck } from "../models";
import { asyncHandler } from "../utils/asyncHandler";
import { documentToJson } from "../utils/documentSerialize";
import { uploadRootDir } from "../middlewares/uploadDocument";

const tid = (req: Request) => req.user!.tenantId;

function relFilePath(
  tenantId: string,
  entity: "drivers" | "trucks",
  entityId: string,
  filename: string,
): string {
  return `${tenantId}/${entity}/${entityId}/${filename}`;
}

function statusForDocument(
  d: Document,
  dt: DocumentType,
): "pendiente" | "vigente" | "por_vencer" | "vencido" | "sin_vigencia" {
  if (!dt.requiere_vigencia) return "sin_vigencia";
  if (!d.vigencia_fin) return "pendiente";
  const end = new Date(d.vigencia_fin);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  const diffDays = Math.round((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return "vencido";
  if (diffDays <= dt.dias_aviso) return "por_vencer";
  return "vigente";
}

const metaSchema = z.object({
  document_type_id: z.string().uuid(),
  numero: z.string().optional().nullable(),
  vigencia_inicio: z.string().optional().nullable(),
  vigencia_fin: z.string().optional().nullable(),
  notas: z.string().optional().nullable(),
});

const patchSchema = z.object({
  numero: z.string().optional().nullable(),
  vigencia_inicio: z.string().optional().nullable(),
  vigencia_fin: z.string().optional().nullable(),
  notas: z.string().optional().nullable(),
});

async function mergeDriverItems(tenantId: string, driverId: string) {
  const types = await DocumentType.findAll({
    where: { tenant_id: tenantId, activo: true, aplica_a: "operador" },
    order: [["nombre", "ASC"]],
  });
  const docs = await Document.findAll({
    where: { tenant_id: tenantId, documentable_type: "driver", documentable_id: driverId },
  });
  const byType = new Map(docs.map((d) => [d.document_type_id, d]));
  return types.map((t) => {
    const d = byType.get(t.id) ?? null;
    const status = d ? statusForDocument(d, t) : "pendiente";
    return {
      document_type: { id: t.id, slug: t.slug, nombre: t.nombre, aplica_a: t.aplica_a, dias_aviso: t.dias_aviso, requiere_vigencia: t.requiere_vigencia },
      document: d ? documentToJson(d) : null,
      status,
    };
  });
}

async function mergeTruckItems(tenantId: string, truckId: string) {
  const types = await DocumentType.findAll({
    where: { tenant_id: tenantId, activo: true, aplica_a: "unidad" },
    order: [["nombre", "ASC"]],
  });
  const docs = await Document.findAll({
    where: { tenant_id: tenantId, documentable_type: "truck", documentable_id: truckId },
  });
  const byType = new Map(docs.map((d) => [d.document_type_id, d]));
  return types.map((t) => {
    const d = byType.get(t.id) ?? null;
    const status = d ? statusForDocument(d, t) : "pendiente";
    return {
      document_type: { id: t.id, slug: t.slug, nombre: t.nombre, aplica_a: t.aplica_a, dias_aviso: t.dias_aviso, requiere_vigencia: t.requiere_vigencia },
      document: d ? documentToJson(d) : null,
      status,
    };
  });
}

export const listDriverDocuments = asyncHandler(async (req: Request, res: Response) => {
  const driver = await Driver.findOne({ where: { id: req.params.id, tenant_id: tid(req) } });
  if (!driver) {
    res.status(404).json({ error: "Operador no encontrado" });
    return;
  }
  const items = await mergeDriverItems(tid(req), driver.id);
  res.json({ items });
});

export const listTruckDocuments = asyncHandler(async (req: Request, res: Response) => {
  const truck = await Truck.findOne({ where: { id: req.params.id, tenant_id: tid(req) } });
  if (!truck) {
    res.status(404).json({ error: "Unidad no encontrada" });
    return;
  }
  const items = await mergeTruckItems(tid(req), truck.id);
  res.json({ items });
});

function validateDocMeta(
  dt: DocumentType,
  parsed: z.infer<typeof metaSchema>,
): { ok: true } | { ok: false; error: string } {
  if (dt.requiere_vigencia) {
    if (!parsed.vigencia_fin) return { ok: false, error: "La vigencia final es obligatoria para este documento" };
  }
  return { ok: true };
}

export const createDriverDocument = asyncHandler(async (req: Request, res: Response) => {
  const parsed = metaSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const file = req.file as Express.Multer.File | undefined;
  if (!file) {
    res.status(400).json({ error: "Debe adjuntar un archivo" });
    return;
  }

  const driver = await Driver.findOne({ where: { id: req.params.id, tenant_id: tid(req) } });
  if (!driver) {
    fs.unlink(file.path, () => {});
    res.status(404).json({ error: "Operador no encontrado" });
    return;
  }

  const dt = await DocumentType.findOne({
    where: { id: parsed.data.document_type_id, tenant_id: tid(req), aplica_a: "operador", activo: true },
  });
  if (!dt) {
    fs.unlink(file.path, () => {});
    res.status(400).json({ error: "Tipo de documento inválido o inactivo" });
    return;
  }

  const metaOk = validateDocMeta(dt, parsed.data);
  if (!metaOk.ok) {
    fs.unlink(file.path, () => {});
    res.status(400).json({ error: metaOk.error });
    return;
  }

  const existing = await Document.findOne({
    where: {
      tenant_id: tid(req),
      document_type_id: dt.id,
      documentable_type: "driver",
      documentable_id: driver.id,
    },
  });
  if (existing) {
    fs.unlink(file.path, () => {});
    res.status(409).json({ error: "Ya existe un documento de este tipo; edítelo o elimínelo" });
    return;
  }

  const rel = relFilePath(tid(req), "drivers", driver.id, file.filename);
  const doc = await Document.create({
    id: randomUUID(),
    tenant_id: tid(req),
    document_type_id: dt.id,
    documentable_type: "driver",
    documentable_id: driver.id,
    numero: parsed.data.numero ?? null,
    vigencia_inicio: parsed.data.vigencia_inicio || null,
    vigencia_fin: parsed.data.vigencia_fin || null,
    file_path: rel,
    file_name: file.originalname,
    mime: file.mimetype,
    size: file.size,
    notas: parsed.data.notas ?? null,
  });
  res.status(201).json(documentToJson(doc));
});

export const createTruckDocument = asyncHandler(async (req: Request, res: Response) => {
  const parsed = metaSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const file = req.file as Express.Multer.File | undefined;
  if (!file) {
    res.status(400).json({ error: "Debe adjuntar un archivo" });
    return;
  }

  const truck = await Truck.findOne({ where: { id: req.params.id, tenant_id: tid(req) } });
  if (!truck) {
    fs.unlink(file.path, () => {});
    res.status(404).json({ error: "Unidad no encontrada" });
    return;
  }

  const dt = await DocumentType.findOne({
    where: { id: parsed.data.document_type_id, tenant_id: tid(req), aplica_a: "unidad", activo: true },
  });
  if (!dt) {
    fs.unlink(file.path, () => {});
    res.status(400).json({ error: "Tipo de documento inválido o inactivo" });
    return;
  }

  const metaOk = validateDocMeta(dt, parsed.data);
  if (!metaOk.ok) {
    fs.unlink(file.path, () => {});
    res.status(400).json({ error: metaOk.error });
    return;
  }

  const existing = await Document.findOne({
    where: {
      tenant_id: tid(req),
      document_type_id: dt.id,
      documentable_type: "truck",
      documentable_id: truck.id,
    },
  });
  if (existing) {
    fs.unlink(file.path, () => {});
    res.status(409).json({ error: "Ya existe un documento de este tipo; edítelo o elimínelo" });
    return;
  }

  const rel = relFilePath(tid(req), "trucks", truck.id, file.filename);
  const doc = await Document.create({
    id: randomUUID(),
    tenant_id: tid(req),
    document_type_id: dt.id,
    documentable_type: "truck",
    documentable_id: truck.id,
    numero: parsed.data.numero ?? null,
    vigencia_inicio: parsed.data.vigencia_inicio || null,
    vigencia_fin: parsed.data.vigencia_fin || null,
    file_path: rel,
    file_name: file.originalname,
    mime: file.mimetype,
    size: file.size,
    notas: parsed.data.notas ?? null,
  });
  res.status(201).json(documentToJson(doc));
});

export const patchDocument = asyncHandler(async (req: Request, res: Response) => {
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const existing = (req as Request & { patchDocument?: Document }).patchDocument;
  if (!existing) {
    res.status(500).json({ error: "Estado inconsistente" });
    return;
  }

  const doc = await Document.findOne({
    where: { id: existing.id, tenant_id: tid(req) },
    include: [{ model: DocumentType }],
  });
  if (!doc || !doc.DocumentType) {
    res.status(404).json({ error: "No encontrado" });
    return;
  }

  const data: Record<string, unknown> = {};
  if (parsed.data.numero !== undefined) data.numero = parsed.data.numero;
  if (parsed.data.vigencia_inicio !== undefined) data.vigencia_inicio = parsed.data.vigencia_inicio;
  if (parsed.data.vigencia_fin !== undefined) data.vigencia_fin = parsed.data.vigencia_fin;
  if (parsed.data.notas !== undefined) data.notas = parsed.data.notas;

  const file = req.file as Express.Multer.File | undefined;
  if (file) {
    const oldPath = doc.file_path ? path.join(uploadRootDir(), doc.file_path) : null;
    const folder = doc.documentable_type === "driver" ? "drivers" : "trucks";
    const rel = relFilePath(tid(req), folder, doc.documentable_id, file.filename);
    data.file_path = rel;
    data.file_name = file.originalname;
    data.mime = file.mimetype;
    data.size = file.size;
    if (oldPath && fs.existsSync(oldPath)) {
      fs.unlink(oldPath, () => {});
    }
  }

  const mergedForValidation = metaSchema.safeParse({
    document_type_id: doc.document_type_id,
    numero: parsed.data.numero !== undefined ? parsed.data.numero : doc.numero,
    vigencia_inicio: parsed.data.vigencia_inicio !== undefined ? parsed.data.vigencia_inicio : doc.vigencia_inicio,
    vigencia_fin: parsed.data.vigencia_fin !== undefined ? parsed.data.vigencia_fin : doc.vigencia_fin,
    notas: parsed.data.notas !== undefined ? parsed.data.notas : doc.notas,
  });
  if (!mergedForValidation.success) {
    if (file) fs.unlink(file.path, () => {});
    res.status(400).json({ error: mergedForValidation.error.flatten() });
    return;
  }
  const metaOk = validateDocMeta(doc.DocumentType, mergedForValidation.data);
  if (!metaOk.ok) {
    if (file) fs.unlink(file.path, () => {});
    res.status(400).json({ error: metaOk.error });
    return;
  }

  await doc.update(data);
  await doc.reload();
  res.json(documentToJson(doc));
});

export const deleteDocument = asyncHandler(async (req: Request, res: Response) => {
  const doc = await Document.findOne({ where: { id: req.params.id, tenant_id: tid(req) } });
  if (!doc) {
    res.status(404).json({ error: "No encontrado" });
    return;
  }
  const abs = doc.file_path ? path.join(uploadRootDir(), doc.file_path) : null;
  await doc.destroy();
  if (abs && fs.existsSync(abs)) fs.unlink(abs, () => {});
  res.status(204).send();
});

export const streamDocumentFile = asyncHandler(async (req: Request, res: Response) => {
  const doc = await Document.findOne({ where: { id: req.params.id, tenant_id: tid(req) } });
  if (!doc?.file_path) {
    res.status(404).json({ error: "Archivo no encontrado" });
    return;
  }
  const abs = path.join(uploadRootDir(), doc.file_path);
  if (!fs.existsSync(abs)) {
    res.status(404).json({ error: "Archivo no encontrado en almacenamiento" });
    return;
  }
  res.setHeader("Content-Type", doc.mime || "application/octet-stream");
  const disp = (req.query.disposition as string) === "attachment" ? "attachment" : "inline";
  res.setHeader("Content-Disposition", `${disp}; filename="${encodeURIComponent(doc.file_name || "documento")}"`);
  res.sendFile(abs);
});

export const getDashboardDocumentSummary = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = tid(req);
  const docs = await Document.findAll({
    where: {
      tenant_id: tenantId,
      vigencia_fin: { [Op.ne]: null },
    },
    include: [{ model: DocumentType, required: true, where: { requiere_vigencia: true } }],
  });

  let porVencerCount = 0;
  let vencidoCount = 0;
  const urgent: {
    document_id: string;
    document_type_nombre: string;
    documentable_type: string;
    documentable_id: string;
    vigencia_fin: string;
    status: string;
    days_left: number;
  }[] = [];

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (const d of docs) {
    const dt = d.DocumentType;
    if (!dt || !d.vigencia_fin) continue;
    const end = new Date(d.vigencia_fin);
    end.setHours(0, 0, 0, 0);
    const daysLeft = Math.round((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    let status: string;
    if (daysLeft < 0) {
      status = "vencido";
      vencidoCount += 1;
    } else if (daysLeft <= dt.dias_aviso) {
      status = "por_vencer";
      porVencerCount += 1;
    } else {
      status = "vigente";
    }
    if (status === "vigente") continue;
    urgent.push({
      document_id: d.id,
      document_type_nombre: dt.nombre,
      documentable_type: d.documentable_type,
      documentable_id: d.documentable_id,
      vigencia_fin: d.vigencia_fin,
      status,
      days_left: daysLeft,
    });
  }

  urgent.sort((a, b) => a.days_left - b.days_left);
  res.json({
    por_vencer_count: porVencerCount,
    vencido_count: vencidoCount,
    upcoming: urgent.slice(0, 5),
  });
});
