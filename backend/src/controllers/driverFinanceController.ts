import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Request, Response } from "express";
import {
  Driver,
  DriverAdvance,
  DriverDiscount,
  DriverCompensation,
  DriverExtraViatico,
  sequelize,
} from "../models";
import { asyncHandler } from "../utils/asyncHandler";
import { num } from "../utils/numbers";
import {
  getDriverAccountSummary,
  createAccountItem,
  createDirectPayment,
  getAccountItemDetail,
  cancelAccountItem,
  updateAccountItem,
} from "../services/driverAccountService";
import { syncExtraViaticoComprobadoInSnapshot } from "../services/settlementService";

const tid = (req: Request) => req.user!.tenantId;

async function assertDriver(tenantId: string, driverId: string) {
  const d = await Driver.findOne({ where: { id: driverId, tenant_id: tenantId } });
  if (!d) {
    const err = new Error("Operador no encontrado");
    (err as Error & { status?: number }).status = 404;
    throw err;
  }
  return d;
}

const advanceSchema = z.object({
  monto: z.number().positive(),
  fecha: z.string().min(1),
  descripcion: z.string().optional(),
});

const discountSchema = z.object({
  tipo: z
    .enum(["prestamo", "dano", "multa", "nomina", "caja", "ahorro", "fianza", "otro"])
    .optional(),
  monto: z.number().positive(),
  fecha: z.string().min(1),
  descripcion: z.string().optional(),
});

const compensationSchema = z.object({
  tipo: z
    .enum(["bono", "espera", "incentivo", "nomina", "caja", "ahorro", "fianza", "otro"])
    .optional(),
  monto: z.number().positive(),
  fecha: z.string().min(1),
  descripcion: z.string().optional(),
});

const extraViaticoSchema = z.object({
  fecha: z.string().min(1),
  descripcion: z.string().optional(),
  monto_entregado: z.number().positive(),
  monto_comprobado: z.number().min(0).optional(),
});

const extraViaticoPatchSchema = z.object({
  monto_comprobado: z.number().min(0),
});

const accountItemSchema = z.object({
  tipo: z.enum(["incidencia", "prestamo"]),
  concepto: z.string().min(1).max(512),
  monto_original: z.number().positive(),
  cuota_liquidacion: z.number().positive(),
  fecha: z.string().min(1),
  descuento_activo: z.boolean().optional(),
});

const accountItemPatchSchema = z
  .object({
    descuento_activo: z.boolean().optional(),
    cuota_liquidacion: z.number().positive().optional(),
    monto_original: z.number().positive().optional(),
  })
  .refine(
    (data) =>
      data.descuento_activo !== undefined ||
      data.cuota_liquidacion !== undefined ||
      data.monto_original !== undefined,
    { message: "Nada que actualizar" },
  );

const directPaymentSchema = z.object({
  monto: z.number().positive(),
  fecha: z.string().min(1),
  nota: z.string().max(512).optional(),
});

export const listAdvances = asyncHandler(async (req: Request, res: Response) => {
  await assertDriver(tid(req), req.params.id);
  const pending = req.query.pending === "true";
  const where: Record<string, unknown> = { tenant_id: tid(req), driver_id: req.params.id };
  if (pending) where.settlement_id = null;
  const rows = await DriverAdvance.findAll({ where, order: [["fecha", "DESC"]] });
  res.json(
    rows.map((r) => ({
      id: r.id,
      monto: num(r.monto),
      fecha: r.fecha,
      descripcion: r.descripcion,
      settlement_id: r.settlement_id ?? undefined,
    })),
  );
});

export const createAdvance = asyncHandler(async (req: Request, res: Response) => {
  await assertDriver(tid(req), req.params.id);
  const parsed = advanceSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const row = await DriverAdvance.create({
    id: randomUUID(),
    tenant_id: tid(req),
    driver_id: req.params.id,
    monto: parsed.data.monto,
    fecha: parsed.data.fecha,
    descripcion: parsed.data.descripcion?.trim() || "Anticipo",
    settlement_id: null,
  } as never);
  res.status(201).json({
    id: row.id,
    monto: num(row.monto),
    fecha: row.fecha,
    descripcion: row.descripcion,
  });
});

