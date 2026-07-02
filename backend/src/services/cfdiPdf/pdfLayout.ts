import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import { buildSatQrUrl } from "./buildQrUrl";
import type { CfdiAutotransporte, CfdiUbicacion, ParsedCfdi } from "./parseCfdiXml";

/** US Letter — mismo tamaño que plantilla Sicofi/JasperReports (612×792 pt). */
export const PAGE_W = 612;
export const PAGE_H = 792;
export const MARGIN = 36;
export const CONTENT_W = PAGE_W - MARGIN * 2;
export const FOOTER_H = 36;
export const BOTTOM_RESERVE = 200;
export const PAGE2_SEAL_RESERVE = 118;

export const BLACK: [number, number, number] = [0, 0, 0];
export const WHITE: [number, number, number] = [255, 255, 255];
export const GRAY_HEADER: [number, number, number] = [224, 224, 224];
export const RED: [number, number, number] = [204, 0, 0];
export const BLUE: [number, number, number] = [0, 0, 204];

export const GG_URL = "https://www.graficosgonzalez.com.mx";
export const GG_LINK_TEXT = "Facture electrónicamente en www.graficosgonzalez.com.mx";

export type PdfDoc = InstanceType<typeof PDFDocument>;

export function usableBottom(): number {
  return PAGE_H - MARGIN - FOOTER_H;
}

export function needsNewPage(y: number, needed: number): boolean {
  return y + needed > usableBottom();
}

export function drawRoundedBox(doc: PdfDoc, x: number, y: number, w: number, h: number, r = 4) {
  doc.roundedRect(x, y, w, h, r).stroke(BLACK);
}

export function drawFlatBox(doc: PdfDoc, x: number, y: number, w: number, h: number) {
  doc.rect(x, y, w, h).stroke(BLACK);
}

export function drawFlatBlackHeader(doc: PdfDoc, x: number, y: number, w: number, h: number, title: string, fontSize = 8) {
  doc.rect(x, y, w, h).fillAndStroke(BLACK, BLACK);
  doc.fillColor(WHITE).font("Helvetica-Bold").fontSize(fontSize).text(title, x + 3, y + (h - fontSize) / 2 - 1, {
    width: w - 6,
    align: "center",
  });
  doc.fillColor(BLACK).font("Helvetica");
}

export function drawBlackHeader(doc: PdfDoc, x: number, y: number, w: number, h: number, title: string, fontSize = 8) {
  doc.roundedRect(x, y, w, h, 3).fillAndStroke(BLACK, BLACK);
  doc.fillColor(WHITE).font("Helvetica-Bold").fontSize(fontSize).text(title, x + 4, y + (h - fontSize) / 2 - 1, {
    width: w - 8,
    align: "center",
  });
  doc.fillColor(BLACK).font("Helvetica");
}

export function drawGraySectionBar(doc: PdfDoc, y: number, title: string, fontSize = 8): number {
  const h = 12;
  doc.rect(MARGIN, y, CONTENT_W, h).fillAndStroke(GRAY_HEADER, BLACK);
  doc
    .fillColor(BLACK)
    .font("Helvetica-Bold")
    .fontSize(fontSize)
    .text(title, MARGIN + 4, y + 3, { width: CONTENT_W - 8, align: "center" });
  doc.font("Helvetica");
  return y + h;
}

export function drawFlatSealBox(
  doc: PdfDoc,
  x: number,
  y: number,
  w: number,
  title: string,
  content: string,
  maxH: number,
): number {
  const headerH = 14;
  drawFlatBlackHeader(doc, x, y, w, headerH, title, 5.5);
  const bodyY = y + headerH;
  const bodyH = maxH - headerH;
  doc.rect(x, bodyY, w, bodyH).stroke(BLACK);
  doc.fontSize(4.5).text(content || "—", x + 3, bodyY + 2, { width: w - 6, lineGap: 0.3 });
  doc.font("Helvetica").fontSize(7);
  return y + maxH;
}

