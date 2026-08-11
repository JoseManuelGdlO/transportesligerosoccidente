import { z } from "zod";
import type { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { maintenanceReportSummary } from "../services/maintenanceService";

const tid = (req: Request) => req.user!.tenantId;

const rangeSchema = z.object({
  desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const getMaintenanceReports = asyncHandler(async (req: Request, res: Response) => {
  const parsed = rangeSchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { desde, hasta } = parsed.data;
  if (desde > hasta) {
    res.status(400).json({ error: "desde debe ser anterior o igual a hasta" });
    return;
  }
  const summary = await maintenanceReportSummary(tid(req), desde, hasta);
  res.json(summary);
});
