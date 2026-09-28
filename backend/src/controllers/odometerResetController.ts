import { z } from "zod";
import type { Request, Response } from "express";
import { Truck, TruckOdometerReset } from "../models";
import {
  createOdometerReset,
  deleteOdometerReset,
  listOdometerResets,
  previewOdometerReset,
} from "../services/odometerResetService";
import { asyncHandler } from "../utils/asyncHandler";
import { iso } from "../utils/numbers";

const tid = (req: Request) => req.user!.tenantId;

const adjustmentSchema = z.object({
  trip_id: z.string().min(1),
  km_inicial: z.number().int().nonnegative(),
  km_final: z.number().int().nonnegative().nullable(),
});

const createBodySchema = z.object({
  effective_at: z.string().min(1),
  new_km: z.number().int().nonnegative(),
  motivo: z.string().trim().min(3).max(512),
  adjustments: z.array(adjustmentSchema).default([]),
});

function resetToJson(row: TruckOdometerReset) {
  return {
    id: row.id,
    truck_id: row.truck_id,
    effective_at: iso(row.effective_at)!,
    old_km: row.old_km,
    new_km: row.new_km,
    motivo: row.motivo,
    created_by_user_id: row.created_by_user_id ?? null,
    created_at: iso(row.createdAt)!,
  };
}

async function assertTruckExists(req: Request): Promise<boolean> {
  const t = await Truck.findOne({ where: { id: req.params.id, tenant_id: tid(req) } });
  return t != null;
}

function sendServiceError(res: Response, e: unknown) {
  const err = e as Error & { status?: number };
  res.status(err.status ?? 500).json({ error: err.message });
}

export const list = asyncHandler(async (req: Request, res: Response) => {
  if (!(await assertTruckExists(req))) {
    res.status(404).json({ error: "No encontrado" });
    return;
  }
  const rows = await listOdometerResets(tid(req), req.params.id);
  res.json(rows.map(resetToJson));
});

export const preview = asyncHandler(async (req: Request, res: Response) => {
  if (!(await assertTruckExists(req))) {
    res.status(404).json({ error: "No encontrado" });
    return;
  }
  const raw = typeof req.query.effective_at === "string" ? req.query.effective_at : "";
  const effectiveAt = new Date(raw);
  if (!raw || Number.isNaN(effectiveAt.getTime())) {
    res.status(400).json({ error: "Indica la fecha desde la que aplica el cambio" });
    return;
  }
  try {
    const result = await previewOdometerReset(tid(req), req.params.id, effectiveAt);
    res.json(result);
  } catch (e) {
    sendServiceError(res, e);
  }
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const parsed = createBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { effective_at, new_km, motivo, adjustments } = parsed.data;
  const effectiveAt = new Date(effective_at);
  if (Number.isNaN(effectiveAt.getTime())) {
    res.status(400).json({ error: "La fecha de vigencia no es válida" });
    return;
  }
  try {
    const row = await createOdometerReset(tid(req), req.params.id, {
      effective_at: effectiveAt,
      new_km,
      motivo,
      adjustments,
      created_by_user_id: req.user!.id,
    });
    res.status(201).json(resetToJson(row));
  } catch (e) {
    sendServiceError(res, e);
  }
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  if (!(await assertTruckExists(req))) {
    res.status(404).json({ error: "No encontrado" });
    return;
  }
  const reset = await TruckOdometerReset.findOne({
    where: {
      id: req.params.resetId,
      tenant_id: tid(req),
      truck_id: req.params.id,
    },
  });
  if (!reset) {
    res.status(404).json({ error: "Reinicio no encontrado" });
    return;
  }
  try {
    await deleteOdometerReset(tid(req), req.params.resetId);
    res.status(204).send();
  } catch (e) {
    sendServiceError(res, e);
  }
});
