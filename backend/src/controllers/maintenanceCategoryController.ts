import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Request, Response } from "express";
import { MaintenanceCategory, MaintenanceRecord } from "../models";
import { asyncHandler } from "../utils/asyncHandler";

const tid = (req: Request) => req.user!.tenantId;

const bodySchema = z.object({
  nombre: z.string().min(1).max(120),
  descripcion: z.string().max(255).optional().nullable(),
  estatus: z.enum(["activo", "inactivo"]).optional(),
});

function categoryToJson(c: MaintenanceCategory) {
  return {
    id: c.id,
    nombre: c.nombre,
    descripcion: c.descripcion ?? undefined,
    estatus: c.estatus ?? "activo",
  };
}

export const listCategories = asyncHandler(async (req: Request, res: Response) => {
  const rows = await MaintenanceCategory.findAll({
    where: { tenant_id: tid(req) },
    order: [["nombre", "ASC"]],
  });
  res.json(rows.map(categoryToJson));
});

export const createCategory = asyncHandler(async (req: Request, res: Response) => {
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const data = parsed.data;
  const nombre = data.nombre.trim();
  if (!nombre) {
    res.status(400).json({ error: "El nombre es requerido" });
    return;
  }
  const existing = await MaintenanceCategory.findOne({
    where: { tenant_id: tid(req), nombre },
  });
  if (existing) {
    res.status(409).json({ error: "Ya existe una categoría con ese nombre" });
    return;
  }
  const row = await MaintenanceCategory.create({
    id: randomUUID(),
    tenant_id: tid(req),
    nombre,
    descripcion: data.descripcion?.trim() || null,
    estatus: data.estatus ?? "activo",
  } as never);
  res.status(201).json(categoryToJson(row));
});

export const updateCategory = asyncHandler(async (req: Request, res: Response) => {
  const row = await MaintenanceCategory.findOne({
    where: { id: req.params.id, tenant_id: tid(req) },
  });
  if (!row) {
    res.status(404).json({ error: "No encontrado" });
    return;
  }
  const parsed = bodySchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const data = parsed.data;
  if (data.nombre !== undefined) {
    const nombre = data.nombre.trim();
    if (!nombre) {
      res.status(400).json({ error: "El nombre es requerido" });
      return;
    }
    const clash = await MaintenanceCategory.findOne({
      where: { tenant_id: tid(req), nombre },
    });
    if (clash && clash.id !== row.id) {
      res.status(409).json({ error: "Ya existe una categoría con ese nombre" });
      return;
    }
    await row.update({
      nombre,
      ...(data.descripcion !== undefined ? { descripcion: data.descripcion?.trim() || null } : {}),
      ...(data.estatus !== undefined ? { estatus: data.estatus } : {}),
    } as never);
  } else {
    await row.update({
      ...(data.descripcion !== undefined ? { descripcion: data.descripcion?.trim() || null } : {}),
      ...(data.estatus !== undefined ? { estatus: data.estatus } : {}),
    } as never);
  }
  res.json(categoryToJson(row));
});

export const deleteCategory = asyncHandler(async (req: Request, res: Response) => {
  const row = await MaintenanceCategory.findOne({
    where: { id: req.params.id, tenant_id: tid(req) },
  });
  if (!row) {
    res.status(404).json({ error: "No encontrado" });
    return;
  }
  const inUse = await MaintenanceRecord.count({
    where: { tenant_id: tid(req), category_id: row.id },
  });
  if (inUse > 0) {
    res.status(409).json({
      error: "No se puede eliminar: hay mantenimientos que usan esta categoría",
    });
    return;
  }
  await row.destroy();
  res.status(204).send();
});
