import { z } from "zod";
import type { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import * as accountDocumentService from "../services/accountDocumentService";

const tid = (req: Request) => req.user!.tenantId;

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const createSchema = z.object({
  tipo: z.enum(["cxc", "cxp"]),
  client_id: z.string().uuid().optional().nullable(),
  supplier_id: z.string().uuid().optional().nullable(),
  entidad_nombre: z.string().optional(),
  folio: z.string().min(1),
  concepto: z.string().min(1),
  fecha_emision: dateOnly,
  plazo_credito_dias: z.number().int().nonnegative().optional().nullable(),
  fecha_vencimiento: dateOnly.optional().nullable(),
  monto_original: z.number().positive(),
});

const patchSchema = z.object({
  folio: z.string().min(1).optional(),
  concepto: z.string().min(1).optional(),
  fecha_emision: dateOnly.optional(),
  plazo_credito_dias: z.number().int().nonnegative().optional().nullable(),
  fecha_vencimiento: dateOnly.optional().nullable(),
  monto_original: z.number().positive().optional(),
  client_id: z.string().uuid().optional().nullable(),
  supplier_id: z.string().uuid().optional().nullable(),
  entidad_nombre: z.string().optional(),
});

const paymentSchema = z.object({
  monto: z.number().positive(),
  fecha: dateOnly,
  nota: z.string().optional(),
});

export const listAccountDocuments = asyncHandler(async (req: Request, res: Response) => {
  const tipo = req.query.tipo === "cxc" || req.query.tipo === "cxp" ? req.query.tipo : undefined;
  const estatus =
    req.query.estatus === "abierta" ||
    req.query.estatus === "pagada" ||
    req.query.estatus === "cancelada"
      ? req.query.estatus
      : undefined;
  const bucket =
    req.query.bucket === "corriente" ||
    req.query.bucket === "1-30" ||
    req.query.bucket === "31-60" ||
    req.query.bucket === "90+"
      ? req.query.bucket
      : undefined;
  const rows = await accountDocumentService.listDocuments(tid(req), {
    tipo,
    estatus,
    bucket,
    q: typeof req.query.q === "string" ? req.query.q : undefined,
    desde: typeof req.query.desde === "string" ? req.query.desde : undefined,
    hasta: typeof req.query.hasta === "string" ? req.query.hasta : undefined,
  });
  res.json(rows);
});

export const getAging = asyncHandler(async (req: Request, res: Response) => {
  const tipo = req.query.tipo === "cxp" ? "cxp" : "cxc";
  const summary = await accountDocumentService.getAgingSummary(tid(req), tipo);
  res.json(summary);
});

export const getAccountDocument = asyncHandler(async (req: Request, res: Response) => {
  const row = await accountDocumentService.getDocument(tid(req), req.params.id);
  res.json(row);
});

export const createAccountDocument = asyncHandler(async (req: Request, res: Response) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const row = await accountDocumentService.createDocument(tid(req), {
    ...parsed.data,
    origen: "manual",
  });
  res.status(201).json(row);
});

export const patchAccountDocument = asyncHandler(async (req: Request, res: Response) => {
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const row = await accountDocumentService.updateDocument(tid(req), req.params.id, parsed.data);
  res.json(row);
});

export const postPayment = asyncHandler(async (req: Request, res: Response) => {
  const parsed = paymentSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const row = await accountDocumentService.addPayment(
    tid(req),
    req.params.id,
    parsed.data,
    req.user?.id,
  );
  res.status(201).json(row);
});

export const postCancel = asyncHandler(async (req: Request, res: Response) => {
  const row = await accountDocumentService.cancelDocument(tid(req), req.params.id);
  res.json(row);
});

export const postBackfill = asyncHandler(async (req: Request, res: Response) => {
  const result = await accountDocumentService.backfillTenant(tid(req));
  res.json(result);
});
