import { PDFDocument } from "pdf-lib";

export type MergeableMime = "application/pdf" | "image/jpeg" | "image/png";

export type DocumentPdfPart = {
  title: string;
  detail: string;
  mime: MergeableMime;
  bytes: Uint8Array;
};

/** MIME que se puede unir, o WebP (se convierte a PNG antes de llamar al merge). */
export function normalizeMergeMime(
  mime: string | null | undefined,
  fileName?: string | null,
): MergeableMime | "image/webp" | null {
  const raw = (mime ?? "").split(";")[0].trim().toLowerCase();
  if (raw === "application/pdf") return "application/pdf";
  if (raw === "image/jpeg" || raw === "image/jpg") return "image/jpeg";
  if (raw === "image/png") return "image/png";
  if (raw === "image/webp") return "image/webp";

  const ext = (fileName ?? "").split(".").pop()?.toLowerCase();
  if (ext === "pdf") return "application/pdf";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  return null;
}

/** Nombre de archivo seguro para el atributo download del navegador. */
export function safeDownloadName(label: string, fallback: string): string {
  const cleaned = label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[.-]+|[.-]+$/g, "")
    .slice(0, 80);
  return cleaned || fallback;
}

/**
 * Une los archivos en un solo PDF, en el orden recibido.
 * Cada PDF se copia página por página, sin recortar ni agregar texto.
 * Cada imagen ocupa una página del mismo tamaño que la imagen.
 */
export async function mergeDocumentsToPdf(parts: DocumentPdfPart[]): Promise<Uint8Array> {
  if (parts.length === 0) throw new Error("No hay archivos para unir");

  const out = await PDFDocument.create();
  for (const part of parts) {
    if (part.mime === "application/pdf") await appendPdf(out, part);
    else await appendImage(out, part);
  }
  return out.save();
}

async function appendPdf(out: PDFDocument, part: DocumentPdfPart): Promise<void> {
  let src: PDFDocument;
  try {
    src = await PDFDocument.load(part.bytes, { ignoreEncryption: true });
  } catch {
    throw new Error(`No se pudo leer el PDF de "${part.title}"`);
  }
  const indices = src.getPageIndices();
  if (indices.length === 0) throw new Error(`El PDF de "${part.title}" no tiene páginas`);
  const copied = await out.copyPages(src, indices);
  for (const copiedPage of copied) out.addPage(copiedPage);
}

async function appendImage(out: PDFDocument, part: DocumentPdfPart): Promise<void> {
  let image;
  try {
    image = part.mime === "image/jpeg" ? await out.embedJpg(part.bytes) : await out.embedPng(part.bytes);
  } catch {
    throw new Error(`No se pudo incluir la imagen de "${part.title}"`);
  }
  if (image.width < 1 || image.height < 1) {
    throw new Error(`La imagen de "${part.title}" no tiene tamaño válido`);
  }

  const page = out.addPage([image.width, image.height]);
  page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
}