export const deleteAdvance = asyncHandler(async (req: Request, res: Response) => {
  const row = await DriverAdvance.findOne({
    where: { id: req.params.advanceId, driver_id: req.params.id, tenant_id: tid(req) },
  });
  if (!row) {
    res.status(404).json({ error: "No encontrado" });
    return;
  }
  if (row.settlement_id) {
    res.status(400).json({ error: "Anticipo ya aplicado en liquidación" });
    return;
  }
  await row.destroy();
  res.status(204).send();
});

export const listDiscounts = asyncHandler(async (req: Request, res: Response) => {
  await assertDriver(tid(req), req.params.id);
  const pending = req.query.pending === "true";
  const where: Record<string, unknown> = { tenant_id: tid(req), driver_id: req.params.id };
  if (pending) where.settlement_id = null;
  const rows = await DriverDiscount.findAll({ where, order: [["fecha", "DESC"]] });
  res.json(
    rows.map((r) => ({
      id: r.id,
      tipo: r.tipo,
      monto: num(r.monto),
      fecha: r.fecha,
      descripcion: r.descripcion,
      settlement_id: r.settlement_id ?? undefined,
    })),
  );
});

export const createDiscount = asyncHandler(async (req: Request, res: Response) => {
  await assertDriver(tid(req), req.params.id);
  const parsed = discountSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const row = await DriverDiscount.create({
    id: randomUUID(),
    tenant_id: tid(req),
    driver_id: req.params.id,
    tipo: parsed.data.tipo ?? "otro",
    monto: parsed.data.monto,
    fecha: parsed.data.fecha,
    descripcion: parsed.data.descripcion?.trim() || "Descuento",
    settlement_id: null,
  } as never);
  res.status(201).json({
    id: row.id,
    tipo: row.tipo,
    monto: num(row.monto),
    fecha: row.fecha,
    descripcion: row.descripcion,
  });
});

export const deleteDiscount = asyncHandler(async (req: Request, res: Response) => {
  const row = await DriverDiscount.findOne({
    where: { id: req.params.discountId, driver_id: req.params.id, tenant_id: tid(req) },
  });
  if (!row) {
    res.status(404).json({ error: "No encontrado" });
    return;
  }
  if (row.settlement_id) {
    res.status(400).json({ error: "Descuento ya aplicado en liquidación" });
    return;
  }
  await row.destroy();
  res.status(204).send();
});

export const listCompensations = asyncHandler(async (req: Request, res: Response) => {
  await assertDriver(tid(req), req.params.id);
  const pending = req.query.pending === "true";
  const where: Record<string, unknown> = { tenant_id: tid(req), driver_id: req.params.id };
  if (pending) where.settlement_id = null;
  const rows = await DriverCompensation.findAll({ where, order: [["fecha", "DESC"]] });
  res.json(
    rows.map((r) => ({
      id: r.id,
      tipo: r.tipo,
      monto: num(r.monto),
      fecha: r.fecha,
      descripcion: r.descripcion,
      settlement_id: r.settlement_id ?? undefined,
    })),
  );
});

export const createCompensation = asyncHandler(async (req: Request, res: Response) => {
  await assertDriver(tid(req), req.params.id);
  const parsed = compensationSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const row = await DriverCompensation.create({
    id: randomUUID(),
    tenant_id: tid(req),
    driver_id: req.params.id,
    tipo: parsed.data.tipo ?? "otro",
    monto: parsed.data.monto,
    fecha: parsed.data.fecha,
    descripcion: parsed.data.descripcion?.trim() || "Compensación",
    settlement_id: null,
  } as never);
  res.status(201).json({
    id: row.id,
    tipo: row.tipo,
    monto: num(row.monto),
    fecha: row.fecha,
    descripcion: row.descripcion,
  });
});

export const deleteCompensation = asyncHandler(async (req: Request, res: Response) => {
  const row = await DriverCompensation.findOne({
    where: { id: req.params.compensationId, driver_id: req.params.id, tenant_id: tid(req) },
  });
  if (!row) {
    res.status(404).json({ error: "No encontrado" });
    return;
  }
  if (row.settlement_id) {
    res.status(400).json({ error: "Compensación ya aplicada en liquidación" });
    return;
  }
  await row.destroy();
  res.status(204).send();
});

