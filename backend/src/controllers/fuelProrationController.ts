import { z } from "zod";
import type { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { saveAssignments } from "../services/fuelProrationAssignmentService";
import { prorateRange } from "../services/fuelProrationService";

const tid = (req: Request) => req.user!.tenantId;

const putSchema = z.object({
  truck_id: z.string().min(1),
  inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  fin: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  assignments: z.array(
    z.object({
      trip_id: z.string().min(1),
      fuel_ticket_id: z.string().min(1).nullable(),
    }),
  ),
});

export const putFuelProrationAssignments = asyncHandler(async (req: Request, res: Response) => {
  const parsed = putSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { truck_id, inicio, fin, assignments } = parsed.data;
  if (inicio > fin) {
    res.status(400).json({ error: "inicio debe ser anterior o igual a fin" });
    return;
  }

  try {
    await saveAssignments(tid(req), truck_id, assignments);
    const unit = await prorateRange(tid(req), truck_id, inicio, fin);
    res.json(unit);
  } catch (e) {
    const err = e as Error & { status?: number };
    res.status(err.status ?? 500).json({ error: err.message });
  }
});
