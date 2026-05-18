import { z } from "zod";
import type { Request, Response } from "express";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { Tenant } from "../models";
import { asyncHandler } from "../utils/asyncHandler";
import { tenantFiscalToJson } from "../utils/serialize";
import { encryptSecret } from "../utils/fiscalCrypto";

const tid = (req: Request) => req.user!.tenantId;

const fiscalSchema = z.object({
  rfc: z.string().min(12).max(13).optional(),
  razon_social: z.string().min(1).optional(),
  regimen_fiscal: z.string().min(3).optional(),
  cp_fiscal: z.string().length(5).optional(),
  calle_fiscal: z.string().optional(),
  colonia_fiscal: z.string().optional(),
  municipio_fiscal: z.string().optional(),
  estado_fiscal: z.string().optional(),
  pac_proveedor: z.string().optional(),
  pac_url: z.string().url().optional().or(z.literal("")),
  pac_usuario: z.string().optional(),
  pac_token: z.string().optional(),
  cfdi_serie: z.string().optional(),
  csd_password: z.string().optional(),
});

export const getFiscalConfig = asyncHandler(async (req: Request, res: Response) => {
  const t = await Tenant.findByPk(tid(req));
  if (!t) {
    res.status(404).json({ error: "Empresa no encontrada" });
    return;
  }
  res.json(tenantFiscalToJson(t));
});

export const patchFiscalConfig = asyncHandler(async (req: Request, res: Response) => {
  const parsed = fiscalSchema.safeParse(req.body);
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
  if (b.rfc !== undefined) data.rfc = b.rfc.toUpperCase();
  if (b.razon_social !== undefined) data.razon_social = b.razon_social;
  if (b.regimen_fiscal !== undefined) data.regimen_fiscal = b.regimen_fiscal;
  if (b.cp_fiscal !== undefined) data.cp_fiscal = b.cp_fiscal;
  if (b.calle_fiscal !== undefined) data.calle_fiscal = b.calle_fiscal;
  if (b.colonia_fiscal !== undefined) data.colonia_fiscal = b.colonia_fiscal;
  if (b.municipio_fiscal !== undefined) data.municipio_fiscal = b.municipio_fiscal;
  if (b.estado_fiscal !== undefined) data.estado_fiscal = b.estado_fiscal;
  if (b.pac_proveedor !== undefined) data.pac_proveedor = b.pac_proveedor;
  if (b.pac_url !== undefined) data.pac_url = b.pac_url === "" ? null : b.pac_url;
  if (b.pac_usuario !== undefined) data.pac_usuario = b.pac_usuario;
  if (b.pac_token !== undefined) data.pac_token_enc = b.pac_token ? encryptSecret(b.pac_token) : null;
  if (b.cfdi_serie !== undefined) data.cfdi_serie = b.cfdi_serie;
  if (b.csd_password !== undefined) {
    data.csd_password_enc = b.csd_password ? encryptSecret(b.csd_password) : null;
  }
  await t.update(data as never);
  res.json(tenantFiscalToJson(t));
});

export const uploadCsd = asyncHandler(async (req: Request, res: Response) => {
  const files = req.files as { cer?: Express.Multer.File[]; key?: Express.Multer.File[] } | undefined;
  const cer = files?.cer?.[0];
  const key = files?.key?.[0];
  if (!cer || !key) {
    res.status(400).json({ error: "Se requieren archivos cer y key" });
    return;
  }
  const t = await Tenant.findByPk(tid(req));
  if (!t) {
    res.status(404).json({ error: "Empresa no encontrada" });
    return;
  }
  const uploadRoot = process.env.UPLOAD_DIR || "./uploads";
  const dir = path.join(uploadRoot, tid(req), "csd");
  await mkdir(dir, { recursive: true });
  const cerPath = path.join(dir, "certificado.cer");
  const keyPath = path.join(dir, "llave.key");
  await writeFile(cerPath, cer.buffer);
  await writeFile(keyPath, key.buffer);
  await t.update({ csd_cer_path: cerPath, csd_key_path: keyPath } as never);
  res.json(tenantFiscalToJson(t));
});
