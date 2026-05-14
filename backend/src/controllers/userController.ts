import { z } from "zod";
import type { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { User, Role } from "../models";
import { asyncHandler } from "../utils/asyncHandler";
import { userToJson } from "../utils/serialize";

const createSchema = z.object({
  nombre: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6).optional(),
  role: z.enum(["admin", "capturista"]),
  estatus: z.enum(["activo", "inactivo"]).optional(),
});

const patchSchema = z.object({
  nombre: z.string().min(1).optional(),
  email: z.string().email().optional(),
  password: z.string().min(6).optional(),
  role: z.enum(["admin", "capturista"]).optional(),
  estatus: z.enum(["activo", "inactivo"]).optional(),
});

const statusSchema = z.object({
  estatus: z.enum(["activo", "inactivo"]),
});

export const listUsers = asyncHandler(async (_req: Request, res: Response) => {
  const rows = await User.findAll({ include: [Role], order: [["nombre", "ASC"]] });
  res.json(
    rows.map((u) => {
      const roleSlug = u.Role?.slug ?? "";
      return userToJson(u, roleSlug);
    }),
  );
});

export const createUser = asyncHandler(async (req: Request, res: Response) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const b = parsed.data;
  const role = await Role.findOne({ where: { slug: b.role } });
  if (!role) {
    res.status(400).json({ error: "Rol inválido" });
    return;
  }
  const plain = b.password ?? randomUUID().replace(/-/g, "").slice(0, 12);
  const hash = await bcrypt.hash(plain, 10);
  const user = await User.create({
    id: randomUUID(),
    role_id: role.id,
    email: b.email.toLowerCase().trim(),
    password_hash: hash,
    nombre: b.nombre.trim(),
    estatus: b.estatus ?? "activo",
  });
  const u = await User.findByPk(user.id, { include: [Role] });
  res.status(201).json({
    ...userToJson(u!, u!.Role!.slug),
    temporary_password: b.password ? undefined : plain,
  });
});

export const patchUser = asyncHandler(async (req: Request, res: Response) => {
  const u = await User.findByPk(req.params.id, { include: [Role] });
  if (!u) {
    res.status(404).json({ error: "No encontrado" });
    return;
  }
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const b = parsed.data;
  if (b.email) u.email = b.email.toLowerCase().trim();
  if (b.nombre) u.nombre = b.nombre.trim();
  if (b.estatus) u.estatus = b.estatus;
  if (b.password) u.password_hash = await bcrypt.hash(b.password, 10);
  if (b.role) {
    const role = await Role.findOne({ where: { slug: b.role } });
    if (!role) {
      res.status(400).json({ error: "Rol inválido" });
      return;
    }
    u.role_id = role.id;
  }
  await u.save();
  const fresh = await User.findByPk(u.id, { include: [Role] });
  res.json(userToJson(fresh!, fresh!.Role!.slug));
});

export const patchUserStatus = asyncHandler(async (req: Request, res: Response) => {
  const parsed = statusSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const u = await User.findByPk(req.params.id, { include: [Role] });
  if (!u) {
    res.status(404).json({ error: "No encontrado" });
    return;
  }
  u.estatus = parsed.data.estatus;
  await u.save();
  res.json(userToJson(u, u.Role!.slug));
});
