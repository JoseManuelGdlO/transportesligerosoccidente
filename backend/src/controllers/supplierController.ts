import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Request, Response } from "express";
import { Supplier } from "../models";
import { asyncHandler } from "../utils/asyncHandler";
import { supplierToJson } from "../utils/serialize";

const tid = (req: Request) => req.user!.tenantId;

const bodySchema = z.object({
  razon_social: z.string().min(1),
  rfc: z.string().optional().nullable(),
  contacto: z.string().optional().nullable(),
  telefono: z.string().optional().nullable(),
  email: z.string().email().optional().or(z.literal("")).nullable(),
  dias_credito: z.number().int().nonnegative().optional().nullable(),
  estatus: z.enum(["activo", "inactivo"]).optional(),
  observaciones: z.string().optional().nullable(),
});

export const listSuppliers = asyncHandler(async (req: Request, res: Response) => {
  const rows = await Supplier.findAll({
    where: { tenant_id: tid(req) },
    order: [["razon_social", "ASC"]],
  });
  res.json(rows.map(supplierToJson));
});

export const getSupplier = asyncHandler(async (req: Request, res: Response) => {
  const s = await Supplier.findOne({ where: { id: req.params.id, tenant_id: tid(req) } });
  if (!s) {
    res.status(404).json({ error: "No encontrado" });
    return;
  }
  res.json(supplierToJson(s));
});

export const createSupplier = asyncHandler(async (req: Request, res: Response) => {
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const data = parsed.data;
  const s = await Supplier.create({
    id: randomUUID(),
    tenant_id: tid(req),
    razon_social: data.razon_social,
    rfc: data.rfc || null,
    contacto: data.contacto || null,
    telefono: data.telefono || null,
    email: data.email || null,
    dias_credito: data.dias_credito ?? null,
    estatus: data.estatus ?? "activo",
    observaciones: data.observaciones || null,
  } as never);
  res.status(201).json(supplierToJson(s));
});

export const updateSupplier = asyncHandler(async (req: Request, res: Response) => {
  const s = await Supplier.findOne({ where: { id: req.params.id, tenant_id: tid(req) } });
  if (!s) {
    res.status(404).json({ error: "No encontrado" });
    return;
  }
  const parsed = bodySchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const data = parsed.data;
  await s.update({
    ...(data.razon_social !== undefined ? { razon_social: data.razon_social } : {}),
    ...(data.rfc !== undefined ? { rfc: data.rfc || null } : {}),
    ...(data.contacto !== undefined ? { contacto: data.contacto || null } : {}),
    ...(data.telefono !== undefined ? { telefono: data.telefono || null } : {}),
    ...(data.email !== undefined ? { email: data.email || null } : {}),
    ...(data.dias_credito !== undefined ? { dias_credito: data.dias_credito } : {}),
    ...(data.estatus !== undefined ? { estatus: data.estatus } : {}),
    ...(data.observaciones !== undefined ? { observaciones: data.observaciones || null } : {}),
  } as never);
  res.json(supplierToJson(s));
});

export const deleteSupplier = asyncHandler(async (req: Request, res: Response) => {
  const s = await Supplier.findOne({ where: { id: req.params.id, tenant_id: tid(req) } });
  if (!s) {
    res.status(404).json({ error: "No encontrado" });
    return;
  }
  await s.destroy();
  res.status(204).send();
});
