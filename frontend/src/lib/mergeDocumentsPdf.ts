import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 48;

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

function latin1(text: string): string {
  return text
    .normalize("NFC")
    .replace(/[^\u0020-\u00FF]/g, "")
    .replace(/[\u007F-\u009F]/g, "");
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const clean = latin1(text).replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const words = clean.split(" ");
  const lines: string[] = [];
  let line = "";

  const pushLongWord = (word: string) => {
    let chunk = "";
    for (const ch of word) {
      const next = chunk + ch;
      if (font.widthOfTextAtSize(next, size) <= maxWidth) chunk = next;
      else {
        if (chunk) lines.push(chunk);
        chunk = ch;
      }
    }
    line = chunk;
  };

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);
    if (font.widthOfTextAtSize(word, size) <= maxWidth) line = word;
    else pushLongWord(word);
  }
  if (line) lines.push(line);
  return lines;
}

function drawWrapped(
  page: PDFPage,
  text: string,
  font: PDFFont,
  size: number,
  x: number,
  baseline: number,
  maxWidth: number,
  color: ReturnType<typeof rgb>,
): number {
  const lines = wrapText(text, font, size, maxWidth);
  let y = baseline;
  for (const row of lines) {
    page.drawText(row, { x, y, size, font, color });
    y -= size + 4;
  }
  return y;
}

function lineHeight(size: number): number {
  return size + 4;
}

/**
 * Arma un solo PDF: portada con el índice y, en orden, cada archivo.
 * Las imágenes van en su propia página con el nombre del documento.
 * Los PDF se copian tal cual, página por página.
 */
export async function mergeDocumentsToPdf(parts: DocumentPdfPart[], coverTitle: string): Promise<Uint8Array> {
  if (parts.length === 0) throw new Error("No hay archivos para unir");

  const out = await PDFDocument.create();
  const font = await out.embedFont(StandardFonts.Helvetica);
  const bold = await out.embedFont(StandardFonts.HelveticaBold);
  const maxW = PAGE_W - MARGIN * 2;
  const ink = rgb(0.12, 0.14, 0.18);
  const muted = rgb(0.35, 0.38, 0.42);

  let page = out.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN - 18;

  const need = (height: number) => {
    if (y - height >= MARGIN) return;
    page = out.addPage([PAGE_W, PAGE_H]);
    y = PAGE_H - MARGIN - 12;
  };

  y = drawWrapped(page, "Resumen de documentos", bold, 18, MARGIN, y, maxW, ink);
  y -= 4;
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: PAGE_W - MARGIN, y },
    thickness: 1,
    color: rgb(0.75, 0.78, 0.82),
  });
  y -= 20;
  y = drawWrapped(page, coverTitle, font, 12, MARGIN, y, maxW, muted);
  y -= 16;

  parts.forEach((part, index) => {
    const title = `${index + 1}. ${part.title}`;
    const titleLines = wrapText(title, bold, 12, maxW);
    const detailLines = part.detail ? wrapText(part.detail, font, 10, maxW) : [];
    const block = titleLines.length * lineHeight(12) + detailLines.length * lineHeight(10) + 8;
    need(block);
    y = drawWrapped(page, title, bold, 12, MARGIN, y, maxW, ink);
    if (part.detail) y = drawWrapped(page, part.detail, font, 10, MARGIN, y, maxW, muted);
    y -= 8;
  });

  for (const part of parts) {
    if (part.mime === "application/pdf") {
      await appendPdf(out, part);
      continue;
    }
    await appendImage(out, part, font, bold);
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

async function appendImage(
  out: PDFDocument,
  part: DocumentPdfPart,
  font: PDFFont,
  bold: PDFFont,
): Promise<void> {
  let image;
  try {
    image = part.mime === "image/jpeg" ? await out.embedJpg(part.bytes) : await out.embedPng(part.bytes);
  } catch {
    throw new Error(`No se pudo incluir la imagen de "${part.title}"`);
  }
  if (image.width < 1 || image.height < 1) {
    throw new Error(`La imagen de "${part.title}" no tiene tamaño válido`);
  }

  const landscape = image.width > image.height;
  const pw = landscape ? PAGE_H : PAGE_W;
  const ph = landscape ? PAGE_W : PAGE_H;
  const page = out.addPage([pw, ph]);
  const maxW = pw - MARGIN * 2;
  const ink = rgb(0.12, 0.14, 0.18);
  const muted = rgb(0.35, 0.38, 0.42);

  let y = ph - MARGIN - 14;
  const title = truncateToWidth(part.title, bold, 14, maxW);
  page.drawText(title, { x: MARGIN, y, size: 14, font: bold, color: ink });
  y -= 18;
  if (part.detail) {
    const detail = truncateToWidth(part.detail, font, 10, maxW);
    page.drawText(detail, { x: MARGIN, y, size: 10, font, color: muted });
    y -= 16;
  }

  const boxTop = y - 8;
  const boxH = boxTop - MARGIN;
  const scale = Math.min(maxW / image.width, boxH / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  page.drawImage(image, {
    x: (pw - width) / 2,
    y: MARGIN + (boxH - height) / 2,
    width,
    height,
  });
}

function truncateToWidth(text: string, font: PDFFont, size: number, maxWidth: number): string {
  const clean = latin1(text).replace(/\s+/g, " ").trim();
  if (!clean) return "";
  if (font.widthOfTextAtSize(clean, size) <= maxWidth) return clean;
  let out = clean;
  while (out.length > 1 && font.widthOfTextAtSize(`${out}...`, size) > maxWidth) {
    out = out.slice(0, -1);
  }
  return `${out}...`;
}
