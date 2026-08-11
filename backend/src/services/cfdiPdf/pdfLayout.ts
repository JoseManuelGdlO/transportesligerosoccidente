import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import { buildSatQrUrl } from "./buildQrUrl";
import type { ParsedCfdi } from "./parseCfdiXml";

/** US Letter — mismo tamaño que la plantilla Sicofi (612×792 pt). */
export const PAGE_W = 612;
export const PAGE_H = 792;
/** Sicofi imprime el contenido entre x=20 y x=592. */
export const MARGIN = 20;
export const CONTENT_L = MARGIN;
export const CONTENT_R = PAGE_W - MARGIN;
export const CONTENT_W = CONTENT_R - CONTENT_L;

export type RGB = [number, number, number];

export const BLACK: RGB = [0, 0, 0];
export const WHITE: RGB = [255, 255, 255];
export const PURPLE: RGB = [0x43, 0x2e, 0x7d];
export const RED: RGB = [0xe8, 0x0c, 0x0c];
export const GRAY: RGB = [0xcc, 0xcc, 0xcc];
/** Color de rejilla de las tablas Carta Porte. */
export const GRID: RGB = [0x33, 0x00, 0x33];
export const BLUE: RGB = [0, 0, 0xff];

export const GG_URL = "https://www.graficosgonzalez.com.mx";
export const GG_LINK_TEXT = "Facture electrónicamente en  www.graficosgonzalez.com.mx";

export type PdfDoc = InstanceType<typeof PDFDocument>;

/**
 * Sicofi ancla el texto por el tope de la caja de la fuente y PDFKit por el tope
 * de la caja de línea. La diferencia medida contra la plantilla es 0.352 em.
 */
const TOP_TO_LINE_BOX = 0.352;
/** Alto de la caja de la fuente en Sicofi (ascender + descender del bbox). */
const BBOX_H = 1.375;
/** Interlínea natural de PDFKit para Helvetica. */
const PDFKIT_LEADING = 1.156;

function pdfkitY(top: number, size: number): number {
  return top + TOP_TO_LINE_BOX * size;
}

/** Tope Sicofi que centra verticalmente una línea de `size` en una banda de alto `h`. */
export function centerTop(y: number, h: number, size: number): number {
  return y + (h - BBOX_H * size) / 2;
}

export interface TextOpts {
  size?: number;
  bold?: boolean;
  color?: RGB;
  align?: "left" | "center" | "right";
  /** Ancho del campo; obligatorio para `align` distinto de `left`. */
  width?: number;
  /** Interlínea Sicofi deseada (pitch entre topes de línea consecutivos). */
  leading?: number;
  underline?: boolean;
  link?: string;
  ellipsis?: boolean;
  height?: number;
}

/** Escribe texto anclado por el tope de la caja de la fuente (coordenadas Sicofi). */
export function text(doc: PdfDoc, str: string, x: number, top: number, opts: TextOpts = {}): void {
  const size = opts.size ?? 7;
  const font = opts.bold ? "Helvetica-Bold" : "Helvetica";
  doc.font(font).fontSize(size).fillColor(opts.color ?? BLACK);
  doc.text(str, x, pdfkitY(top, size), {
    width: opts.width,
    align: opts.align ?? "left",
    lineGap: opts.leading === undefined ? 0 : opts.leading - PDFKIT_LEADING * size,
    underline: opts.underline,
    link: opts.link,
    ellipsis: opts.ellipsis,
    height: opts.height,
  });
  doc.fillColor(BLACK);
}

/** Texto alineado a la derecha terminando en `right`. */
export function textRight(doc: PdfDoc, str: string, right: number, top: number, opts: TextOpts = {}): void {
  const width = opts.width ?? 400;
  text(doc, str, right - width, top, { ...opts, width, align: "right" });
}

/** Texto centrado en `[left, right]`. */
export function textCenter(doc: PdfDoc, str: string, left: number, right: number, top: number, opts: TextOpts = {}): void {
  text(doc, str, left, top, { ...opts, width: right - left, align: "center" });
}

export function measure(doc: PdfDoc, str: string, size: number, bold = false): number {
  return doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(size).widthOfString(str);
}

