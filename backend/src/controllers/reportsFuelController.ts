import { z } from "zod";
import type { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { prorateRange, prorateRangeAll, fuelSummaryByTruck } from "../services/fuelProrationService";

const tid = (req: Request) => req.user!.tenantId;

const rangeSchema = z.object({
  truck_id: z.string().min(1).optional(),
  inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  fin: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const summarySchema = z.object({
  inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  fin: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const getFuelProration = asyncHandler(async (req: Request, res: Response) => {
  const parsed = rangeSchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { truck_id, inicio, fin } = parsed.data;
  if (inicio > fin) {
    res.status(400).json({ error: "inicio debe ser anterior o igual a fin" });
    return;
  }
  try {
    if (truck_id) {
      const report = await prorateRange(tid(req), truck_id, inicio, fin);
      res.json({ inicio, fin, unidades: [report] });
      return;
    }
    const report = await prorateRangeAll(tid(req), inicio, fin);
    res.json(report);
  } catch (e) {
    const err = e as Error & { status?: number };
    res.status(err.status ?? 500).json({ error: err.message });
  }
});

export const getFuelSummary = asyncHandler(async (req: Request, res: Response) => {
  const parsed = summarySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { inicio, fin } = parsed.data;
  if (inicio > fin) {
    res.status(400).json({ error: "inicio debe ser anterior o igual a fin" });
    return;
  }
  const rows = await fuelSummaryByTruck(tid(req), inicio, fin);
  res.json({ inicio, fin, unidades: rows });
});
