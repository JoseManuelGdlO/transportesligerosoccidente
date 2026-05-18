import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import type { Request, Response } from "express";
import { User, Role, Permission, Tenant } from "../models";
import { asyncHandler } from "../utils/asyncHandler";
import { userToJson, tenantToJson } from "../utils/serialize";
import { signAccessToken, signRefreshToken } from "../utils/jwtTokens";
import { permissionsForRole } from "../constants/permissions";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  /** Opcional: si se envía, se usa el flujo clásico por empresa. Si no, se resuelve el usuario solo por correo (debe ser único entre empresas activas). */
  tenant_slug: z
    .string()
    .min(1)
    .transform((s) => s.toLowerCase().trim())
    .optional(),
});

export const postLogin = asyncHandler(async (req: Request, res: Response) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Email y contraseña son requeridos" });
    return;
  }
  const { email, password, tenant_slug } = parsed.data;
  const emailNorm = email.toLowerCase().trim();

  let user: User | null = null;
  let tenant: Tenant | null = null;

  if (tenant_slug) {
    tenant = await Tenant.findOne({ where: { slug: tenant_slug, estatus: "activo" } });
    if (!tenant) {
      res.status(401).json({ error: "Empresa no encontrada o inactiva" });
      return;
    }
    user = await User.findOne({
      where: { tenant_id: tenant.id, email: emailNorm },
      include: [
        {
          model: Role,
          include: [{ model: Permission, through: { attributes: [] } }],
        },
      ],
    });
  } else {
    const rows = await User.findAll({
      where: { email: emailNorm },
      include: [
        { model: Tenant, required: true, where: { estatus: "activo" } },
        {
          model: Role,
          include: [{ model: Permission, through: { attributes: [] } }],
        },
      ],
    });
    if (rows.length === 0) {
      res.status(401).json({ error: "Credenciales inválidas" });
      return;
    }
    if (rows.length > 1) {
      res.status(409).json({
        error:
          "Este correo está registrado en más de una empresa activa. Indica el código de empresa (tenant_slug) o unifica el correo por empresa.",
      });
      return;
    }
    user = rows[0];
    tenant = (user as unknown as { Tenant?: Tenant }).Tenant ?? (await Tenant.findByPk(user.tenant_id));
  }

  if (!user || !tenant) {
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
  const token = signAccessToken(secret, user.id, tenant.id);
  const refresh_token = signRefreshToken(secret, user.id, tenant.id);
  await user.update({ ultimo_acceso: new Date() });
  const role = user.Role;
  const permModels = (role as unknown as { Permissions?: Permission[] })?.Permissions ?? [];
  const permissions = permissionsForRole(role?.slug ?? "", permModels.map((p) => p.slug));
  res.json({
    token,
    refresh_token,
    tenant: tenantToJson(tenant),
    user: {
      ...userToJson(user, role?.slug ?? ""),
      permissions,
    },
  });
});

const refreshSchema = z.object({
  refresh_token: z.string().min(20),
});

export const postRefresh = asyncHandler(async (req: Request, res: Response) => {
  const parsed = refreshSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "refresh_token es requerido" });
    return;
  }
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    res.status(500).json({ error: "JWT_SECRET no configurado" });
    return;
  }
  let decoded: jwt.JwtPayload & { sub?: string; tid?: string; typ?: string };
  try {
    decoded = jwt.verify(parsed.data.refresh_token, secret) as jwt.JwtPayload & {
      sub?: string;
      tid?: string;
      typ?: string;
    };
  } catch {
    res.status(401).json({ error: "Sesión expirada. Inicia sesión de nuevo." });
    return;
  }
  if (decoded.typ !== "refresh" || typeof decoded.sub !== "string" || typeof decoded.tid !== "string") {
    res.status(401).json({ error: "Token de renovación inválido" });
    return;
  }
  const user = await User.findByPk(decoded.sub, {
    include: [
      { model: Tenant, attributes: ["id", "slug", "nombre", "estatus"] },
      {
        model: Role,
        include: [{ model: Permission, through: { attributes: [] } }],
      },
    ],
  });
  if (!user || user.estatus !== "activo" || user.tenant_id !== decoded.tid) {
    res.status(401).json({ error: "Sesión inválida" });
    return;
  }
  const tenant = user.Tenant;
  if (!tenant || tenant.estatus !== "activo") {
    res.status(403).json({ error: "Empresa inactiva o suspendida" });
    return;
  }
  const token = signAccessToken(secret, user.id, tenant.id);
  const refresh_token = signRefreshToken(secret, user.id, tenant.id);
  res.json({ token, refresh_token });
});

export const getMe = asyncHandler(async (req: Request, res: Response) => {
  const u = req.user!;
  const tenant = await Tenant.findByPk(u.tenantId);
  res.json({
    id: u.id,
    email: u.email,
    nombre: u.nombre,
    role: u.roleSlug,
    permissions: u.permissions,
    tenant: tenant ? tenantToJson(tenant) : { id: u.tenantId, slug: u.tenantSlug },
  });
});
