import multer from "multer";

const ALLOWED = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "text/csv",
  "application/csv",
]);

export const uploadFuelImport = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok =
      ALLOWED.has(file.mimetype) ||
      file.originalname.endsWith(".xlsx") ||
      file.originalname.endsWith(".xls") ||
      file.originalname.endsWith(".csv");
    if (ok) cb(null, true);
    else cb(new Error("Solo se permiten archivos Excel (.xlsx, .xls) o CSV"));
  },
});
