import { z } from "zod";
import type { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { fuelTicketToJson } from "../utils/serialize";
import * as fuelTicketService from "../services/fuelTicketService";
import * as fuelImportService from "../services/fuelImportService";

const tid = (req: Request) => req.user!.tenantId;

const bodySchema = z.object({
  truck_id: z.string().min(1),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  hora: z.string().optional().nullable(),
  folio: z.string().optional().nullable(),
  tag: z.string().optional().nullable(),
  numero_economico_raw: z.string().optional().nullable(),
  placas_raw: z.string().optional().nullable(),
  odometro: z.number().int().nonnegative(),
  litros: z.number().positive(),
  precio_litro: z.number().positive(),
  importe_total: z.number().positive().optional(),
  ubicacion: z.string().min(1).optional(),
  external_id: z.string().optional().nullable(),
});

function jsonTicket(row: Awaited<ReturnType<typeof fuelTicketService.getFuelTicketOrThrow>>) {
  const truck = row.Truck;
  return fuelTicketToJson(
    row,
    truck ? { numero_economico: truck.numero_economico, placas: truck.placas } : undefined,
  );
}

export const listFuelTickets = asyncHandler(async (req: Request, res: Response) => {
  const truck_id = typeof req.query.truck_id === "string" ? req.query.truck_id : undefined;
  const inicio = typeof req.query.inicio === "string" ? req.query.inicio : undefined;
  const fin = typeof req.query.fin === "string" ? req.query.fin : undefined;
  const rows = await fuelTicketService.listFuelTickets(tid(req), { truck_id, inicio, fin });
  res.json(
    rows.map((r) => {
      const truck = r.Truck;
      return fuelTicketToJson(
        r,
        truck ? { numero_economico: truck.numero_economico, placas: truck.placas } : undefined,
      );
    }),
  );
});

export const createFuelTicket = asyncHandler(async (req: Request, res: Response) => {
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const row = await fuelTicketService.createFuelTicket(tid(req), parsed.data);
  const full = await fuelTicketService.getFuelTicketOrThrow(tid(req), String(row.id));
  res.status(201).json(jsonTicket(full));
});

export const patchFuelTicket = asyncHandler(async (req: Request, res: Response) => {
  const parsed = bodySchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const row = await fuelTicketService.updateFuelTicket(tid(req), req.params.id, parsed.data);
  res.json(jsonTicket(row));
});

export const deleteFuelTicket = asyncHandler(async (req: Request, res: Response) => {
  await fuelTicketService.deleteFuelTicket(tid(req), req.params.id);
  res.status(204).send();
});

export const importFuelTickets = asyncHandler(async (req: Request, res: Response) => {
  const file = req.file;
  if (!file?.buffer) {
    res.status(400).json({ error: "Archivo requerido (campo file)" });
    return;
  }
  const result = await fuelImportService.importFuelTicketsFromBuffer(tid(req), file.buffer);
  res.json(result);
});
