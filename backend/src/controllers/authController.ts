import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import type { Request, Response } from "express";
import { User, Role, Permission } from "../models";
import { asyncHandler } from "../utils/asyncHandler";
import { userToJson } from "../utils/serialize";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const postLogin = asyncHandler(async (req: Request, res: Response) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Email y contraseña requeridos" });
    return;
  }
  const { email, password } = parsed.data;
  const user = await User.findOne({
    where: { email: email.toLowerCase().trim() },
    include: [
      {
        model: Role,
        include: [{ model: Permission, through: { attributes: [] } }],
      },
    ],
  });
  if (!user) {
    res.status(401).json({ error: "Credenciales inválidas" });
    return;
  }
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) {
    res.status(401).json({ error: "Credenciales inválidas" });
    return;
  }
  if (user.estatus !== "activo") {
    res.status(403).json({ error: "Usuario inactivo" });
    return;
  }
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    res.status(500).json({ error: "JWT_SECRET no configurado" });
    return;
  }
  const expSec = Number(process.env.JWT_EXPIRES_SEC);
  const expiresIn = Number.isFinite(expSec) && expSec > 0 ? expSec : 15 * 60;
  const token = jwt.sign({ sub: user.id }, secret, { expiresIn });
  await user.update({ ultimo_acceso: new Date() });
  const role = user.Role;
  const permModels = (role as unknown as { Permissions?: Permission[] })?.Permissions ?? [];
  const permissions = permModels.map((p) => p.slug);
  res.json({
    token,
    user: {
      ...userToJson(user, role?.slug ?? ""),
      permissions,
    },
  });
});

export const getMe = asyncHandler(async (req: Request, res: Response) => {
  const u = req.user!;
  res.json({
    id: u.id,
    email: u.email,
    nombre: u.nombre,
    role: u.roleSlug,
    permissions: u.permissions,
  });
});
