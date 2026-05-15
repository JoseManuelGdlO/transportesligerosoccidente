import path from "node:path";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import multer from "multer";
import type { Request, Response, NextFunction } from "express";
import { Document } from "../models";
import { uploadRootDir, maxUploadBytes } from "./uploadDocument";

const ALLOWED_MIMES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

export const uploadDocumentPatch = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => {
      const dest = (req as Request & { uploadDestDir?: string }).uploadDestDir;
      if (!dest || dest.length === 0) {
        cb(new Error("Ruta de subida no preparada"), "");
        return;
      }
      fs.mkdirSync(dest, { recursive: true });
      cb(null, dest);
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

/** Ejecutar antes de uploadDocumentPatch.single("file") en PATCH /documents/:id */
export async function loadDocumentForPatch(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const tid = req.user!.tenantId;
  const doc = await Document.findOne({ where: { id: req.params.id, tenant_id: tid } });
  if (!doc) {
    res.status(404).json({ error: "Documento no encontrado" });
    return;
  }
  const folder = doc.documentable_type === "driver" ? "drivers" : "trucks";
  (req as Request & { uploadDestDir?: string; patchDocument?: Document }).uploadDestDir = path.join(
    uploadRootDir(),
    doc.tenant_id,
    folder,
    doc.documentable_id,
  );
  (req as Request & { patchDocument?: Document }).patchDocument = doc;
  next();
}
