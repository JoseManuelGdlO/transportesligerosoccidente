import path from "node:path";
import { z } from "zod";
import type { Request, Response } from "express";
import { Trip } from "../models";
import { asyncHandler } from "../utils/asyncHandler";
import { tripToJson, fuelToJson, expenseToJson } from "../utils/serialize";
import * as tripService from "../services/tripService";
import * as maintenanceService from "../services/maintenanceService";

const tid = (req: Request) => req.user!.tenantId;

export const listTrips = asyncHandler(async (req: Request, res: Response) => {
  const rows = await Trip.findAll({
    where: { tenant_id: tid(req) },
    order: [["fecha_salida", "DESC"]],
    include: [
      { association: "fuel" },
      { association: "expenses" },
      { association: "paradas" },
      { association: "statuses", through: { attributes: [] } },
      { association: "cartaPorte" },
    ],
  });
  res.json(rows.map((t) => tripToJson(t)));
});

export const getTrip = asyncHandler(async (req: Request, res: Response) => {
  const t = await tripService.getTripOrThrow(tid(req), req.params.id, true, undefined, true);
  res.json(tripToJson(t));
});

const paradaSchema = z.union([
  z.string().min(1),
  z.object({
    etiqueta: z.string().min(1),
    client_ubicacion_id: z.string().uuid().optional().nullable(),
  }),
]);

const createSchema = z
  .object({
    truck_id: z.string().min(1),
    driver_id: z.string().min(1),
    client_id: z.string().min(1),
    origen: z.string().min(1).optional(),
    destino: z.string().min(1).optional(),
    paradas: z.array(paradaSchema).min(2).optional(),
    route_id: z.string().uuid().optional(),
    fecha_salida: z.string(),
    km_inicial: z.number().int(),
    tarifa: z.number(),
    viaticos_entregados: z.number().optional(),
    num_factura: z.string().optional(),
    tipo_viaje: z.enum(["local", "foraneo"]).optional(),
  })
  .refine((d) => d.route_id || d.paradas || (d.origen && d.destino), {
    message: "Indica route_id, paradas (mín. 2) u origen y destino",
  });

export const createTrip = asyncHandler(async (req: Request, res: Response) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const t = await tripService.createTrip(tid(req), parsed.data as Parameters<typeof tripService.createTrip>[1]);
  res.status(201).json(tripToJson(t));
});

const patchSchema = z
  .object({
    truck_id: z.string().min(1).optional(),
    driver_id: z.string().min(1).optional(),
    client_id: z.string().min(1).optional(),
    origen: z.string().min(1).optional(),
    destino: z.string().min(1).optional(),
    paradas: z.array(paradaSchema).min(2).optional(),
    route_id: z.string().uuid().nullable().optional(),
    fecha_salida: z.string().optional(),
    km_inicial: z.number().int().optional(),
    tarifa: z.number().optional(),
    viaticos_entregados: z.number().optional(),
    comision_override: z.number().nullable().optional(),
    num_factura: z.string().optional(),
    tipo_viaje: z.enum(["local", "foraneo"]).optional(),
    km_final: z.number().int().optional(),
    fecha_llegada: z.string().optional(),
  })
  .strict();

export const patchTrip = asyncHandler(async (req: Request, res: Response) => {
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const t = await tripService.patchTrip(tid(req), req.params.id, parsed.data);
  res.json(tripToJson(t));
});

const closeSchema = z.object({
  km_final: z.number().int(),
  fecha_llegada: z.string(),
  num_factura: z.string().optional(),
});

export const postCloseTrip = asyncHandler(async (req: Request, res: Response) => {
  const parsed = closeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const t = await tripService.closeTrip(tid(req), req.params.id, parsed.data);
  void maintenanceService.checkMaintenanceAlerts(tid(req)).catch(() => undefined);
  res.json(tripToJson(t));
});

export const postFuelReceipt = asyncHandler(async (req: Request, res: Response) => {
  await tripService.getTripOrThrow(tid(req), req.params.id, false);
  const file = req.file;
  if (!file) {
    res.status(400).json({ error: "Archivo requerido" });
    return;
  }
  const rel = path.relative(process.cwd(), file.path).replace(/\\/g, "/");
  res.status(201).json({ comprobante_url: `/${rel}` });
});

export const deleteTrip = asyncHandler(async (req: Request, res: Response) => {
  await tripService.deleteTrip(tid(req), req.params.id);
  res.status(204).send();
});

const fuelSchema = z.object({
  litros: z.number().positive(),
  precio_litro: z.number().positive(),
  ubicacion: z.string().min(1),
  fecha: z.string().optional(),
  es_foraneo: z.boolean().optional(),
  estacion_nombre: z.string().optional(),
  es_estacion_empresa: z.boolean().optional(),
  comprobante_url: z.string().optional(),
});

export const postFuel = asyncHandler(async (req: Request, res: Response) => {
  const parsed = fuelSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const f = await tripService.addFuel(tid(req), req.params.id, parsed.data);
  res.status(201).json(fuelToJson(f));
});

export const deleteFuel = asyncHandler(async (req: Request, res: Response) => {
  await tripService.removeFuel(tid(req), req.params.id, req.params.fuelId);
  res.status(204).send();
});

const expenseSchema = z
  .object({
    categoria: z.enum(["casetas", "refacciones", "hospedaje", "comidas", "otros"]),
    tipo: z.enum(["gasto", "ingreso"]).optional().default("gasto"),
    descripcion: z.string().min(1),
    monto: z.number().positive(),
    monto_comprobado: z.number().min(0),
    visible_en_liquidacion: z.boolean().optional().default(false),
    fecha: z.string().optional(),
  })
  .refine((d) => d.monto_comprobado <= d.monto, {
    message: "monto_comprobado no puede ser mayor que monto",
    path: ["monto_comprobado"],
  });

export const postExpense = asyncHandler(async (req: Request, res: Response) => {
  const parsed = expenseSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const e = await tripService.addExpense(tid(req), req.params.id, parsed.data);
  res.status(201).json(expenseToJson(e));
});

export const deleteExpense = asyncHandler(async (req: Request, res: Response) => {
  await tripService.removeExpense(tid(req), req.params.id, req.params.expenseId);
  res.status(204).send();
});
