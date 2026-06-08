import { z } from "zod";
import type { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { FuelTicket } from "../models";
import { saveAssignments, saveTicketAssignments } from "../services/fuelProrationAssignmentService";
import {
  autoProratePending,
  confirmTicketProration,
  prorateRange,
} from "../services/fuelProrationService";

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

const autoSchema = z.object({
  inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  fin: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const ticketAssignSchema = z.object({
  trip_ids: z.array(z.string().min(1)),
  inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  fin: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
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
    await saveAssignments(tid(req), truck_id, inicio, fin, assignments);
    const unit = await prorateRange(tid(req), truck_id, inicio, fin, "pendiente");
    res.json(unit);
  } catch (e) {
    const err = e as Error & { status?: number };
    res.status(err.status ?? 500).json({ error: err.message });
  }
});

export const postAutoProrate = asyncHandler(async (req: Request, res: Response) => {
  const parsed = autoSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { inicio, fin } = parsed.data;
  if (inicio > fin) {
    res.status(400).json({ error: "inicio debe ser anterior o igual a fin" });
    return;
  }

  try {
    const report = await autoProratePending(tid(req), inicio, fin);
    res.json(report);
  } catch (e) {
    const err = e as Error & { status?: number };
    res.status(err.status ?? 500).json({ error: err.message });
  }
});

export const putTicketProrationAssignments = asyncHandler(async (req: Request, res: Response) => {
  const parsed = ticketAssignSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const ticketId = String(req.params.id);
  const { trip_ids, inicio, fin } = parsed.data;
  if (inicio > fin) {
    res.status(400).json({ error: "inicio debe ser anterior o igual a fin" });
    return;
  }

  try {
    await saveTicketAssignments(tid(req), ticketId, trip_ids);
    const ticket = await FuelTicket.findOne({
      where: { id: ticketId, tenant_id: tid(req) },
    });
    if (!ticket) {
      res.status(404).json({ error: "Ticket no encontrado" });
      return;
    }
    const unit = await prorateRange(tid(req), String(ticket.truck_id), inicio, fin, "pendiente");
    res.json(unit);
  } catch (e) {
    const err = e as Error & { status?: number };
    res.status(err.status ?? 500).json({ error: err.message });
  }
});

export const postConfirmTicketProration = asyncHandler(async (req: Request, res: Response) => {
  const ticketId = String(req.params.id);
  try {
    await confirmTicketProration(tid(req), ticketId);
    res.json({ ok: true });
  } catch (e) {
    const err = e as Error & { status?: number };
    res.status(err.status ?? 500).json({ error: err.message });
  }
});
