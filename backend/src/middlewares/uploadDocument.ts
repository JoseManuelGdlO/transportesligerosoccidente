import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import multer from "multer";
import type { Request } from "express";

const ALLOWED_MIMES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

export function uploadRootDir(): string {
  return process.env.UPLOAD_DIR ?? path.join(process.cwd(), "uploads");
}

export function maxUploadBytes(): number {
  const mb = Number(process.env.MAX_UPLOAD_MB ?? 10);
  if (!Number.isFinite(mb) || mb < 1) return 10 * 1024 * 1024;
  return Math.floor(mb * 1024 * 1024);
}

function ensureTenantAndEntityDirs(req: Request, entityFolder: "drivers" | "trucks"): string {
  const tid = req.user!.tenantId;
  const entityId = req.params.id;
  const dir = path.join(uploadRootDir(), tid, entityFolder, entityId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** Multer instance for POST /drivers/:id/documents and PATCH with replacement file in same folder */
export const uploadDriverDocument = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => {
      try {
        cb(null, ensureTenantAndEntityDirs(req, "drivers"));
      } catch (e) {
        cb(e as Error, "");
      }
    },
    filename(_req, file, cb) {
      const ext = path.extname(file.originalname) || ".bin";
      cb(null, `${randomUUID()}${ext}`);
    },
  }),
  limits: { fileSize: maxUploadBytes() },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIMES.has(file.mimetype)) cb(null, true);
    else cb(new Error("Tipo de archivo no permitido (solo imágenes JPG/PNG/WebP o PDF)"));
  },
});

export const uploadTruckDocument = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => {
      try {
        cb(null, ensureTenantAndEntityDirs(req, "trucks"));
      } catch (e) {
        cb(e as Error, "");
      }
    },
    filename(_req, file, cb) {
      const ext = path.extname(file.originalname) || ".bin";
      cb(null, `${randomUUID()}${ext}`);
    },
  }),
  limits: { fileSize: maxUploadBytes() },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIMES.has(file.mimetype)) cb(null, true);
    else cb(new Error("Tipo de archivo no permitido (solo imágenes JPG/PNG/WebP o PDF)"));
  },
});
