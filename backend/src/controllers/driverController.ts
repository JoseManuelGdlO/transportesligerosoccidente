import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Request, Response } from "express";
import { Op } from "sequelize";
import { Driver } from "../models";
import { asyncHandler } from "../utils/asyncHandler";
import { driverToJson } from "../utils/serialize";

const tid = (req: Request) => req.user!.tenantId;

const bodySchema = z.object({
  nombre: z.string().min(1),
  telefono: z.string().min(1),
  licencia: z.string().min(1),
  fecha_ingreso: z.string().min(1),
  comision_tipo: z.enum(["porcentaje", "fijo"]),
  comision_valor: z.number().optional(),
  comision_valor_local: z.number().optional(),
  comision_valor_foraneo: z.number().optional(),
  estatus: z.enum(["activo", "inactivo"]).optional(),
  rfc: z.string().optional(),
  licencia_federal: z.string().optional(),
  tipo_figura: z.string().optional(),
  curp: z.string().max(18).optional(),
  email: z.string().email().optional().or(z.literal("")),
  numero_empleado: z.string().optional(),
  calle: z.string().optional(),
  numero_exterior: z.string().optional(),
  numero_interior: z.string().optional(),
  colonia: z.string().optional(),
  localidad: z.string().optional(),
  municipio: z.string().optional(),
  estado: z.string().optional(),
  cp: z.string().optional(),
  pais: z.string().optional(),
  truck_id: z.string().uuid().optional().nullable(),
  puesto: z.string().optional(),
});

export const listDrivers = asyncHandler(async (req: Request, res: Response) => {
  const rows = await Driver.findAll({
    where: {
      tenant_id: tid(req),
      estatus: { [Op.ne]: "inactivo" },
    },
    order: [["nombre", "ASC"]],
  });
  res.json(rows.map(driverToJson));
});

export const getDriver = asyncHandler(async (req: Request, res: Response) => {
  const d = await Driver.findOne({ where: { id: req.params.id, tenant_id: tid(req) } });
  if (!d) {
    res.status(404).json({ error: "No encontrado" });
    return;
  }
  res.json(driverToJson(d));
});

export const createDriver = asyncHandler(async (req: Request, res: Response) => {
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const b = parsed.data;
  const local = b.comision_valor_local ?? b.comision_valor ?? 0;
  const foraneo = b.comision_valor_foraneo ?? b.comision_valor ?? local;
  const d = await Driver.create({
    id: randomUUID(),
    tenant_id: tid(req),
    nombre: b.nombre,
    telefono: b.telefono,
    licencia: b.licencia,
    fecha_ingreso: b.fecha_ingreso,
    comision_tipo: b.comision_tipo,
    comision_valor: local,
    comision_valor_local: local,
    comision_valor_foraneo: foraneo,
    estatus: b.estatus ?? "activo",
    rfc: b.rfc,
    licencia_federal: b.licencia_federal,
    tipo_figura: b.tipo_figura ?? "01",
    curp: b.curp,
    email: b.email || null,
    numero_empleado: b.numero_empleado,
    calle: b.calle,
    numero_exterior: b.numero_exterior,
    numero_interior: b.numero_interior,
    colonia: b.colonia,
    localidad: b.localidad,
    municipio: b.municipio,
    estado: b.estado,
    cp: b.cp,
    pais: b.pais,
    truck_id: b.truck_id ?? null,
    puesto: b.puesto,
  } as never);
  res.status(201).json(driverToJson(d));
});

export const updateDriver = asyncHandler(async (req: Request, res: Response) => {
  const d = await Driver.findOne({ where: { id: req.params.id, tenant_id: tid(req) } });
  if (!d) {
    res.status(404).json({ error: "No encontrado" });
    return;
  }
  const parsed = bodySchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const b = parsed.data;
  const patch: Record<string, unknown> = { ...b };
  if (b.comision_valor_local != null || b.comision_valor != null) {
    const local = b.comision_valor_local ?? b.comision_valor;
    if (local != null) {
      patch.comision_valor_local = local;
      patch.comision_valor = local;
    }
  }
  if (b.comision_valor_foraneo != null) patch.comision_valor_foraneo = b.comision_valor_foraneo;
  delete patch.comision_valor;
  await d.update(patch as never);
  res.json(driverToJson(d));
});

/** Baja lógica: marca `estatus` inactivo (no borra fila ni historial asociado). */
export const deleteDriver = asyncHandler(async (req: Request, res: Response) => {
  const d = await Driver.findOne({ where: { id: req.params.id, tenant_id: tid(req) } });
  if (!d) {
    res.status(404).json({ error: "No encontrado" });
    return;
  }
  if (d.estatus === "inactivo") {
    res.status(409).json({ error: "El operador ya está dado de baja" });
    return;
  }
  await d.update({ estatus: "inactivo" });
  res.json(driverToJson(d));
});
