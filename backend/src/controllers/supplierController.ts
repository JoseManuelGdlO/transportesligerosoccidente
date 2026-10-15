import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Request, Response } from "express";
import { Supplier } from "../models";
import { asyncHandler } from "../utils/asyncHandler";
import { supplierToJson } from "../utils/serialize";
import {
  assertSupplierRfcAvailable,
  detachFuelFromAutoSupplier,
  listAutoSuppliersForCleanup,
  mergeAutoSupplier,
  parseSupplierRfc,
  rfcConflictMessage,
} from "../services/supplierCatalogService";

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

function sendKnown(res: Response, err: unknown): boolean {
  const status = (err as { status?: number }).status;
  const conflict = rfcConflictMessage(err);
  if (conflict) {
    res.status(409).json({ error: conflict });
    return true;
  }
  if (status && status < 500 && err instanceof Error) {
    res.status(status).json({ error: err.message });
    return true;
  }
  return false;
}

export const listSuppliers = asyncHandler(async (req: Request, res: Response) => {
  const rows = await Supplier.findAll({
    where: { tenant_id: tid(req) },
    order: [["razon_social", "ASC"]],
  });
  res.json(rows.map(supplierToJson));
});

export const listAutoSupplierReview = asyncHandler(async (req: Request, res: Response) => {
  res.json(await listAutoSuppliersForCleanup(tid(req)));
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
  let rfc: string | null;
  try {
    rfc = parseSupplierRfc(data.rfc, true);
    if (rfc) await assertSupplierRfcAvailable(tid(req), rfc);
  } catch (err) {
    if (sendKnown(res, err)) return;
    throw err;
  }
  try {
    const s = await Supplier.create({
      id: randomUUID(),
      tenant_id: tid(req),
      razon_social: data.razon_social,
      rfc,
      contacto: data.contacto || null,
      telefono: data.telefono || null,
      email: data.email || null,
      dias_credito: data.dias_credito ?? null,
      estatus: data.estatus ?? "activo",
      origen: "manual",
      observaciones: data.observaciones || null,
    } as never);
    res.status(201).json(supplierToJson(s));
  } catch (err) {
    if (sendKnown(res, err)) return;
    throw err;
  }
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
  let rfcPatch: { rfc?: string | null; origen?: "manual" } = {};
  if (data.rfc !== undefined) {
    try {
      const rfc = parseSupplierRfc(data.rfc, false);
      if (rfc) await assertSupplierRfcAvailable(tid(req), rfc, s.id);
      rfcPatch = {
        rfc,
        ...(rfc && s.origen === "auto" ? { origen: "manual" as const } : {}),
      };
    } catch (err) {
      if (sendKnown(res, err)) return;
      throw err;
    }
  }
  try {
    await s.update({
      ...(data.razon_social !== undefined ? { razon_social: data.razon_social } : {}),
      ...rfcPatch,
      ...(data.contacto !== undefined ? { contacto: data.contacto || null } : {}),
      ...(data.telefono !== undefined ? { telefono: data.telefono || null } : {}),
      ...(data.email !== undefined ? { email: data.email || null } : {}),
      ...(data.dias_credito !== undefined ? { dias_credito: data.dias_credito } : {}),
      ...(data.estatus !== undefined ? { estatus: data.estatus } : {}),
      ...(data.observaciones !== undefined ? { observaciones: data.observaciones || null } : {}),
    } as never);
    res.json(supplierToJson(s));
  } catch (err) {
    if (sendKnown(res, err)) return;
    throw err;
  }
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

export const postDetachFuel = asyncHandler(async (req: Request, res: Response) => {
  try {
    res.json(await detachFuelFromAutoSupplier(tid(req), req.params.id));
  } catch (err) {
    if (sendKnown(res, err)) return;
    throw err;
  }
});

const mergeSchema = z.object({ target_id: z.string().uuid() });

export const postMergeSupplier = asyncHandler(async (req: Request, res: Response) => {
  const parsed = mergeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  try {
    res.json(await mergeAutoSupplier(tid(req), req.params.id, parsed.data.target_id));
  } catch (err) {
    if (sendKnown(res, err)) return;
    throw err;
  }
});
