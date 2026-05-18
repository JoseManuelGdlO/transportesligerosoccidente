import multer from "multer";

export const uploadCsd = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 512 * 1024 },
  fileFilter(_req, file, cb) {
    const ok =
      file.fieldname === "cer" ||
      file.fieldname === "key" ||
      file.originalname.endsWith(".cer") ||
      file.originalname.endsWith(".key");
    if (ok) cb(null, true);
    else cb(new Error("Solo archivos .cer y .key"));
  },
}).fields([
  { name: "cer", maxCount: 1 },
  { name: "key", maxCount: 1 },
]);
