import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import multer from "multer";
import type { Request } from "express";
import { uploadRootDir } from "./uploadDocument";

const ALLOWED_MIMES = new Set(["image/jpeg", "image/png"]);
const MAX_BYTES = 2 * 1024 * 1024;

export function pdfBrandingDir(tenantId: string): string {
  const dir = path.join(uploadRootDir(), tenantId, "pdf-branding");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export const uploadPdfLogo = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => {
      try {
        cb(null, pdfBrandingDir(req.user!.tenantId));
      } catch (e) {
        cb(e as Error, "");
      }
    },
    filename(_req, file, cb) {
      const ext = file.mimetype === "image/png" ? ".png" : ".jpg";
      cb(null, `logo-${randomUUID()}${ext}`);
    },
  }),
  limits: { fileSize: MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIMES.has(file.mimetype)) cb(null, true);
    else cb(new Error("Solo se permiten imágenes PNG o JPG"));
  },
});