/** Número de líneas que ocupa `str` al ajustarse a `width`. */
export function lineCount(doc: PdfDoc, str: string, width: number, size: number, bold = false): number {
  doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(size);
  const h = doc.heightOfString(str || " ", { width, lineGap: 0 });
  return Math.max(1, Math.round(h / (PDFKIT_LEADING * size)));
}

/** Alto Sicofi de un bloque de texto ajustado a `width` con interlínea `leading`. */
export function blockHeight(
  doc: PdfDoc,
  str: string,
  width: number,
  size: number,
  leading: number,
  bold = false,
): number {
  return lineCount(doc, str, width, size, bold) * leading;
}

function rgb(c: RGB): string {
  return `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

export function line(doc: PdfDoc, x1: number, y1: number, x2: number, y2: number, color: RGB, lw = 1): void {
  doc.save().lineWidth(lw).moveTo(x1, y1).lineTo(x2, y2).stroke(rgb(color)).restore();
}

export function hRule(doc: PdfDoc, x: number, y: number, w: number, color: RGB = BLACK, lw = 0.5): void {
  line(doc, x, y, x + w, y, color, lw);
}

export function box(doc: PdfDoc, x: number, y: number, w: number, h: number, stroke: RGB, lw = 0.5): void {
  doc.save().lineWidth(lw).rect(x, y, w, h).stroke(rgb(stroke)).restore();
}

export function filledBox(
  doc: PdfDoc,
  x: number,
  y: number,
  w: number,
  h: number,
  fill: RGB,
  stroke?: RGB,
  lw = 0.5,
): void {
  doc.save().lineWidth(lw).rect(x, y, w, h);
  if (stroke) doc.fillAndStroke(rgb(fill), rgb(stroke));
  else doc.fill(rgb(fill));
  doc.restore();
}

const PANEL_R = 5;

/** Relleno con esquinas superiores redondeadas (banda de encabezado Sicofi). */
function fillRoundedTop(doc: PdfDoc, x: number, y: number, w: number, h: number, r: number, fill: RGB): void {
  doc
    .save()
    .moveTo(x, y + h)
    .lineTo(x, y + r)
    .quadraticCurveTo(x, y, x + r, y)
    .lineTo(x + w - r, y)
    .quadraticCurveTo(x + w, y, x + w, y + r)
    .lineTo(x + w, y + h)
    .closePath()
    .fill(rgb(fill))
    .restore();
}

/**
 * Marco de panel Sicofi: caja de esquinas redondeadas con banda de encabezado
 * morada. Devuelve la `y` donde empieza el cuerpo.
 */
export function drawPanelFrame(
  doc: PdfDoc,
  x: number,
  y: number,
  w: number,
  h: number,
  headerH: number,
): number {
  fillRoundedTop(doc, x, y, w, headerH, PANEL_R, PURPLE);
  doc.save().lineWidth(1).roundedRect(x, y, w, h, PANEL_R).stroke(rgb(BLACK)).restore();
  line(doc, x, y + headerH, x + w, y + headerH, BLACK, 1);
  return y + headerH;
}

/** Panel Sicofi con un único título blanco centrado en la banda. */
export function drawPanel(
  doc: PdfDoc,
  x: number,
  y: number,
  w: number,
  h: number,
  headerH: number,
  title: string,
  titleSize = 8,
): number {
  const bodyY = drawPanelFrame(doc, x, y, w, h, headerH);
  textCenter(doc, title, x, x + w, centerTop(y, headerH, titleSize), {
    size: titleSize,
    bold: true,
    color: WHITE,
  });
  return bodyY;
}

/** Banda morada suelta de esquinas redondeadas (encabezado de la tabla de conceptos). */
export function drawPurpleBand(doc: PdfDoc, x: number, y: number, w: number, h: number): void {
  doc.save().lineWidth(1).roundedRect(x, y, w, h, PANEL_R).fillAndStroke(rgb(PURPLE), rgb(BLACK)).restore();
}

/** Celda morada de esquinas redondeadas (etiquetas del bloque de totales). */
export function drawPurpleCell(doc: PdfDoc, x: number, y: number, w: number, h: number, stroke: RGB = BLACK): void {
  doc.save().lineWidth(0.5).roundedRect(x, y, w, h, 2).fillAndStroke(rgb(PURPLE), rgb(stroke)).restore();
}

/** Celda blanca de esquinas redondeadas (valores del bloque de totales). */
export function drawValueCell(doc: PdfDoc, x: number, y: number, w: number, h: number, stroke: RGB = PURPLE): void {
  doc.save().lineWidth(0.5).roundedRect(x, y, w, h, 2).fillAndStroke(rgb(WHITE), rgb(stroke)).restore();
}

/** Barra de sección gris a todo lo ancho (secciones Carta Porte). */
export function drawGrayBar(doc: PdfDoc, y: number, h: number, title: string, bold = true, size = 7): number {
  filledBox(doc, CONTENT_L, y, CONTENT_W, h, GRAY, GRID, 0.5);
  textCenter(doc, title, CONTENT_L, CONTENT_R, centerTop(y, h, size), { size, bold });
  return y + h;
}

export type CellAlign = "left" | "center" | "right";

/** Celda de tabla Carta Porte con relleno opcional y texto alineado. */
export function drawCell(
  doc: PdfDoc,
  x: number,
  y: number,
  w: number,
  h: number,
  value: string,
  opts: { fill?: RGB; align?: CellAlign; size?: number; bold?: boolean; pad?: number } = {},
): void {
  const size = opts.size ?? 7;
  const pad = opts.pad ?? 2;
  if (opts.fill) filledBox(doc, x, y, w, h, opts.fill, GRID, 0.5);
  else box(doc, x, y, w, h, GRID, 0.5);
  if (!value) return;
  const top = centerTop(y, h, size);
  const align = opts.align ?? "center";
  if (align === "right") textRight(doc, value, x + w - pad, top, { size, bold: opts.bold, width: w - pad * 2 });
  else text(doc, value, x + pad, top, { size, bold: opts.bold, width: w - pad * 2, align });
}

/** Fila de celdas definida por los cortes de columna `xs`. */
export function drawCellRow(
  doc: PdfDoc,
  xs: number[],
  y: number,
  h: number,
  values: string[],
  opts: { fill?: RGB; align?: CellAlign | CellAlign[]; size?: number; bold?: boolean } = {},
): number {
  for (let i = 0; i < xs.length - 1; i++) {
    const align = Array.isArray(opts.align) ? (opts.align[i] ?? "center") : opts.align;
    drawCell(doc, xs[i], y, xs[i + 1] - xs[i], h, values[i] ?? "", { ...opts, align });
  }
  return y + h;
}

/**
 * Celda de resumen Sicofi: etiqueta en negritas arriba y valor debajo, ambos
 * centrados dentro de la misma caja.
 */
export function drawStackedCell(
  doc: PdfDoc,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  value: string,
  size = 7,
): void {
  box(doc, x, y, w, h, GRID, 0.5);
  textCenter(doc, label, x, x + w, y - 0.2, { size, bold: true });
  textCenter(doc, value, x, x + w, y + 6.9, { size });
}

/** Par etiqueta/valor en línea: etiqueta en negritas y valor en redonda. */
export function drawInlineField(
  doc: PdfDoc,
  x: number,
  top: number,
  label: string,
  value: string,
  size = 7,
  gap = 6,
): void {
  const labelText = `${label}:`;
  text(doc, labelText, x, top, { size, bold: true });
  if (!value) return;
  text(doc, value, x + measure(doc, labelText, size, true) + gap, top, { size });
}

/** Par etiqueta/valor de columna: etiqueta a la izquierda y valor pegado a la derecha. */
export function drawColumnField(
  doc: PdfDoc,
  left: number,
  right: number,
  top: number,
  label: string,
  value: string,
  opts: { size?: number; labelBold?: boolean; valueBold?: boolean } = {},
): void {
  const size = opts.size ?? 7;
  text(doc, `${label}:`, left, top, { size, bold: opts.labelBold ?? true });
  if (value) textRight(doc, value, right, top, { size, bold: opts.valueBold, width: right - left });
}

/**
 * Reduce el cuerpo de texto hasta que quepa en `maxH` conservando la proporción
 * entre tamaño e interlínea. Mantiene fijas las cajas de sellos de la plantilla.
 */
function fitToHeight(
  doc: PdfDoc,
  content: string,
  width: number,
  maxH: number,
  size: number,
  leading: number,
  bold: boolean,
): { size: number; leading: number } {
  let s = size;
  while (s > 2 && blockHeight(doc, content, width, s, leading * (s / size), bold) > maxH) {
    s -= 0.25;
  }
  return { size: s, leading: leading * (s / size) };
}

/** Sello de página 1: banda morada con título blanco y cuerpo morado centrado. */
export function drawPurpleSeal(
  doc: PdfDoc,
  x: number,
  y: number,
  w: number,
  h: number,
  title: string,
  content: string,
): number {
  const headerH = 12;
  doc.save().lineWidth(1).roundedRect(x, y, w, h, PANEL_R).stroke(rgb(BLACK)).restore();
  fillRoundedTop(doc, x, y, w, headerH, PANEL_R, PURPLE);
  line(doc, x, y + headerH, x + w, y + headerH, BLACK, 1);
  textCenter(doc, title, x, x + w - 5, centerTop(y, headerH, 8), { size: 8, color: WHITE });

  const bodyY = y + headerH;
  const bodyH = h - headerH;
  const innerW = w - 6;
  const body = content || " ";
  const { size, leading } = fitToHeight(doc, body, innerW, bodyH - 4, 5, 6.3, true);
  const blockH = blockHeight(doc, body, innerW, size, leading, true);
  textCenter(doc, body, x + 3, x + w - 3, bodyY + Math.max(0, (bodyH - blockH) / 2), {
    size,
    bold: true,
    color: PURPLE,
    leading,
  });
  return y + h;
}

/** Sello de página 2: etiqueta con filete superior/inferior y cuerpo a la izquierda. */
export function drawPlainSeal(
  doc: PdfDoc,
  x: number,
  y: number,
  w: number,
  labelH: number,
  bodyH: number,
  title: string,
  content: string,
): number {
  filledBox(doc, x, y, w, labelH, WHITE);
  hRule(doc, x, y, w, BLACK, 0.5);
  hRule(doc, x, y + labelH, w, BLACK, 0.5);
  text(doc, title, x + 2, y, { size: 7 });
  const bodyY = y + labelH;
  const body = content || " ";
  const { size, leading } = fitToHeight(doc, body, w - 4, bodyH - 1, 6, 7.55, false);
  text(doc, body, x + 2, bodyY - 0.2, { size, width: w - 4, leading });
  hRule(doc, x, bodyY + bodyH, w, BLACK, 0.5);
  return bodyY + bodyH;
}

/**
 * Cadena original del complemento de certificación digital del SAT:
 * `||Version|UUID|FechaTimbrado|RfcProvCertif|SelloCFD|NoCertificadoSAT||`.
 */
export function cadenaOriginal(cfdi: ParsedCfdi): string {
  return (
    `||${cfdi.timbre.version ?? ""}|${cfdi.timbre.uuid}|${cfdi.timbre.fechaTimbrado}|` +
    `${cfdi.timbre.rfcProvCertif || ""}|${cfdi.timbre.selloCFD || cfdi.sello || ""}|` +
    `${cfdi.timbre.noCertificadoSAT || ""}||`
  );
}

export async function drawQr(doc: PdfDoc, cfdi: ParsedCfdi, x: number, y: number, size: number): Promise<void> {
  const url = buildSatQrUrl({
    uuid: cfdi.timbre.uuid,
    rfcEmisor: cfdi.emisor.rfc,
    rfcReceptor: cfdi.receptor.rfc,
    total: cfdi.total,
    selloCfd: cfdi.sello || cfdi.timbre.selloCFD || "",
  });
  const dataUrl = await QRCode.toDataURL(url, { margin: 0, width: 300 });
  const buf = Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ""), "base64");
  doc.image(buf, x, y, { fit: [size, size] });
}
