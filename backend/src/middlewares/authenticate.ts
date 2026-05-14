import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { User, Role, Permission } from "../models";
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
    const decoded = jwt.verify(token, secret) as { sub: string };
    const user = await User.findByPk(decoded.sub, {
      include: [
        {
          model: Role,
          include: [{ model: Permission, through: { attributes: [] } }],
        },
      ],
    });
    if (!user || user.estatus !== "activo") {
      res.status(401).json({ error: "Sesión inválida" });
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
    };
    next();
  } catch {
    res.status(401).json({ error: "Token inválido o expirado" });
  }
}