export function drawDataTable(
  doc: PdfDoc,
  y: number,
  headers: string[],
  rows: string[][],
  colWidths: number[],
  headerH = 12,
  rowH = 14,
  fontSize = 6,
): number {
  let x = MARGIN;
  for (let i = 0; i < headers.length; i++) {
    drawFlatBlackHeader(doc, x, y, colWidths[i], headerH, headers[i], 6);
    x += colWidths[i];
  }
  y += headerH;
  doc.fontSize(fontSize);
  for (const row of rows) {
    let rh = rowH;
    for (let i = 0; i < row.length; i++) {
      const cellH = doc.heightOfString(row[i] ?? "—", { width: colWidths[i] - 4, lineGap: 0 });
      rh = Math.max(rh, cellH + 6);
    }
    x = MARGIN;
    for (let i = 0; i < row.length; i++) {
      doc.rect(x, y, colWidths[i], rh).stroke(BLACK);
      doc.text(row[i] ?? "—", x + 2, y + 3, { width: colWidths[i] - 4, lineGap: 0 });
      x += colWidths[i];
    }
    y += rh;
  }
  doc.font("Helvetica");
  return y;
}

export function drawLabeledGrid(
  doc: PdfDoc,
  y: number,
  fields: [string, string][],
  cols = 2,
  fontSize = 6.5,
): number {
  const colW = CONTENT_W / cols;
  doc.fontSize(fontSize);
  for (let i = 0; i < fields.length; i++) {
    const [label, val] = fields[i];
    const cx = MARGIN + (i % cols) * colW;
    const cy = y + Math.floor(i / cols) * 10;
    doc.text(`${label}: ${val}`, cx, cy, { width: colW - 4 });
  }
  const rows = Math.ceil(fields.length / cols);
  return y + rows * 10 + 4;
}

/** Fila de campos en N columnas con altura dinámica (evita solapamiento de texto largo). */
export function drawFieldColumns(
  doc: PdfDoc,
  y: number,
  fields: [string, string][],
  cols = 2,
  fontSize = 6.5,
  rowGap = 4,
): number {
  const colW = CONTENT_W / cols;
  doc.fontSize(fontSize);
  let row = 0;
  while (row * cols < fields.length) {
    let rowH = 8;
    const rowY = y;
    for (let c = 0; c < cols; c++) {
      const idx = row * cols + c;
      if (idx >= fields.length) break;
      const [label, val] = fields[idx];
      const text = `${label}: ${val}`;
      const textH = doc.heightOfString(text, { width: colW - 4, lineGap: 0 });
      rowH = Math.max(rowH, textH + 2);
    }
    for (let c = 0; c < cols; c++) {
      const idx = row * cols + c;
      if (idx >= fields.length) break;
      const [label, val] = fields[idx];
      doc.text(`${label}: ${val}`, MARGIN + c * colW, rowY, { width: colW - 4, lineGap: 0 });
    }
    y += rowH;
    row++;
  }
  return y + rowGap;
}

/** Tabla etiqueta/valor con filas de altura dinámica (encabezado página 2). */
export function measureMetaRows(
  doc: PdfDoc,
  w: number,
  fields: [string, string][],
  fontSize = 6,
): number {
  const labelW = w * 0.42;
  const valW = w - labelW;
  doc.fontSize(fontSize);
  let h = 0;
  for (const [label, val] of fields) {
    const valH = doc.heightOfString(val, { width: valW - 4, align: "right", lineGap: 0 });
    const labelH = doc.heightOfString(`${label}:`, { width: labelW - 4, lineGap: 0 });
    h += Math.max(valH, labelH, 8) + 4;
  }
  return h;
}

export function drawMetaRows(
  doc: PdfDoc,
  x: number,
  y: number,
  w: number,
  fields: [string, string][],
  fontSize = 6,
): number {
  const labelW = w * 0.42;
  const valW = w - labelW;
  doc.fontSize(fontSize);
  for (const [label, val] of fields) {
    const valH = doc.heightOfString(val, { width: valW - 4, align: "right", lineGap: 0 });
    const labelH = doc.heightOfString(`${label}:`, { width: labelW - 4, lineGap: 0 });
    const rowH = Math.max(valH, labelH, 8) + 4;
    doc.text(`${label}:`, x + 2, y, { width: labelW - 4, lineGap: 0 });
    doc.text(val, x + labelW, y, { width: valW - 4, align: "right", lineGap: 0 });
    y += rowH;
    drawHorizontalRule(doc, x, y - 1, w);
  }
  return y;
}

