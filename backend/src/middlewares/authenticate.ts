import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { User, Role, Permission, Tenant } from "../models";
import type { AuthedUser } from "../types/authUser";

export async function authenticateJwt(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Token requerido" });
    return;
  }
  const token = header.slice(7);
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    res.status(500).json({ error: "JWT_SECRET no configurado" });
    return;
  }
  try {
    const decoded = jwt.verify(token, secret) as { sub: string; tid: string; typ?: string };
    if (decoded.typ === "refresh") {
      res.status(401).json({ error: "Usa el token de acceso, no el de renovación" });
      return;
    }
    if (!decoded.tid) {
      res.status(401).json({ error: "Token sin contexto de empresa" });
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
    const role = user.Role;
    const permModels = (role as unknown as { Permissions?: Permission[] })?.Permissions ?? [];
    const perms = permModels.map((p) => p.slug) as AuthedUser["permissions"];
    req.user = {
      id: user.id,
      email: user.email,
      nombre: user.nombre,
      roleSlug: role?.slug ?? "",
      permissions: perms,
      tenantId: user.tenant_id,
      tenantSlug: tenant.slug,
    };
    next();
  } catch {
    res.status(401).json({ error: "Token inválido o expirado" });
  }
}
