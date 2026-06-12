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

const timbradoOptsSchema = z.object({
  tipo: z.enum(["ingreso", "traslado"]).optional(),
  moneda: z.string().optional(),
  tipo_cambio: z.number().positive().optional(),
  uso_cfdi: z.string().optional(),
  metodo_pago: z.string().optional(),
  forma_pago: z.string().optional(),
  condiciones_pago: z.string().optional(),
  iva_tasa: z.number().min(0).max(1).optional(),
  retencion_tasa: z.number().min(0).max(1).optional(),
  exento: z.boolean().optional(),
});

function timbradoOptsFromBody(body: z.infer<typeof timbradoOptsSchema>) {
  return {
    moneda: body.moneda,
    tipoCambio: body.tipo_cambio,
    usoCfdi: body.uso_cfdi,
    metodoPago: body.metodo_pago,
    formaPago: body.forma_pago,
    condicionesPago: body.condiciones_pago,
    ivaTasa: body.iva_tasa,
    retencionTasa: body.retencion_tasa,
    exento: body.exento,
  };
}

export const postPreview = asyncHandler(async (req: Request, res: Response) => {
  const parsed = timbradoOptsSchema.safeParse(req.body ?? {});
  const body = parsed.success ? parsed.data : {};
  const tipo = body.tipo ?? "traslado";
  const result = await cartaPorteService.previewCartaPorte(
    tid(req),
    req.params.id,
    tipo,
    timbradoOptsFromBody(body),
  );
  res.json({
    valid: result.valid,
    issues: result.issues,
    xml_preview: result.xml,
    payload_preview: result.payload_preview,
    carta_porte: cartaPorteToJson(result.cartaPorte),
  });
});

export const postTimbrar = asyncHandler(async (req: Request, res: Response) => {
  const parsed = timbradoOptsSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const tipo = parsed.data.tipo ?? "traslado";
  const cp = await cartaPorteService.timbrarCartaPorte(
    tid(req),
    req.params.id,
    tipo,
    timbradoOptsFromBody(parsed.data),
  );
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
  colonia_clave: z.string().optional(),
  municipio: z.string().optional(),
  municipio_clave: z.string().optional(),
  localidad: z.string().optional(),
  localidad_clave: z.string().optional(),
  estado: z.string().optional(),
  cp: z.string().optional(),
  numero_exterior: z.string().optional(),
  numero_interior: z.string().optional(),
  pais: z.string().optional(),
  distancia_km: z.number().optional(),
  client_ubicacion_id: z.string().uuid().optional().nullable(),
});

export const putUbicacionOrigen = asyncHandler(async (req: Request, res: Response) => {
  const parsed = ubicacionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const row = await tripFiscalService.upsertUbicacionByTipo(tid(req), req.params.id, "Origen", parsed.data);
  res.json(tripUbicacionToJson(row));
});

export const putUbicacionDestino = asyncHandler(async (req: Request, res: Response) => {
  const parsed = ubicacionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const row = await tripFiscalService.upsertUbicacionByTipo(tid(req), req.params.id, "Destino", parsed.data);
  res.json(tripUbicacionToJson(row));
});

const ubicacionesArraySchema = z.object({
  ubicaciones: z
    .array(
      ubicacionSchema.extend({
        orden: z.number().int().positive(),
      }),
    )
    .min(2),
});

export const putUbicaciones = asyncHandler(async (req: Request, res: Response) => {
  const parsed = ubicacionesArraySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const rows = await tripFiscalService.replaceUbicaciones(
    tid(req),
    req.params.id,
    parsed.data.ubicaciones,
  );
  res.json(rows.map((row) => tripUbicacionToJson(row)));
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
  cantidad_transportada: z.number().positive().optional(),
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