/** Tabla resumen: encabezados negros + una fila de valores (Mercancias). */
export function drawSummaryTable(
  doc: PdfDoc,
  y: number,
  headers: string[],
  values: string[],
  colWidths: number[],
  headerH = 12,
  rowH = 12,
  fontSize = 6,
): number {
  let x = MARGIN;
  for (let i = 0; i < headers.length; i++) {
    drawFlatBlackHeader(doc, x, y, colWidths[i], headerH, headers[i], 6);
    x += colWidths[i];
  }
  y += headerH;
  x = MARGIN;
  doc.fontSize(fontSize);
  for (let i = 0; i < values.length; i++) {
    doc.rect(x, y, colWidths[i], rowH).stroke(BLACK);
    doc.text(values[i] ?? "—", x + 2, y + 3, { width: colWidths[i] - 4, align: "center" });
    x += colWidths[i];
  }
  doc.font("Helvetica");
  return y + rowH;
}

/** Etiqueta gris "Domicilio:" + texto en línea (estilo Sicofi). */
export function drawDomicilioRow(doc: PdfDoc, y: number, text: string, fontSize = 6): number {
  const labelW = 54;
  const rowH = fontSize <= 5.5 ? 10 : 12;
  doc.rect(MARGIN, y, labelW, rowH).fillAndStroke(GRAY_HEADER, BLACK);
  doc
    .fillColor(BLACK)
    .font("Helvetica-Bold")
    .fontSize(fontSize)
    .text("Domicilio:", MARGIN + 3, y + 3, { width: labelW - 6 });
  doc.font("Helvetica").text(text, MARGIN + labelW + 3, y + 3, { width: CONTENT_W - labelW - 6, lineGap: 0 });
  return y + rowH + 2;
}

/** Cuadro de seguros en dos columnas (Autotransporte). */
export function drawSegurosBox(doc: PdfDoc, y: number, left: [string, string][], right: [string, string][]): number {
  const boxH = Math.max(left.length, right.length) * 10 + 8;
  const halfW = CONTENT_W / 2;
  drawFlatBox(doc, MARGIN, y, CONTENT_W, boxH);
  doc.moveTo(MARGIN + halfW, y).lineTo(MARGIN + halfW, y + boxH).stroke(BLACK);
  doc.fontSize(6);
  for (let i = 0; i < left.length; i++) {
    doc.text(`${left[i][0]}: ${left[i][1]}`, MARGIN + 4, y + 4 + i * 10, { width: halfW - 8 });
  }
  for (let i = 0; i < right.length; i++) {
    doc.text(`${right[i][0]}: ${right[i][1]}`, MARGIN + halfW + 4, y + 4 + i * 10, { width: halfW - 8 });
  }
  return y + boxH + 4;
}

