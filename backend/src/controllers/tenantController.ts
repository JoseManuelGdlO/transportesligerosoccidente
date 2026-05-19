import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { Request, Response } from "express";
import { Tenant } from "../models";
import { asyncHandler } from "../utils/asyncHandler";
import { uploadRootDir } from "../middlewares/uploadDocument";
import {
  DEFAULT_PDF_CONFIG,
  normalizePdfConfig,
  tenantToJson,
} from "../utils/serialize";

const patchTenantSchema = z.object({
  nombre: z.string().min(1).optional(),
});

const patchThemeSchema = z.object({
  logo_url: z.union([z.string().url(), z.literal("")]).nullable().optional(),
  color_primary: z.string().regex(/^#[0-9A-Fa-f]{6}$/).nullable().optional(),
  color_accent: z.string().regex(/^#[0-9A-Fa-f]{6}$/).nullable().optional(),
  color_sidebar: z.string().regex(/^#[0-9A-Fa-f]{6}$/).nullable().optional(),
});

export const getTenant = asyncHandler(async (req: Request, res: Response) => {
  const t = await Tenant.findByPk(req.user!.tenantId);
  if (!t) {
    res.status(404).json({ error: "Empresa no encontrada" });
    return;
  }
  res.json(tenantToJson(t));
});

export const patchTenant = asyncHandler(async (req: Request, res: Response) => {
  const parsed = patchTenantSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const t = await Tenant.findByPk(req.user!.tenantId);
  if (!t) {
    res.status(404).json({ error: "Empresa no encontrada" });
    return;
  }
  await t.update(parsed.data as never);
  res.json(tenantToJson(t));
});

export const patchTenantTheme = asyncHandler(async (req: Request, res: Response) => {
  const parsed = patchThemeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const t = await Tenant.findByPk(req.user!.tenantId);
  if (!t) {
    res.status(404).json({ error: "Empresa no encontrada" });
    return;
  }
  const b = parsed.data;
  const data: Record<string, unknown> = {};
  if (b.logo_url !== undefined) data.logo_url = b.logo_url === "" ? null : b.logo_url;
  if (b.color_primary !== undefined) data.color_primary = b.color_primary;
  if (b.color_accent !== undefined) data.color_accent = b.color_accent;
  if (b.color_sidebar !== undefined) data.color_sidebar = b.color_sidebar;
  await t.update(data as never);
  res.json(tenantToJson(t));
});

const hexColor = z.string().regex(/^#[0-9A-Fa-f]{6}$/);

const patchPdfConfigSchema = z.object({
  titulo: z.string().min(1).max(80).optional(),
  color_header: hexColor.optional(),
  color_header_text: hexColor.optional(),
  pie_pagina: z.string().max(200).optional(),
  reset_defaults: z.boolean().optional(),
});

function pdfConfigResponse(t: Tenant) {
  const json = tenantToJson(t);
  return {
    pdf_config: json.pdf_config,
    has_pdf_logo: json.has_pdf_logo,
  };
}

function unlinkPdfLogo(relPath: string | null | undefined) {
  if (!relPath) return;
  const abs = path.join(uploadRootDir(), relPath);
  if (fs.existsSync(abs)) fs.unlink(abs, () => {});
}

export const getPdfConfig = asyncHandler(async (req: Request, res: Response) => {
  const t = await Tenant.findByPk(req.user!.tenantId);
  if (!t) {
    res.status(404).json({ error: "Empresa no encontrada" });
    return;
  }
  res.json(pdfConfigResponse(t));
});

export const patchPdfConfig = asyncHandler(async (req: Request, res: Response) => {
  const parsed = patchPdfConfigSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const t = await Tenant.findByPk(req.user!.tenantId);
  if (!t) {
    res.status(404).json({ error: "Empresa no encontrada" });
    return;
  }
  if (parsed.data.reset_defaults) {
    await t.update({ pdf_config: { ...DEFAULT_PDF_CONFIG } } as never);
    await t.reload();
    res.json(pdfConfigResponse(t));
    return;
  }
  const current = normalizePdfConfig(t.pdf_config);
  const next = {
    titulo: parsed.data.titulo ?? current.titulo,
    color_header: parsed.data.color_header ?? current.color_header,
    color_header_text: parsed.data.color_header_text ?? current.color_header_text,
    pie_pagina: parsed.data.pie_pagina ?? current.pie_pagina,
  };
  await t.update({ pdf_config: next } as never);
  await t.reload();
  res.json(pdfConfigResponse(t));
});

export const uploadPdfLogoHandler = asyncHandler(async (req: Request, res: Response) => {
  const file = req.file;
  if (!file) {
    res.status(400).json({ error: "Archivo requerido (campo file)" });
    return;
  }
  const t = await Tenant.findByPk(req.user!.tenantId);
  if (!t) {
    res.status(404).json({ error: "Empresa no encontrada" });
    return;
  }
  const tid = req.user!.tenantId;
  const rel = path.join(tid, "pdf-branding", file.filename).replace(/\\/g, "/");
  unlinkPdfLogo(t.pdf_logo_path);
  await t.update({ pdf_logo_path: rel } as never);
  await t.reload();
  res.json(pdfConfigResponse(t));
});

export const deletePdfLogo = asyncHandler(async (req: Request, res: Response) => {
  const t = await Tenant.findByPk(req.user!.tenantId);
  if (!t) {
    res.status(404).json({ error: "Empresa no encontrada" });
    return;
  }
  unlinkPdfLogo(t.pdf_logo_path);
  await t.update({ pdf_logo_path: null } as never);
  await t.reload();
  res.json(pdfConfigResponse(t));
});

export const streamPdfLogo = asyncHandler(async (req: Request, res: Response) => {
  const t = await Tenant.findByPk(req.user!.tenantId);
  if (!t?.pdf_logo_path) {
    res.status(404).json({ error: "Logo no configurado" });
    return;
  }
  const abs = path.join(uploadRootDir(), t.pdf_logo_path);
  if (!fs.existsSync(abs)) {
    res.status(404).json({ error: "Archivo no encontrado" });
    return;
  }
  const ext = path.extname(abs).toLowerCase();
  const mime = ext === ".png" ? "image/png" : "image/jpeg";
  res.setHeader("Content-Type", mime);
  res.setHeader("Content-Disposition", "inline");
  res.sendFile(abs);
});
