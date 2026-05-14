import type { Request, Response, NextFunction } from "express";
import type { PermissionSlug } from "../constants/permissions";

export function requirePermission(...required: PermissionSlug[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const u = req.user;
    if (!u) {
      res.status(401).json({ error: "No autenticado" });
      return;
    }
    const ok = required.some((p) => u.permissions.includes(p));
    if (!ok) {
      res.status(403).json({ error: "Permiso denegado" });
      return;
    }
    next();
  };
}