/** Bloque tabular Sicofi por ubicación Carta Porte (valor arriba, etiqueta abajo). */
export function drawUbicacionSicofiBlock(
  doc: PdfDoc,
  y: number,
  u: CfdiUbicacion,
  domicilioText: string | undefined,
): number {
  const val = (v?: string | null) => v?.trim() || " ";
  doc.font("Helvetica-Bold").fontSize(7).text(u.tipoUbicacion, MARGIN, y);
  y += 8;
  const fields: [string, string][] = [
    ["Tipo Ubicacion", u.tipoUbicacion],
    ["ID Ubicacion", val(u.idUbicacion)],
    ["RFC Remitente Destinatario", val(u.rfcRemitenteDestinatario)],
    ["Nombre", val(u.nombreRemitenteDestinatario)],
    ["NumRegIdTrib", val(u.numRegIdTrib)],
    ["Residencia Fiscal", val(u.residenciaFiscal)],
    ["Num Estacion", val(u.numEstacion)],
    ["Nombre Estacion", val(u.nombreEstacion)],
    ["Navegacion Trafico", val(u.navegacionTrafico)],
    ["Fecha Hora Salida Llegada", val(u.fechaHoraSalidaLlegada)],
    ["Tipo Estacion", val(u.tipoEstacion)],
    ["Distancia Recorrida", val(u.distanciaRecorrida)],
  ];

  const cols = 4;
  const colW = CONTENT_W / cols;
  const valueH = 9;
  const labelH = 7;
  const rowBlockH = valueH + labelH;
  const rows = Math.ceil(fields.length / cols);
  const blockH = rows * rowBlockH;

  drawFlatBox(doc, MARGIN, y, CONTENT_W, blockH);
  doc.font("Helvetica").fontSize(6);

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c;
      const x = MARGIN + c * colW;
      const ry = y + r * rowBlockH;
      if (c > 0) {
        doc.moveTo(x, y).lineTo(x, y + blockH).stroke(BLACK);
      }
      if (r > 0) {
        drawHorizontalRule(doc, MARGIN, ry, CONTENT_W);
      }
      if (idx >= fields.length) continue;
      const [label, fieldVal] = fields[idx];
      doc.font("Helvetica").fontSize(6).text(fieldVal, x + 2, ry + 2, { width: colW - 4, align: "center" });
      doc
        .font("Helvetica-Bold")
        .fontSize(5)
        .text(`${label}:`, x + 2, ry + valueH + 1, { width: colW - 4, align: "center" });
    }
  }
  doc.font("Helvetica");
  y += blockH + 2;

  if (domicilioText) {
    y = drawDomicilioRow(doc, y, domicilioText, 5.5);
  }
  return y + 2;
}

/** Resumen Mercancias — 6 columnas estilo Sicofi. */
export function drawMercanciasSummary6Col(
  doc: PdfDoc,
  y: number,
  values: [string, string, string, string, string, string],
): number {
  const headers = [
    "Recolección - Devolución",
    "Unidad Peso",
    "Cargo Por Tasacion",
    "Peso Neto Total",
    "Num Total Mercancias",
    "Peso Bruto Total",
  ];
  const colW = headers.map(() => CONTENT_W / 6);
  return drawSummaryTable(doc, y, headers, [...values], colW, 12, 12, 5.5);
}

/** Identificación vehicular en una sola línea (Sicofi). */
export function drawIdentificacionVehicularInline(doc: PdfDoc, y: number, a: CfdiAutotransporte): number {
  doc.font("Helvetica-Bold").fontSize(6).text("Identificacion Vehicular", MARGIN, y);
  y += 9;
  const parts: string[] = [];
  if (a.configVehicular?.trim()) parts.push(`Config Vehicula: ${a.configVehicular.trim()}`);
  if (a.placaVM?.trim()) parts.push(`Placa VM: ${a.placaVM.trim()}`);
  if (a.anioModeloVM?.trim()) parts.push(`Año Modelo VM: ${a.anioModeloVM.trim()}`);
  if (a.pesoBrutoVehicular?.trim()) parts.push(`Peso Bruto Vehicular: ${a.pesoBrutoVehicular.trim()}`);
  const line = parts.join(", ");
  doc.font("Helvetica").fontSize(6).text(line || "—", MARGIN, y, { width: CONTENT_W, lineGap: 0 });
  return y + doc.heightOfString(line || "—", { width: CONTENT_W, lineGap: 0 }) + 4;
}

