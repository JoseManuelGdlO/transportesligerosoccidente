import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import multer from "multer";
import type { Request } from "express";
import { maxUploadBytes } from "./uploadDocument";

const ALLOWED_MIMES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

function fuelReceiptDir(req: Request): string {
  const tid = req.user!.tenantId;
  const tripId = req.params.id;
  const dir = path.join(process.env.UPLOAD_DIR ?? path.join(process.cwd(), "uploads"), tid, "fuel-receipts", tripId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export const uploadFuelReceipt = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => {
      try {
        cb(null, fuelReceiptDir(req));
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
