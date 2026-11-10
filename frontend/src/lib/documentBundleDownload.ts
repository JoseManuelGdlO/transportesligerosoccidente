import { apiFetch } from "@/lib/api";
import {
  mergeDocumentsToPdf,
  normalizeMergeMime,
  safeDownloadName,
  type DocumentPdfPart,
  type MergeableMime,
} from "@/lib/mergeDocumentsPdf";

export type BundleMode = "separate" | "merged";

export type BundleFile = {
  title: string;
  detail: string;
  fileUrl: string;
  fileName?: string | null;
  mime?: string | null;
};

const EXT_BY_MIME: Record<string, string> = {
  "application/pdf": ".pdf",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

async function fetchFileBytes(fileUrl: string, title: string): Promise<Uint8Array> {
  const path = fileUrl.startsWith("/") ? fileUrl : `/${fileUrl}`;
  const res = await apiFetch(path);
  if (!res.ok) throw new Error(`No se pudo descargar "${title}"`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.byteLength === 0) throw new Error(`"${title}" está vacío`);
  return bytes;
}

function extensionFor(mime: string, fileName?: string | null): string {
  const fromName = (fileName ?? "").match(/(\.[a-z0-9]{1,8})$/i)?.[1];
  if (fromName) return fromName.toLowerCase();
  return EXT_BY_MIME[mime] ?? "";
}

function separateFileName(file: BundleFile, index: number, mime: string): string {
  const prefix = String(index + 1).padStart(2, "0");
  const title = safeDownloadName(file.title, "documento");
  const original = file.fileName?.trim();
  if (original) {
    const base = safeDownloadName(original.replace(/\.[^.]+$/, ""), title);
    return `${prefix}-${base}${extensionFor(mime, original)}`;
  }
  return `${prefix}-${title}${extensionFor(mime, null)}`;
}

/** El navegador decodifica WebP; pdf-lib solo incrusta JPEG y PNG. */
async function webpBytesToPng(bytes: Uint8Array): Promise<Uint8Array> {
  const blob = new Blob([bytes], { type: "image/webp" });
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("No se pudo leer una imagen WebP"));
      el.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;
    const ctx = canvas.getContext("2d");
    if (!ctx || canvas.width < 1 || canvas.height < 1) {
      throw new Error("No se pudo leer una imagen WebP");
    }
    ctx.drawImage(img, 0, 0);
    const png = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((out) => (out ? resolve(out) : reject(new Error("No se pudo convertir una imagen WebP"))), "image/png");
    });
    return new Uint8Array(await png.arrayBuffer());
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function toMergePart(file: BundleFile, bytes: Uint8Array): Promise<DocumentPdfPart> {
  const mime = normalizeMergeMime(file.mime, file.fileName);
  if (!mime) throw new Error(`"${file.title}" no es un PDF ni una imagen compatible`);
  if (mime === "image/webp") {
    try {
      const png = await webpBytesToPng(bytes);
      return { title: file.title, detail: file.detail, mime: "image/png", bytes: png };
    } catch {
      throw new Error(`No se pudo convertir la imagen de "${file.title}"`);
    }
  }
  return { title: file.title, detail: file.detail, mime: mime satisfies MergeableMime, bytes };
}

function coverTitle(kind: "driver" | "truck", entityLabel: string): string {
  const label = entityLabel.trim();
  if (kind === "truck") return label ? `Unidad ${label}` : "Unidad";
  return label ? `Operador ${label}` : "Operador";
}

function mergedFileName(kind: "driver" | "truck", entityLabel: string): string {
  const fallback = kind === "truck" ? "unidad" : "operador";
  return `documentos-${safeDownloadName(entityLabel, fallback)}.pdf`;
}

export async function downloadDocumentBundle(options: {
  mode: BundleMode;
  kind: "driver" | "truck";
  entityLabel: string;
  files: BundleFile[];
}): Promise<void> {
  const files = options.files.filter((file) => file.fileUrl.trim());
  if (files.length === 0) throw new Error("No hay archivos para descargar");

  if (options.mode === "separate") {
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const mime = normalizeMergeMime(file.mime, file.fileName) ?? "application/octet-stream";
      const bytes = await fetchFileBytes(file.fileUrl, file.title);
      const blob = new Blob([bytes], { type: file.mime || undefined });
      triggerBlobDownload(blob, separateFileName(file, i, mime));
      if (i < files.length - 1) await new Promise((resolve) => window.setTimeout(resolve, 400));
    }
    return;
  }

  const parts: DocumentPdfPart[] = [];
  for (const file of files) {
    const bytes = await fetchFileBytes(file.fileUrl, file.title);
    parts.push(await toMergePart(file, bytes));
  }
  const pdf = await mergeDocumentsToPdf(parts, coverTitle(options.kind, options.entityLabel));
  triggerBlobDownload(
    new Blob([pdf], { type: "application/pdf" }),
    mergedFileName(options.kind, options.entityLabel),
  );
}
