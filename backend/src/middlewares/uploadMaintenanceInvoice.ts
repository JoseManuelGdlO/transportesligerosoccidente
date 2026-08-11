import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import multer from "multer";
import type { Request } from "express";
import { maxUploadBytes, uploadRootDir } from "./uploadDocument";

const ALLOWED_MIMES = new Set(["image/jpeg", "image/png", "application/pdf"]);

function maintenanceInvoiceDir(req: Request): string {
  const tid = req.user!.tenantId;
  const recordId = req.params.id;
  const dir = path.join(uploadRootDir(), tid, "maintenance-invoices", recordId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export const uploadMaintenanceInvoice = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => {
      try {
        cb(null, maintenanceInvoiceDir(req));
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
    else cb(new Error("Tipo de archivo no permitido (solo JPG, PNG o PDF)"));
  },
});
