import { z } from "zod";
import type { Request, Response } from "express";
import { Tenant } from "../models";
import { asyncHandler } from "../utils/asyncHandler";
import { encryptSecret } from "../utils/fiscalCrypto";
import { runFuelSyncForTenant } from "../services/fuelSyncService";

const tid = (req: Request) => req.user!.tenantId;

const fuelConfigSchema = z.object({
  fuel_proveedor_url: z.string().url().optional().or(z.literal("")),
  fuel_proveedor_usuario: z.string().optional(),
  fuel_proveedor_password: z.string().optional(),
  fuel_sync_habilitado: z.boolean().optional(),
});

export function tenantFuelConfigToJson(t: Tenant): Record<string, unknown> {
  return {
    fuel_proveedor_url: t.fuel_proveedor_url ?? undefined,
    fuel_proveedor_usuario: t.fuel_proveedor_usuario ?? undefined,
    fuel_sync_habilitado: Boolean(t.fuel_sync_habilitado),
    tiene_password: Boolean(t.fuel_proveedor_password_enc),
  };
}

export const getFuelConfig = asyncHandler(async (req: Request, res: Response) => {
  const t = await Tenant.findByPk(tid(req));
  if (!t) {
    res.status(404).json({ error: "Empresa no encontrada" });
    return;
  }
  res.json(tenantFuelConfigToJson(t));
});

export const patchFuelConfig = asyncHandler(async (req: Request, res: Response) => {
  const parsed = fuelConfigSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const t = await Tenant.findByPk(tid(req));
  if (!t) {
    res.status(404).json({ error: "Empresa no encontrada" });
    return;
  }
  const b = parsed.data;
  const data: Record<string, unknown> = {};
  if (b.fuel_proveedor_url !== undefined) {
    data.fuel_proveedor_url = b.fuel_proveedor_url === "" ? null : b.fuel_proveedor_url;
  }
  if (b.fuel_proveedor_usuario !== undefined) data.fuel_proveedor_usuario = b.fuel_proveedor_usuario || null;
  if (b.fuel_proveedor_password !== undefined) {
    data.fuel_proveedor_password_enc = b.fuel_proveedor_password
      ? encryptSecret(b.fuel_proveedor_password)
      : null;
  }
  if (b.fuel_sync_habilitado !== undefined) data.fuel_sync_habilitado = b.fuel_sync_habilitado;
  await t.update(data as never);
  res.json(tenantFuelConfigToJson(t));
});

export const postFuelSyncNow = asyncHandler(async (req: Request, res: Response) => {
  const t = await Tenant.findByPk(tid(req));
  if (!t) {
    res.status(404).json({ error: "Empresa no encontrada" });
    return;
  }
  const inicio = typeof req.body?.inicio === "string" ? req.body.inicio : undefined;
  const fin = typeof req.body?.fin === "string" ? req.body.fin : undefined;
  const range = inicio && fin ? { inicio, fin } : undefined;
  const result = await runFuelSyncForTenant(t, range, { force: true });
  const code = result.status === "error" ? 502 : 200;
  res.status(code).json(result);
});
