import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Request, Response } from "express";
import { Driver, DriverAdvance, DriverDiscount } from "../models";
import { asyncHandler } from "../utils/asyncHandler";
import { num } from "../utils/numbers";

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
  tipo: z.enum(["prestamo", "dano", "multa", "otro"]).optional(),
  monto: z.number().positive(),
  fecha: z.string().min(1),
  descripcion: z.string().optional(),
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
