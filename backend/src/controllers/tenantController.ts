import { z } from "zod";
import type { Request, Response } from "express";
import { Tenant } from "../models";
import { asyncHandler } from "../utils/asyncHandler";
import { tenantToJson } from "../utils/serialize";

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
