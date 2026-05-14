import { Op } from "sequelize";
import { z } from "zod";
import type { Request, Response } from "express";
import { Role, Permission, RolePermission } from "../models";
import { asyncHandler } from "../utils/asyncHandler";
import { roleDefinitionToJson } from "../utils/serialize";
import { ALL_PERMISSIONS } from "../constants/permissions";

export const listRoles = asyncHandler(async (_req: Request, res: Response) => {
  const roles = await Role.findAll({
    include: [{ model: Permission, through: { attributes: [] } }],
    order: [["slug", "ASC"]],
  });
  res.json(
    roles.map((r) => {
      const perms = (r as unknown as { Permissions?: Permission[] }).Permissions ?? [];
      return roleDefinitionToJson(r, perms);
    }),
  );
});

const putPermsSchema = z.object({
  permisos: z.array(z.string()),
});

export const putRolePermissions = asyncHandler(async (req: Request, res: Response) => {
  const slug = req.params.slug;
  if (slug === "admin") {
    res.status(400).json({ error: "El rol administrador no se modifica" });
    return;
  }
  const parsed = putPermsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const role = await Role.findOne({ where: { slug } });
  if (!role) {
    res.status(404).json({ error: "Rol no encontrado" });
    return;
  }
  const slugs = parsed.data.permisos.filter((p) => (ALL_PERMISSIONS as readonly string[]).includes(p));
  const perms = await Permission.findAll({ where: { slug: { [Op.in]: slugs } } });
  await RolePermission.bulkCreate(
    perms.map((p) => ({
      role_id: role.id,
      permission_id: p.id,
    })),
  );
  const fresh = await Role.findByPk(role.id, {
    include: [{ model: Permission, through: { attributes: [] } }],
  });
  const permModels = (fresh as unknown as { Permissions?: Permission[] })?.Permissions ?? [];
  res.json(roleDefinitionToJson(fresh!, permModels));
});
