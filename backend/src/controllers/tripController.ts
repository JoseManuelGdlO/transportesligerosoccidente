import { z } from "zod";
import type { Request, Response } from "express";
import { Trip } from "../models";
import { asyncHandler } from "../utils/asyncHandler";
import { tripToJson, fuelToJson, expenseToJson } from "../utils/serialize";
import * as tripService from "../services/tripService";

export const listTrips = asyncHandler(async (_req: Request, res: Response) => {
  const rows = await Trip.findAll({
    order: [["fecha_salida", "DESC"]],
    include: [
      { association: "fuel" },
      { association: "expenses" },
    ],
  });
  res.json(rows.map((t) => tripToJson(t)));
});

export const getTrip = asyncHandler(async (req: Request, res: Response) => {
  const t = await tripService.getTripOrThrow(req.params.id, true);
  res.json(tripToJson(t));
});

const createSchema = z.object({
  truck_id: z.string().min(1),
  driver_id: z.string().min(1),
  client_id: z.string().min(1),
  origen: z.string().min(1),
  destino: z.string().min(1),
  fecha_salida: z.string(),
  km_inicial: z.number().int(),
  tarifa: z.number(),
  viaticos_entregados: z.number().optional(),
});

export const createTrip = asyncHandler(async (req: Request, res: Response) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const t = await tripService.createTrip(parsed.data);
  res.status(201).json(tripToJson(t));
});

export const patchTrip = asyncHandler(async (req: Request, res: Response) => {
  const t = await tripService.patchTrip(req.params.id, req.body);
  res.json(tripToJson(t));
});

const closeSchema = z.object({
  km_final: z.number().int(),
  fecha_llegada: z.string(),
  num_factura: z.string().min(1),
});

export const postCloseTrip = asyncHandler(async (req: Request, res: Response) => {
  const parsed = closeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const t = await tripService.closeTrip(req.params.id, parsed.data);
  res.json(tripToJson(t));
});

export const deleteTrip = asyncHandler(async (req: Request, res: Response) => {
  await tripService.deleteTrip(req.params.id);
  res.status(204).send();
});

const fuelSchema = z.object({
  litros: z.number().positive(),
  precio_litro: z.number().positive(),
  ubicacion: z.string().min(1),
  fecha: z.string().optional(),
});

export const postFuel = asyncHandler(async (req: Request, res: Response) => {
  const parsed = fuelSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const f = await tripService.addFuel(req.params.id, parsed.data);
  res.status(201).json(fuelToJson(f));
});

export const deleteFuel = asyncHandler(async (req: Request, res: Response) => {
  await tripService.removeFuel(req.params.id, req.params.fuelId);
  res.status(204).send();
});

const expenseSchema = z.object({
  categoria: z.enum(["casetas", "refacciones", "hospedaje", "comidas", "otros"]),
  descripcion: z.string().min(1),
  monto: z.number().positive(),
  comprobado: z.boolean(),
  fecha: z.string().optional(),
});

export const postExpense = asyncHandler(async (req: Request, res: Response) => {
  const parsed = expenseSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const e = await tripService.addExpense(req.params.id, parsed.data);
  res.status(201).json(expenseToJson(e));
});

export const deleteExpense = asyncHandler(async (req: Request, res: Response) => {
  await tripService.removeExpense(req.params.id, req.params.expenseId);
  res.status(204).send();
});
