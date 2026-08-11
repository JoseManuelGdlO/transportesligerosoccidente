import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import * as maintenanceService from "../services/maintenanceService";
import { num } from "../utils/numbers";
import type { MaintenanceRecord } from "../models/MaintenanceRecord";

const tid = (req: Request) => req.user!.tenantId;

const maintenanceTipoSchema = z.enum(["preventivo", "menor", "intermedio", "mayor", "correctivo"]);

const scheduleSchema = z.object({
  truck_id: z.string().min(1),
  tipo: maintenanceTipoSchema,
  intervalo_km: z.number().int().positive().nullable().optional(),
  intervalo_dias: z.number().int().positive().nullable().optional(),
  ultimo_km: z.number().int().min(0).optional(),
  ultima_fecha: z.string().nullable().optional(),
});

const recordSchema = z.object({
  truck_id: z.string().min(1),
  tipo: maintenanceTipoSchema,
  km_odometro: z.number().int().min(0),
  fecha: z.string().min(1),
  costo: z.number().min(0),
  descripcion: z.string().min(1),
  taller: z.string().optional(),
  supplier_id: z.string().uuid().optional().nullable(),
  category_id: z.string().uuid().optional().nullable(),
});

function recordToJson(r: MaintenanceRecord) {
  const hasFactura = Boolean(r.factura_path);
  return {
    id: r.id,
    truck_id: r.truck_id,
    tipo: r.tipo,
    km_odometro: r.km_odometro,
    fecha: r.fecha,
    costo: num(r.costo),
    descripcion: r.descripcion,
    taller: r.taller ?? undefined,
    supplier_id: r.supplier_id ?? undefined,
    category_id: r.category_id ?? undefined,
    factura_url: hasFactura ? `/maintenance/records/${r.id}/factura` : undefined,
    factura_nombre: r.factura_nombre ?? undefined,
    factura_mime: r.factura_mime ?? undefined,
  };
}

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
      intervalo_dias: s.intervalo_dias,
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
  await maintenanceService.checkMaintenanceAlerts(tid(req));
  res.json({
    id: row.id,
    truck_id: row.truck_id,
    tipo: row.tipo,
    intervalo_km: row.intervalo_km,
    intervalo_dias: row.intervalo_dias,
    ultimo_km: row.ultimo_km,
    ultima_fecha: row.ultima_fecha,
  });
});

export const deleteSchedule = asyncHandler(async (req: Request, res: Response) => {
  const truckId = typeof req.query.truck_id === "string" ? req.query.truck_id : "";
  const tipoParsed = maintenanceTipoSchema.safeParse(req.query.tipo);
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
  res.json(rows.map(recordToJson));
});

export const createRecord = asyncHandler(async (req: Request, res: Response) => {
  const parsed = recordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const row = await maintenanceService.createRecord(tid(req), parsed.data);
  await maintenanceService.checkMaintenanceAlerts(tid(req));
  res.status(201).json(recordToJson(row));
});

export const uploadFactura = asyncHandler(async (req: Request, res: Response) => {
  const file = req.file;
  if (!file) {
    res.status(400).json({ error: "Archivo requerido" });
    return;
  }
  const row = await maintenanceService.setRecordFactura(tid(req), req.params.id, file);
  res.status(201).json(recordToJson(row));
});

export const streamFactura = asyncHandler(async (req: Request, res: Response) => {
  const row = await maintenanceService.getRecordOrThrow(tid(req), req.params.id);
  const abs = maintenanceService.resolveFacturaAbsolutePath(row);
  if (!abs || !fs.existsSync(abs)) {
    res.status(404).json({ error: "Factura no encontrada" });
    return;
  }
  res.setHeader("Content-Type", row.factura_mime || "application/octet-stream");
  const disp = (req.query.disposition as string) === "attachment" ? "attachment" : "inline";
  const filename = row.factura_nombre || path.basename(abs);
  res.setHeader("Content-Disposition", `${disp}; filename="${encodeURIComponent(filename)}"`);
  res.sendFile(abs);
});

export const deleteFactura = asyncHandler(async (req: Request, res: Response) => {
  const row = await maintenanceService.clearRecordFactura(tid(req), req.params.id);
  res.json(recordToJson(row));
});