/** Sellos al pie de página 2 Carta Porte (sin QR). */
export function drawSellosCartaPorte(doc: PdfDoc, cfdi: ParsedCfdi, startY: number): number {
  const sealH = 38;
  const cadena =
    `||1.1|${cfdi.timbre.uuid}|${cfdi.timbre.fechaTimbrado}|${cfdi.timbre.rfcProvCertif || ""}|` +
    `${cfdi.timbre.selloCFD || cfdi.sello || ""}|${cfdi.timbre.selloSAT || ""}||`;
  let y = startY;
  y = drawFlatSealBox(doc, MARGIN, y, CONTENT_W, "Cadena Original", cadena, sealH);
  y = drawFlatSealBox(
    doc,
    MARGIN,
    y + 2,
    CONTENT_W,
    "Sello Digital",
    cfdi.sello || cfdi.timbre.selloCFD || "",
    sealH,
  );
  y = drawFlatSealBox(doc, MARGIN, y + 2, CONTENT_W, "Timbre Fiscal Digital", cfdi.timbre.selloSAT || "", sealH);
  return y + 4;
}

export function drawHorizontalRule(doc: PdfDoc, x: number, y: number, w: number) {
  doc.moveTo(x, y).lineTo(x + w, y).lineWidth(0.5).stroke(BLACK);
  doc.lineWidth(1);
}

export function drawCfdiFooter(doc: PdfDoc, page: number, totalPages: number) {
  const footerY = PAGE_H - MARGIN - 8;
  doc.fontSize(7).fillColor(BLACK);
  doc.text("Este documento es una representacion impresa de un CFDI", MARGIN, footerY - 18, {
    width: CONTENT_W,
    align: "center",
  });
  const linkY = footerY - 8;
  const linkW = doc.widthOfString(GG_LINK_TEXT) + 4;
  const linkX = (PAGE_W - linkW) / 2;
  doc.fillColor(BLUE).text(GG_LINK_TEXT, linkX, linkY, { underline: true, link: GG_URL });
  doc.fillColor(BLACK);
  doc.text(`Página ${page} de ${totalPages}`, MARGIN, footerY, { width: CONTENT_W, align: "right" });
}

/** Escribe pies de página estilo Sicofi (cada hoja muestra "Página 1 de 1"). */
export function drawAllCfdiFootersSicofi(doc: PdfDoc): void {
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    drawCfdiFooter(doc, 1, 1);
  }
}

/** Escribe pies de página en todas las hojas usando el conteo real (requiere `bufferPages: true`). */
export function drawAllCfdiFooters(doc: PdfDoc): void {
  drawAllCfdiFootersSicofi(doc);
}

export async function drawSellosYQr(
  doc: PdfDoc,
  cfdi: ParsedCfdi,
  startY: number,
): Promise<number> {
  const qrW = 110;
  const sealsW = CONTENT_W - qrW - 8;
  const sealH = 50;
  let y = startY;

  const cadena =
    `||1.1|${cfdi.timbre.uuid}|${cfdi.timbre.fechaTimbrado}|${cfdi.timbre.rfcProvCertif || ""}|` +
    `${cfdi.timbre.selloCFD || ""}|${cfdi.timbre.selloSAT || ""}||`;

  y = drawFlatSealBox(
    doc,
    MARGIN,
    y,
    sealsW,
    "Cadena original del complemento de certificación digital del SAT",
    cadena,
    sealH,
  );
  y = drawFlatSealBox(
    doc,
    MARGIN,
    y + 2,
    sealsW,
    "Sello digital del emisor",
    cfdi.sello || cfdi.timbre.selloCFD || "",
    sealH,
  );
  y = drawFlatSealBox(doc, MARGIN, y + 2, sealsW, "Sello digital del SAT", cfdi.timbre.selloSAT || "", sealH);

  const qrUrl = buildSatQrUrl({
    uuid: cfdi.timbre.uuid,
    rfcEmisor: cfdi.emisor.rfc,
    rfcReceptor: cfdi.receptor.rfc,
    total: cfdi.total,
    selloCfd: cfdi.sello || cfdi.timbre.selloCFD || "",
  });
  const qrDataUrl = await QRCode.toDataURL(qrUrl, { margin: 0, width: 200 });
  const qrBase64 = qrDataUrl.replace(/^data:image\/png;base64,/, "");
  const qrBuf = Buffer.from(qrBase64, "base64");
  doc.image(qrBuf, PAGE_W - MARGIN - qrW, startY, { fit: [qrW, qrW] });

  return y + 4;
}
