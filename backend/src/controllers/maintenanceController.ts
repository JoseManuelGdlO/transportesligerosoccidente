import { z } from "zod";
import type { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import * as maintenanceService from "../services/maintenanceService";
import { num } from "../utils/numbers";

const tid = (req: Request) => req.user!.tenantId;

const scheduleSchema = z.object({
  truck_id: z.string().min(1),
  tipo: z.enum(["menor", "intermedio", "correctivo"]),
  intervalo_km: z.number().int().positive().nullable().optional(),
  ultimo_km: z.number().int().min(0).optional(),
  ultima_fecha: z.string().nullable().optional(),
});

const recordSchema = z.object({
  truck_id: z.string().min(1),
  tipo: z.enum(["menor", "intermedio", "correctivo"]),
  km_odometro: z.number().int().min(0),
  fecha: z.string().min(1),
  costo: z.number().min(0),
  descripcion: z.string().min(1),
  taller: z.string().optional(),
});

export const getOverview = asyncHandler(async (req: Request, res: Response) => {
  const data = await maintenanceService.maintenanceOverview(tid(req));
  res.json(data);
});

export const listSchedules = asyncHandler(async (req: Request, res: Response) => {
  const truckId = typeof req.query.truck_id === "string" ? req.query.truck_id : undefined;
  const rows = await maintenanceService.listSchedules(tid(req), truckId);
  res.json(
    rows.map((s) => ({
      id: s.id,
      truck_id: s.truck_id,
      tipo: s.tipo,
      intervalo_km: s.intervalo_km,
      ultimo_km: s.ultimo_km,
      ultima_fecha: s.ultima_fecha,
      activo: s.activo,
    })),
  );
});

export const upsertSchedule = asyncHandler(async (req: Request, res: Response) => {
  const parsed = scheduleSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const row = await maintenanceService.upsertSchedule(tid(req), parsed.data);
  res.json({
    id: row.id,
    truck_id: row.truck_id,
    tipo: row.tipo,
    intervalo_km: row.intervalo_km,
    ultimo_km: row.ultimo_km,
    ultima_fecha: row.ultima_fecha,
  });
});

const scheduleTipoSchema = z.enum(["menor", "intermedio", "correctivo"]);

export const deleteSchedule = asyncHandler(async (req: Request, res: Response) => {
  const truckId = typeof req.query.truck_id === "string" ? req.query.truck_id : "";
  const tipoParsed = scheduleTipoSchema.safeParse(req.query.tipo);
  if (!truckId || !tipoParsed.success) {
    res.status(400).json({ error: "truck_id y tipo son requeridos" });
    return;
  }
  await maintenanceService.deleteSchedule(tid(req), truckId, tipoParsed.data);
  res.status(204).send();
});

export const listRecords = asyncHandler(async (req: Request, res: Response) => {
  const truckId = typeof req.query.truck_id === "string" ? req.query.truck_id : undefined;
  const rows = await maintenanceService.listRecords(tid(req), truckId);
  res.json(
    rows.map((r) => ({
      id: r.id,
      truck_id: r.truck_id,
      tipo: r.tipo,
      km_odometro: r.km_odometro,
      fecha: r.fecha,
      costo: num(r.costo),
      descripcion: r.descripcion,
      taller: r.taller ?? undefined,
    })),
  );
});

export const createRecord = asyncHandler(async (req: Request, res: Response) => {
  const parsed = recordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const row = await maintenanceService.createRecord(tid(req), parsed.data);
  await maintenanceService.checkMaintenanceAlerts(tid(req));
  res.status(201).json({
    id: row.id,
    truck_id: row.truck_id,
    tipo: row.tipo,
    km_odometro: row.km_odometro,
    fecha: row.fecha,
    costo: num(row.costo),
    descripcion: row.descripcion,
    taller: row.taller ?? undefined,
  });
});
