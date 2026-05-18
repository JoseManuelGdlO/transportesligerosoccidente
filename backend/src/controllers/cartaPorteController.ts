import { z } from "zod";
import type { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import {
  cartaPorteToJson,
  tripUbicacionToJson,
  tripMercanciaToJson,
} from "../utils/serialize";
import * as cartaPorteService from "../services/cartaPorteService";
import * as tripFiscalService from "../services/tripFiscalService";

const tid = (req: Request) => req.user!.tenantId;

export const getCartaPorte = asyncHandler(async (req: Request, res: Response) => {
  const cp = await cartaPorteService.getCartaPorteForTrip(tid(req), req.params.id);
  res.json(cartaPorteToJson(cp));
});

export const postPreview = asyncHandler(async (req: Request, res: Response) => {
  const result = await cartaPorteService.previewCartaPorte(tid(req), req.params.id);
  res.json({
    valid: result.valid,
    issues: result.issues,
    xml_preview: result.xml,
    carta_porte: cartaPorteToJson(result.cartaPorte),
  });
});

export const postTimbrar = asyncHandler(async (req: Request, res: Response) => {
  const cp = await cartaPorteService.timbrarCartaPorte(tid(req), req.params.id);
  res.json(cartaPorteToJson(cp));
});

const cancelSchema = z.object({ motivo: z.string().min(1) });

export const postCancelar = asyncHandler(async (req: Request, res: Response) => {
  const parsed = cancelSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const cp = await cartaPorteService.cancelarCartaPorte(tid(req), req.params.id, parsed.data.motivo);
  res.json(cartaPorteToJson(cp));
});

const ubicacionSchema = z.object({
  rfc: z.string().optional(),
  nombre: z.string().optional(),
  fecha_hora: z.string().optional(),
  calle: z.string().optional(),
  colonia: z.string().optional(),
  municipio: z.string().optional(),
  localidad: z.string().optional(),
  estado: z.string().optional(),
  cp: z.string().optional(),
  distancia_km: z.number().optional(),
});

export const putUbicacionOrigen = asyncHandler(async (req: Request, res: Response) => {
  const parsed = ubicacionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const row = await tripFiscalService.upsertUbicacion(tid(req), req.params.id, "Origen", parsed.data);
  res.json(tripUbicacionToJson(row));
});

export const putUbicacionDestino = asyncHandler(async (req: Request, res: Response) => {
  const parsed = ubicacionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const row = await tripFiscalService.upsertUbicacion(tid(req), req.params.id, "Destino", parsed.data);
  res.json(tripUbicacionToJson(row));
});

export const listMercancias = asyncHandler(async (req: Request, res: Response) => {
  const rows = await tripFiscalService.listMercancias(tid(req), req.params.id);
  res.json(rows.map(tripMercanciaToJson));
});

const mercanciaSchema = z.object({
  descripcion: z.string().min(1),
  cantidad: z.number().positive(),
  unidad: z.string().optional(),
  peso_kg: z.number().positive(),
  clave_prod_serv: z.string().optional(),
  material_peligroso: z.boolean().optional(),
  embalaje: z.string().optional(),
});

export const postMercancia = asyncHandler(async (req: Request, res: Response) => {
  const parsed = mercanciaSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const row = await tripFiscalService.addMercancia(tid(req), req.params.id, parsed.data);
  res.status(201).json(tripMercanciaToJson(row));
});

export const deleteMercancia = asyncHandler(async (req: Request, res: Response) => {
  await tripFiscalService.removeMercancia(tid(req), req.params.id, req.params.mercanciaId);
  res.status(204).send();
});
