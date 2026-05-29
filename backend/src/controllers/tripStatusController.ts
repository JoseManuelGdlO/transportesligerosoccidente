import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { tripStatusToJson, tripToJson } from "../utils/serialize";
import * as tripStatusService from "../services/tripStatusService";
import * as tripService from "../services/tripService";

const tid = (req: Request) => req.user!.tenantId;

const createSchema = z.object({
  nombre: z.string().min(1).max(255),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  activo: z.coerce.boolean().optional(),
});

const patchSchema = createSchema.partial();

export const listTripStatuses = asyncHandler(async (req: Request, res: Response) => {
  const rows = await tripStatusService.listTripStatuses(tid(req));
  res.json(rows.map(tripStatusToJson));
});

export const createTripStatus = asyncHandler(async (req: Request, res: Response) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const row = await tripStatusService.createTripStatus(tid(req), parsed.data);
  res.status(201).json(tripStatusToJson(row));
});

export const updateTripStatus = asyncHandler(async (req: Request, res: Response) => {
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const row = await tripStatusService.updateTripStatus(tid(req), req.params.id, parsed.data);
  res.json(tripStatusToJson(row));
});

export const deleteTripStatus = asyncHandler(async (req: Request, res: Response) => {
  await tripStatusService.deleteTripStatus(tid(req), req.params.id);
  res.status(204).send();
});

const setStatusesSchema = z.object({
  status_ids: z.array(z.string().uuid()),
});

export const putTripStatuses = asyncHandler(async (req: Request, res: Response) => {
  const parsed = setStatusesSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  await tripStatusService.setTripCustomStatuses(
    tid(req),
    req.params.id,
    parsed.data.status_ids,
  );
  const trip = await tripService.getTripOrThrow(tid(req), req.params.id, true, undefined, true);
  res.json(tripToJson(trip));
});
