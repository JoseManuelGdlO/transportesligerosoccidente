import path from "node:path";
import { z } from "zod";
import type { Request, Response } from "express";
import { Trip } from "../models";
import { asyncHandler } from "../utils/asyncHandler";
import { tripToJson, fuelToJson, expenseToJson } from "../utils/serialize";
import * as tripService from "../services/tripService";
import * as maintenanceService from "../services/maintenanceService";
import { applyModalidadPersistencia, MODALIDADES_COBRO } from "../types/modalidadCobro";

const tid = (req: Request) => req.user!.tenantId;

export const listTrips = asyncHandler(async (req: Request, res: Response) => {
  const rows = await Trip.findAll({
    where: { tenant_id: tid(req) },
    order: [["fecha_salida", "DESC"]],
    include: [
      {
        association: "fuel",
        include: [{ association: "FuelTicket", attributes: ["id", "prorrateo_confirmado_at", "es_foraneo"], required: false }],
      },
      { association: "expenses" },
      { association: "paradas" },
      { association: "statuses", through: { attributes: [] } },
      { association: "cartasPorte" },
      { association: "Route", attributes: ["id", "nombre"], required: false },
      { association: "Driver", attributes: ["id", "nombre"], required: false },
      { association: "Client", attributes: ["id", "razon_social"], required: false },
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
    modalidad_cobro: z.enum(MODALIDADES_COBRO).optional(),
    comision_override: z.number().nullable().optional(),
    notas: z.string().max(5000).optional(),
  })
  .refine((d) => d.route_id || d.paradas || (d.origen && d.destino), {
    message: "Indica route_id, paradas (mín. 2) u origen y destino",
  })
  .superRefine((d, ctx) => {
    const persist = applyModalidadPersistencia({
      modalidad: d.modalidad_cobro ?? "factura",
      tarifa: d.tarifa,
      comision_override: d.comision_override,
      num_factura: d.num_factura,
    });
    if (persist.error) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: persist.error });
    }
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
    modalidad_cobro: z.enum(MODALIDADES_COBRO).optional(),
    km_final: z.number().int().optional(),
    fecha_llegada: z.string().optional(),
    notas: z.string().max(5000).nullable().optional(),
  })
  .strict();

export const patchTrip = asyncHandler(async (req: Request, res: Response) => {
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const t = await tripService.patchTrip(tid(req), req.params.id, parsed.data, {
    isAdmin: req.user!.roleSlug === "admin",
  });
  res.json(tripToJson(t));
});

const closeSchema = z.object({
  km_final: z.number().int(),
  fecha_llegada: z.string(),
  num_factura: z.string().optional(),
  notas: z.string().max(5000).optional(),
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

const FORMAS_PAGO_GASTO = [
  "01",
  "02",
  "03",
  "04",
  "05",
  "06",
  "08",
  "12",
  "13",
  "14",
  "15",
  "17",
  "23",
  "24",
  "25",
  "26",
  "27",
  "28",
  "29",
  "30",
  "31",
] as const;

const expenseSchema = z
  .object({
    categoria: z.enum(["casetas", "refacciones", "hospedaje", "comidas", "otros"]),
    tipo: z.enum(["gasto", "ingreso"]).optional().default("gasto"),
    descripcion: z
      .string()
      .trim()
      .min(1, "Falta la descripción. Escribe de qué se trata para poder identificarlo."),
    monto: z.number().positive(),
    monto_comprobado: z.number().min(0),
    visible_en_liquidacion: z.boolean().optional().default(false),
    fecha: z.string().optional(),
    supplier_id: z.string().uuid().optional().nullable(),
    pagado: z.boolean().optional().default(false),
    forma_pago: z.enum(FORMAS_PAGO_GASTO).optional().nullable(),
  })
  .refine((d) => d.monto_comprobado <= d.monto, {
    message: "monto_comprobado no puede ser mayor que monto",
    path: ["monto_comprobado"],
  })
  .refine((d) => d.tipo !== "gasto" || !d.pagado || Boolean(d.forma_pago), {
    message: "Indica el método de pago cuando el gasto ya está pagado",
    path: ["forma_pago"],
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

const cfdiConceptoSchema = z.object({
  clave_prod_serv: z.string().min(1),
  cantidad: z.number().positive(),
  clave_unidad: z.string().min(1),
  unidad: z.string().min(1),
  descripcion: z.string().min(1),
  valor_unitario: z.number().min(0),
  objeto_imp: z.enum(["01", "02"]).optional(),
});

const putCfdiConceptosSchema = z.object({
  conceptos: z.array(cfdiConceptoSchema).min(1),
});

export const putCfdiConceptos = asyncHandler(async (req: Request, res: Response) => {
  const parsed = putCfdiConceptosSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const t = await tripService.putCfdiConceptos(tid(req), req.params.id, parsed.data.conceptos);
  res.json(tripToJson(t));
});
