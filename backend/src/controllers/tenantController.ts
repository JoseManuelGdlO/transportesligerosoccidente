import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { Request, Response } from "express";
import { Tenant } from "../models";
import { asyncHandler } from "../utils/asyncHandler";
import { uploadRootDir } from "../middlewares/uploadDocument";
import {
  DEFAULT_PDF_CONFIG,
  DEFAULT_TEMPLATE_SETTLEMENT,
  DEFAULT_TEMPLATE_TRIP,
  normalizePdfConfig,
  tenantToJson,
  type BlockInstanceJson,
  type PdfTemplateJson,
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

const brandingSchema = z
  .object({
    titulo: z.string().min(1).max(80).optional(),
    color_header: hexColor.optional(),
    color_header_text: hexColor.optional(),
    color_accent: hexColor.optional(),
    pie_pagina: z.string().max(200).optional(),
  })
  .strict()
  .optional();

const blockSchema = z
  .object({
    id: z.string().min(1).max(64),
    enabled: z.boolean().optional().default(true),
    props: z.record(z.unknown()).optional(),
  })
  .strict();

const sectionsSchema = z
  .object({
    header: z.array(blockSchema).max(50).optional(),
    body: z.array(blockSchema).max(100).optional(),
    footer: z.array(blockSchema).max(50).optional(),
  })
  .strict()
  .optional();

const templatePatchSchema = z
  .object({
    branding: brandingSchema,
    sections: sectionsSchema,
  })
  .strict();

const patchPdfConfigSchema = z
  .object({
    settlement: templatePatchSchema.optional(),
    trip: templatePatchSchema.optional(),
    reset_defaults: z.enum(["all", "settlement", "trip"]).optional(),
  })
  .strict();

type TemplateKind = "settlement" | "trip";

function pdfConfigResponse(t: Tenant) {
  const json = tenantToJson(t);
  return {
    pdf_config: json.pdf_config,
    has_pdf_logo: json.has_pdf_logo,
    has_pdf_trip_logo: json.has_pdf_trip_logo,
  };
}

function unlinkPdfLogo(relPath: string | null | undefined) {
  if (!relPath) return;
  const abs = path.join(uploadRootDir(), relPath);
  if (fs.existsSync(abs)) fs.unlink(abs, () => {});
}

function logoPathColumn(kind: TemplateKind): "pdf_logo_path" | "pdf_trip_logo_path" {
  return kind === "trip" ? "pdf_trip_logo_path" : "pdf_logo_path";
}

function mergeTemplate(
  current: PdfTemplateJson,
  patch: { branding?: Partial<PdfTemplateJson["branding"]>; sections?: Partial<PdfTemplateJson["sections"]> } | undefined,
  fallback: PdfTemplateJson,
): PdfTemplateJson {
  if (!patch) return current;
  const branding = { ...current.branding, ...(patch.branding ?? {}) };
  const blocks = (arr: BlockInstanceJson[] | undefined, def: BlockInstanceJson[]) => {
    if (!arr) return def;
    return arr.map((b) => ({
      id: b.id,
      enabled: b.enabled !== false,
      ...(b.props && typeof b.props === "object" ? { props: b.props } : {}),
    })) as BlockInstanceJson[];
  };
  const sections = {
    header: blocks(patch.sections?.header, current.sections.header),
    body: blocks(patch.sections?.body, current.sections.body),
    footer: blocks(patch.sections?.footer, current.sections.footer),
  };
  return {
    branding,
    sections: {
      header: sections.header.length > 0 ? sections.header : fallback.sections.header,
      body: sections.body.length > 0 ? sections.body : fallback.sections.body,
      footer: sections.footer.length > 0 ? sections.footer : fallback.sections.footer,
    },
  };
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

  const reset = parsed.data.reset_defaults;
  if (reset === "all") {
    await t.update({ pdf_config: { ...DEFAULT_PDF_CONFIG } } as never);
    await t.reload();
    res.json(pdfConfigResponse(t));
    return;
  }

  const current = normalizePdfConfig(t.pdf_config);
  let next = current;

  if (reset === "settlement") {
    next = { ...next, settlement: { ...DEFAULT_TEMPLATE_SETTLEMENT } };
  }
  if (reset === "trip") {
    next = { ...next, trip: { ...DEFAULT_TEMPLATE_TRIP } };
  }

  if (parsed.data.settlement) {
    next = {
      ...next,
      settlement: mergeTemplate(next.settlement, parsed.data.settlement, DEFAULT_TEMPLATE_SETTLEMENT),
    };
  }
  if (parsed.data.trip) {
    next = {
      ...next,
      trip: mergeTemplate(next.trip, parsed.data.trip, DEFAULT_TEMPLATE_TRIP),
    };
  }

  await t.update({ pdf_config: next } as never);
  await t.reload();
  res.json(pdfConfigResponse(t));
});

function parseTemplateParam(req: Request): TemplateKind | null {
  const raw = req.params.template;
  if (raw === "settlement" || raw === "trip") return raw;
  return null;
}

export const uploadPdfLogoHandler = asyncHandler(async (req: Request, res: Response) => {
  const kind = parseTemplateParam(req);
  if (!kind) {
    res.status(400).json({ error: "Template inválido. Usa 'settlement' o 'trip'." });
    return;
  }
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
  const col = logoPathColumn(kind);
  unlinkPdfLogo(t[col]);
  await t.update({ [col]: rel } as never);
  await t.reload();
  res.json(pdfConfigResponse(t));
});

export const deletePdfLogo = asyncHandler(async (req: Request, res: Response) => {
  const kind = parseTemplateParam(req);
  if (!kind) {
    res.status(400).json({ error: "Template inválido. Usa 'settlement' o 'trip'." });
    return;
  }
  const t = await Tenant.findByPk(req.user!.tenantId);
  if (!t) {
    res.status(404).json({ error: "Empresa no encontrada" });
    return;
  }
  const col = logoPathColumn(kind);
  unlinkPdfLogo(t[col]);
  await t.update({ [col]: null } as never);
  await t.reload();
  res.json(pdfConfigResponse(t));
});

export const streamPdfLogo = asyncHandler(async (req: Request, res: Response) => {
  const kind = parseTemplateParam(req);
  if (!kind) {
    res.status(400).json({ error: "Template inválido. Usa 'settlement' o 'trip'." });
    return;
  }
  const t = await Tenant.findByPk(req.user!.tenantId);
  const rel = t?.[logoPathColumn(kind)];
  if (!rel) {
    res.status(404).json({ error: "Logo no configurado" });
    return;
  }
  const abs = path.join(uploadRootDir(), rel);
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