export const listExtraViaticos = asyncHandler(async (req: Request, res: Response) => {
  await assertDriver(tid(req), req.params.id);
  const pending = req.query.pending === "true";
  const where: Record<string, unknown> = { tenant_id: tid(req), driver_id: req.params.id };
  if (pending) where.settlement_id = null;
  const rows = await DriverExtraViatico.findAll({ where, order: [["fecha", "DESC"]] });
  res.json(
    rows.map((r) => ({
      id: r.id,
      fecha: r.fecha,
      descripcion: r.descripcion,
      monto_entregado: num(r.monto_entregado),
      monto_comprobado: num(r.monto_comprobado),
      settlement_id: r.settlement_id ?? undefined,
    })),
  );
});

export const createExtraViatico = asyncHandler(async (req: Request, res: Response) => {
  await assertDriver(tid(req), req.params.id);
  const parsed = extraViaticoSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const row = await DriverExtraViatico.create({
    id: randomUUID(),
    tenant_id: tid(req),
    driver_id: req.params.id,
    fecha: parsed.data.fecha,
    descripcion: parsed.data.descripcion?.trim() || "Viático extra",
    monto_entregado: parsed.data.monto_entregado,
    monto_comprobado: parsed.data.monto_comprobado ?? 0,
    settlement_id: null,
  } as never);
  res.status(201).json({
    id: row.id,
    fecha: row.fecha,
    descripcion: row.descripcion,
    monto_entregado: num(row.monto_entregado),
    monto_comprobado: num(row.monto_comprobado),
    settlement_id: row.settlement_id ?? undefined,
  });
});

export const patchExtraViatico = asyncHandler(async (req: Request, res: Response) => {
  const parsed = extraViaticoPatchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const row = await DriverExtraViatico.findOne({
    where: { id: req.params.extraId, driver_id: req.params.id, tenant_id: tid(req) },
  });
  if (!row) {
    res.status(404).json({ error: "No encontrado" });
    return;
  }
  await sequelize.transaction(async (t) => {
    await row.update({ monto_comprobado: parsed.data.monto_comprobado } as never, { transaction: t });
    await syncExtraViaticoComprobadoInSnapshot(tid(req), row, { transaction: t });
  });
  res.json({
    id: row.id,
    fecha: row.fecha,
    descripcion: row.descripcion,
    monto_entregado: num(row.monto_entregado),
    monto_comprobado: num(row.monto_comprobado),
    settlement_id: row.settlement_id ?? undefined,
  });
});

export const deleteExtraViatico = asyncHandler(async (req: Request, res: Response) => {
  const row = await DriverExtraViatico.findOne({
    where: { id: req.params.extraId, driver_id: req.params.id, tenant_id: tid(req) },
  });
  if (!row) {
    res.status(404).json({ error: "No encontrado" });
    return;
  }
  if (row.settlement_id) {
    res.status(400).json({ error: "Viático extra ya aplicado en liquidación" });
    return;
  }
  await row.destroy();
  res.status(204).send();
});

export const getAccount = asyncHandler(async (req: Request, res: Response) => {
  const summary = await getDriverAccountSummary(tid(req), req.params.id);
  res.json(summary);
});

export const createAccountDebt = asyncHandler(async (req: Request, res: Response) => {
  const parsed = accountItemSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const row = await createAccountItem(tid(req), req.params.id, parsed.data);
  res.status(201).json(row);
});

export const getAccountDebt = asyncHandler(async (req: Request, res: Response) => {
  const row = await getAccountItemDetail(tid(req), req.params.id, req.params.itemId);
  res.json(row);
});

export const createAccountPayment = asyncHandler(async (req: Request, res: Response) => {
  const parsed = directPaymentSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const row = await createDirectPayment(tid(req), req.params.id, req.params.itemId, parsed.data);
  res.status(201).json(row);
});

export const cancelAccountDebt = asyncHandler(async (req: Request, res: Response) => {
  const row = await cancelAccountItem(tid(req), req.params.id, req.params.itemId);
  res.json(row);
});

export const patchAccountDebt = asyncHandler(async (req: Request, res: Response) => {
  const parsed = accountItemPatchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const row = await updateAccountItem(tid(req), req.params.id, req.params.itemId, parsed.data);
  res.json(row);
});
