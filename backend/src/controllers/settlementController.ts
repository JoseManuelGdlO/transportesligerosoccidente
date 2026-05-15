import { z } from "zod";
import type { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import * as settlementService from "../services/settlementService";
import { settlementToJson } from "../utils/serialize";

const summaryQuery = z.object({
  driver_id: z.string().min(1),
  inicio: z.string().min(1),
  fin: z.string().min(1),
});

export const getSummary = asyncHandler(async (req: Request, res: Response) => {
  const parsed = summaryQuery.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "driver_id, inicio y fin son requeridos (YYYY-MM-DD)" });
    return;
  }
  const { driver_id, inicio, fin } = parsed.data;
  const data = await settlementService.settlementSummary(req.user!.tenantId, driver_id, inicio, fin);
  res.json(data);
});

const closeBody = z.object({
  driver_id: z.string().min(1),
  fecha_inicio: z.string().min(1),
  fecha_fin: z.string().min(1),
});

export const postClose = asyncHandler(async (req: Request, res: Response) => {
  const parsed = closeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const row = await settlementService.closeSettlement(
    req.user!.tenantId,
    parsed.data.driver_id,
    parsed.data.fecha_inicio,
    parsed.data.fecha_fin,
  );
  res.status(201).json(settlementToJson(row));
});
