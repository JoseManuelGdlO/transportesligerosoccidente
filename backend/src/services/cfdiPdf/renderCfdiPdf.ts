import { existsSync } from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import type { Tenant } from "../../models";
import { uploadRootDir } from "../../middlewares/uploadDocument";
import { getClaveProducto } from "../satCatalogService";
import {
  formatDomicilio,
  formatDomicilioCartaPorte,
  parseCfdiXml,
  type ParsedCfdi,
  type CfdiAutotransporte,
  type CfdiCartaPorte,
  type CfdiConcepto,
  type CfdiMercancia,
  type CfdiUbicacion,
} from "./parseCfdiXml";
import {
  BLACK,
  BLUE,
  CONTENT_L,
  CONTENT_R,
  CONTENT_W,
  GG_LINK_TEXT,
  GG_URL,
  GRAY,
  GRID,
  PAGE_H,
  PURPLE,
  RED,
  WHITE,
  blockHeight,
  box,
  cadenaOriginal,
  centerTop,
  drawCell,
  drawCellRow,
  drawColumnField,
  drawGrayBar,
  drawInlineField,
  drawPanel,
  drawPanelFrame,
  drawPlainSeal,
  drawPurpleBand,
  drawPurpleCell,
  drawPurpleSeal,
  drawQr,
  drawStackedCell,
  drawValueCell,
  hRule,
  line,
  lineCount,
  measure,
  text,
  textCenter,
  textRight,
  type PdfDoc,
} from "./pdfLayout";
import { catalogDescription, formatCatalogCode } from "./satCatalogLabels";
import { numeroEnLetra } from "./numeroEnLetra";

type CatalogLookup = Record<string, string>;

/** Interlínea Sicofi para cuerpos de 7 pt en tablas y descripciones. */
const LEAD_7 = 8.05;

/** Geometría de la hoja fiscal (página 1 de la plantilla Sicofi). */
const P1 = {
  logo: { x: 21, y: 20, w: 198, h: 98 },
  invoice: { x: 371, y: 20, w: 221, h: 95, headerH: 18 },
  lugarExpedicion: { x: 295, top: 118.4 },
  emisor: { x: 20, y: 123, w: 265, h: 53, headerH: 15, textX: 28, top: 141.7, pitch: 11 },
  cert: {
    x: 293,
    y: 141,
    w: 299,
    h: 35,
    headerH: 21,
    cols: [
      [299, 374],
      [374, 484],
      [484, 586],
    ] as [number, number][],
    valueSizes: [6, 6, 5],
  },
  receptor: {
    x: 20,
    y: 182,
    w: 572,
    h: 71,
    headerH: 15,
    leftX: 29,
    leftTops: [200, 213, 228],
    rightEdge: 587,
    rightTops: [200, 213],
  },
  conceptos: { y: 253, headerH: 14, xs: [20, 70, 149, 452, 522, 592], minRowH: 25 },
  totals: { labelX: 369, labelW: 106, valueX: 475, valueW: 115, rowH: 12, gapAfterTable: 16 },
  letra: { x: 23, labelOffset: 4, valueOffset: 12.8, referenciaOffset: 4.35 },
  seals: { x: 21, w: 389, y: 581, heights: [58, 44, 56], gap: 2 },
  metodoOffsets: [-22.1, -13.3],
  qr: { x: 423, dy: -8, size: 170 },
  footer: { docTop: 745.8, linkTop: 759.1, pageTop: 759.8, pageRight: 562, linkCenterRight: 466 },
};

/** Geometría de la hoja Carta Porte (página 2 de la plantilla Sicofi). */
const P2 = {
  logo: { x: 20, y: 35, w: 160, h: 79 },
  center: { x: 182, w: 236 },
  meta: { right: 591, narrowLeft: 437, wideLeft: 308 },
  title: { y: 138, h: 15 },
  fields: { cols: [22, 212, 402], top: 155.4, pitch: 12 },
  ubicacion: {
    cols: [
      [22, 208],
      [212, 398],
      [402, 590],
    ] as [number, number][],
    pitch: 8.8,
    rows: 4,
    domicilioGap: 3,
    domicilioH: 11,
    domicilioLabelW: 68,
  },
  mercancias: {
    summaryXs: [20, 105, 190, 290, 390, 490, 592],
    summaryH: 17,
    detailXs: [20, 102, 197, 442, 492, 542, 592],
    rowH: 10,
    pesoX: 404,
    gapAfter: 18,
  },
  cantidadTransporta: { xs: [20, 163, 306, 449, 592], headerH: 10, rowH: 18 },
  autotransporte: {
    permXs: [20, 106, 306, 419, 592],
    identXs: [20, 163, 592],
    rowH: 11,
    segurosH: 35,
    segurosSplit: 306,
    segurosPitch: LEAD_7,
    leftEdge: 304,
    rightEdge: 590,
  },
  figura: {
    xs: [20, 96, 219, 362, 592],
    rowH: 11,
    extraXs: [20, 115, 306, 412, 592],
    partesXs: [20, 176, 592],
    gapBefore: 12,
  },
  seals: { x: 20, w: 418, tops: [566, 608, 651], labelH: 10, bodyH: 33 },
  qr: { x: 447, y: 566, size: 128 },
  footer: { docTop: 761.5, pageTop: 759.8, pageRight: 562 },
  contentBottom: 556,
};

function tipoLabel(tipo: string): string {
  if (tipo === "I" || tipo === "FA") return "I - Factura";
  if (tipo === "T") return "T - Traslado";
  return `${tipo} - Comprobante`;
}

function fmtMoney(n: string | number, moneda?: string, decimals = 2): string {
  const v = typeof n === "string" ? parseFloat(n) : n;
  if (Number.isNaN(v)) return String(n);
  const formatted = v.toLocaleString("es-MX", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return moneda ? `${formatted} ${moneda}` : formatted;
}

function impuestoLabel(code: string): string {
  if (code === "002") return "IVA";
  if (code === "001") return "ISR";
  return code;
}

function fmtCantidad(n: string): string {
  const v = parseFloat(n);
  if (Number.isNaN(v)) return n;
  return v.toLocaleString("es-MX", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
}

function impuestoTotalLabel(tipo: "traslado" | "retencion", impuesto: string, tasa?: string): string {
  const base = impuestoLabel(impuesto);
  const suffix = tipo === "retencion" ? "R" : "T";
  return tasa ? `${base}${suffix} ${tasa}` : `${base}${suffix}`;
}

async function loadTenantLogo(tenant: Tenant): Promise<Buffer | null> {
  const candidates = [tenant.pdf_trip_logo_path, tenant.pdf_logo_path].filter(Boolean) as string[];
  const { readFile } = await import("node:fs/promises");
  for (const rel of candidates) {
    const abs = path.join(uploadRootDir(), rel);
    if (existsSync(abs)) return readFile(abs);
  }
  return null;
}

async function buildCatalogLookup(cfdi: ParsedCfdi): Promise<CatalogLookup> {
  const claves = new Set<string>();
  for (const c of cfdi.conceptos) {
    if (c.claveProdServ) claves.add(c.claveProdServ);
  }
  for (const m of cfdi.cartaPorte?.mercancias ?? []) {
    if (m.bienesTransp) claves.add(m.bienesTransp);
  }
  const lookup: CatalogLookup = {};
  await Promise.all(
    [...claves].map(async (clave) => {
      try {
        const row = await getClaveProducto(clave);
        if (row?.descripcion) lookup[clave] = row.descripcion;
      } catch {
        /* ignore lookup errors */
      }
    }),
  );
  return lookup;
}

function conceptoClaveUnidad(c: CfdiConcepto): string {
  const clave = c.claveUnidad?.trim();
  if (!clave) return "";
  if (c.unidad?.trim()) return `${clave} - ${c.unidad.trim()}`;
  return formatCatalogCode(clave, "claveUnidad");
}

function conceptoClaveProdServLine(c: CfdiConcepto, lookup: CatalogLookup): string | null {
  const clave = c.claveProdServ?.trim();
  if (!clave) return null;
  const desc = lookup[clave] || catalogDescription(clave, "claveProdServ");
  return desc ? `ClaveProdServ - ${clave} - ${desc}` : `ClaveProdServ - ${clave}`;
}

/** Sicofi imprime primero la descripción del concepto y debajo la ClaveProdServ. */
function conceptoDescripcion(c: CfdiConcepto, lookup: CatalogLookup): string {
  return [c.descripcion?.trim(), conceptoClaveProdServLine(c, lookup)].filter(Boolean).join("\n");
}

/** Sicofi deja los campos sin dato en blanco. */
function val(v?: string | null): string {
  return v?.trim() || "";
}

function ubicacionPoloLabel(cp: CfdiCartaPorte): string {
  const parts = [cp.ubicacionPoloOrigen?.trim(), cp.ubicacionPoloDestino?.trim()].filter(Boolean);
  return parts.length > 0 ? parts.join(" - ") : "";
}

function regimenFiscalDescripcion(code?: string | null): string {
  const trimmed = (code ?? "").trim();
  if (!trimmed) return "";
  return catalogDescription(trimmed, "regimenFiscal") || trimmed;
}

function drawLogo(doc: PdfDoc, logo: Buffer | null, x: number, y: number, w: number, h: number): void {
  if (logo) {
    try {
      doc.image(logo, x, y, { fit: [w, h] });
      return;
    } catch {
      /* fallback a texto */
    }
  }
  text(doc, "TLO", x, y, { size: 22, bold: true });
  text(doc, "Transportes Ligeros de Occidente", x, y + 30, { size: 8, width: w });
}

function formatTenantDomicilioLine(tenant: Tenant | null | undefined, cfdi: ParsedCfdi): string {
  const parts: string[] = [];
  if (tenant?.calle_fiscal) parts.push(`Calle: ${tenant.calle_fiscal}`);
  if (tenant?.colonia_fiscal) parts.push(`Colonia: ${tenant.colonia_fiscal}`);
  if (tenant?.municipio_fiscal) {
    parts.push(`Localidad: ${tenant.municipio_fiscal}`);
    parts.push(`Municipio: ${tenant.municipio_fiscal}`);
  }
  if (tenant?.estado_fiscal) parts.push(`Estado: ${tenant.estado_fiscal}`);
  parts.push("Pais: MEX");
  const cp = tenant?.cp_fiscal || cfdi.lugarExpedicion;
  if (cp) parts.push(`Codigo Postal: ${cp}`);
  return parts.join(", ");
}

function drawInvoicePanel(doc: PdfDoc, cfdi: ParsedCfdi): void {
  const { x, y, w, h, headerH } = P1.invoice;
  drawPanel(doc, x, y, w, h, headerH, `${tipoLabel(cfdi.tipoDeComprobante)} - VERSIÓN ${cfdi.version}`, 8);
  textCenter(doc, cfdi.folio || "", x, x + w, 40.2, { size: 8, bold: true, color: RED });
  const rows = [
    { label: "No. de serie del CSD del emisor", value: val(cfdi.noCertificado), labelTop: 50.7, valueTop: 62 },
    { label: "Fecha y Hora de emisión", value: cfdi.fecha, labelTop: 71.7, valueTop: 83 },
    { label: "Folio Fiscal", value: cfdi.timbre.uuid, labelTop: 91.7, valueTop: 102 },
  ];
  for (const row of rows) {
    textCenter(doc, row.label, x, x + w, row.labelTop, { size: 8, bold: true });
    textCenter(doc, row.value, x + 3, x + w - 3, row.valueTop, { size: 6, bold: true, color: PURPLE });
  }
}

function drawEmisorPanel(doc: PdfDoc, cfdi: ParsedCfdi): void {
  const e = P1.emisor;
  drawPanel(doc, e.x, e.y, e.w, e.h, e.headerH, "Emisor", 8);
  const lines = [
    `RFC: ${cfdi.emisor.rfc}`,
    `Razón Social: ${cfdi.emisor.nombre}`,
    `Regimen Fiscal: ${formatCatalogCode(cfdi.emisor.regimenFiscal, "regimenFiscal")}`,
  ];
  lines.forEach((l, i) => {
    text(doc, l, e.textX, e.top + i * e.pitch, {
      size: 6,
      color: PURPLE,
      width: e.w - (e.textX - e.x) * 2,
      height: 9,
      ellipsis: true,
    });
  });
}

function drawCertPanel(doc: PdfDoc, cfdi: ParsedCfdi): void {
  const c = P1.cert;
  const bodyY = drawPanelFrame(doc, c.x, c.y, c.w, c.h, c.headerH);
  const titles = ["Fecha y hora de certificación", "No. de serie del CSD del SAT", "Forma de Pago"];
  const values = [
    cfdi.timbre.fechaTimbrado,
    val(cfdi.timbre.noCertificadoSAT),
    formatCatalogCode(cfdi.formaPago, "formaPago"),
  ];
  const bodyH = c.h - c.headerH;
  c.cols.forEach(([left, right], i) => {
    const titleLines = lineCount(doc, titles[i], right - left, 7, true);
    const titleTop = c.y + (c.headerH - titleLines * P2.ubicacion.pitch) / 2;
    textCenter(doc, titles[i], left, right, titleTop, {
      size: 7,
      bold: true,
      color: WHITE,
      leading: P2.ubicacion.pitch,
    });
    let size = c.valueSizes[i];
    while (size > 4 && measure(doc, values[i], size, true) > right - left - 4) size -= 0.5;
    textCenter(doc, values[i], left, right, centerTop(bodyY, bodyH, size), {
      size,
      bold: true,
      color: PURPLE,
    });
  });
}

function drawReceptorPanel(doc: PdfDoc, cfdi: ParsedCfdi): void {
  const r = P1.receptor;
  drawPanel(doc, r.x, r.y, r.w, r.h, r.headerH, "Receptor", 8);
  const left = [
    `RFC: ${cfdi.receptor.rfc}`,
    `Razón Social: ${cfdi.receptor.nombre}`,
    `Uso de CFDI: ${formatCatalogCode(cfdi.receptor.usoCFDI, "usoCfdi")}`,
  ];
  left.forEach((l, i) => {
    text(doc, l, r.leftX, r.leftTops[i], { size: 7, color: PURPLE, width: 340 });
  });
  const right = [
    `Regimen Fiscal Receptor: ${
      cfdi.receptor.regimenFiscal ? formatCatalogCode(cfdi.receptor.regimenFiscal, "regimenFiscal") : ""
    }`,
    `Domicilio Fiscal Receptor: ${val(cfdi.receptor.domicilioFiscal)}`,
  ];
  right.forEach((l, i) => {
    textRight(doc, l, r.rightEdge, r.rightTops[i], { size: 7, color: PURPLE, width: 250 });
  });
}

function drawConceptosTable(doc: PdfDoc, cfdi: ParsedCfdi, lookup: CatalogLookup): number {
  const t = P1.conceptos;
  const xs = t.xs;
  drawPurpleBand(doc, CONTENT_L, t.y, CONTENT_W, t.headerH);
  const headers = ["Cantidad", "Clave Unidad", "Descripción", "Valor Unitario", "Importe"];
  headers.forEach((h, i) => {
    textCenter(doc, h, xs[i], xs[i + 1], centerTop(t.y, t.headerH, 8), { size: 8, bold: true, color: WHITE });
  });

  const descW = xs[3] - xs[2] - 4;
  let y = t.y + t.headerH;
  for (const c of cfdi.conceptos) {
    const desc = conceptoDescripcion(c, lookup);
    const rowH = Math.max(t.minRowH, lineCount(doc, desc, descW, 7) * LEAD_7);
    for (let i = 0; i < xs.length - 1; i++) {
      box(doc, xs[i], y, xs[i + 1] - xs[i], rowH, BLACK, 1);
    }
    const mid = centerTop(y, rowH, 7);
    textCenter(doc, fmtCantidad(c.cantidad), xs[0], xs[1], mid, { size: 7, color: PURPLE });
    textCenter(doc, conceptoClaveUnidad(c), xs[1], xs[2], mid, { size: 7, color: PURPLE });
    text(doc, desc, xs[2] + 2, y - 0.5, { size: 7, color: PURPLE, width: descW, leading: LEAD_7 });
    textRight(doc, fmtMoney(c.valorUnitario), xs[4] - 2, mid, { size: 7, color: PURPLE, width: xs[4] - xs[3] - 4 });
    textRight(doc, fmtMoney(c.importe), xs[5] - 2, mid, { size: 7, color: PURPLE, width: xs[5] - xs[4] - 4 });
    y += rowH;
  }
  return y;
}

function drawTotales(doc: PdfDoc, cfdi: ParsedCfdi, y: number): number {
  const t = P1.totals;
  const rows: [string, string][] = [["Subtotal", fmtMoney(cfdi.subTotal, cfdi.moneda)]];
  for (const i of cfdi.impuestos) {
    rows.push([impuestoTotalLabel(i.tipo, i.impuesto, i.tasaOCuota), fmtMoney(i.importe, cfdi.moneda)]);
  }
  rows.push(["Total", fmtMoney(cfdi.total, cfdi.moneda)]);

  let ty = y;
  rows.forEach(([label, value], i) => {
    const last = i === rows.length - 1;
    drawPurpleCell(doc, t.labelX, ty, t.labelW, t.rowH, BLACK);
    drawValueCell(doc, t.valueX, ty, t.valueW, t.rowH, last ? BLACK : PURPLE);
    const mid = centerTop(ty, t.rowH, 7);
    textRight(doc, label, t.valueX - 3, mid, { size: 7, color: WHITE, width: t.labelW - 6 });
    textRight(doc, value, t.valueX + t.valueW - 2, mid, { size: 7, color: PURPLE, width: t.valueW - 4 });
    ty += t.rowH;
  });

  const total = parseFloat(cfdi.total);
  const letra = Number.isNaN(total) ? "" : numeroEnLetra(total, cfdi.moneda || "MXN");
  const letraW = t.labelX - P1.letra.x - 8;
  text(doc, "TOTAL EN LETRA:", P1.letra.x, y + P1.letra.labelOffset, { size: 7, bold: true });
  text(doc, letra, P1.letra.x, y + P1.letra.valueOffset, { size: 7, bold: true, width: letraW, leading: LEAD_7 });
  let letraBottom = y + P1.letra.valueOffset + blockHeight(doc, letra, letraW, 7, LEAD_7, true);

  const referencias = [...new Set(cfdi.conceptos.map((c) => c.noIdentificacion?.trim()).filter(Boolean))].join(" / ");
  if (referencias) {
    text(doc, referencias, P1.letra.x, letraBottom + P1.letra.referenciaOffset, { size: 6, width: letraW });
    letraBottom += P1.letra.referenciaOffset + 8.3;
  }
  return Math.max(ty, letraBottom);
}

function drawPage1Footer(doc: PdfDoc): void {
  const f = P1.footer;
  textCenter(doc, "Este documento es una representacion impresa de un CFDI", CONTENT_L, CONTENT_R, f.docTop, {
    size: 8,
    color: PURPLE,
  });
  textCenter(doc, GG_LINK_TEXT, CONTENT_L, f.linkCenterRight, f.linkTop, {
    size: 9,
    color: BLUE,
    underline: true,
    link: GG_URL,
  });
}

async function renderPage1(
  doc: PdfDoc,
  cfdi: ParsedCfdi,
  logo: Buffer | null,
  lookup: CatalogLookup,
): Promise<void> {
  drawLogo(doc, logo, P1.logo.x, P1.logo.y, P1.logo.w, P1.logo.h);
  drawInvoicePanel(doc, cfdi);
  text(doc, `Lugar de expedición: ${cfdi.lugarExpedicion}`, P1.lugarExpedicion.x, P1.lugarExpedicion.top, {
    size: 7,
    bold: true,
  });
  drawEmisorPanel(doc, cfdi);
  drawCertPanel(doc, cfdi);
  drawReceptorPanel(doc, cfdi);

  let y = P1.conceptos.y + P1.conceptos.headerH;
  const isIngreso = cfdi.tipoDeComprobante === "I" || cfdi.tipoDeComprobante === "FA";
  if (isIngreso && cfdi.conceptos.length > 0) {
    y = drawConceptosTable(doc, cfdi, lookup);
    y = drawTotales(doc, cfdi, y + P1.totals.gapAfterTable);
  }

  let sealsY = P1.seals.y;
  if (y > sealsY - 26) {
    drawPage1Footer(doc);
    doc.addPage();
    sealsY = 60;
  }

  const pagos = [
    cfdi.metodoPago ? `Método de Pago: ${formatCatalogCode(cfdi.metodoPago, "metodoPago")}` : "",
    cfdi.condicionesDePago ? `Condiciones de Pago: ${cfdi.condicionesDePago}` : "",
  ].filter(Boolean);
  pagos.forEach((p, i) => {
    text(doc, p, P1.letra.x, sealsY + P1.metodoOffsets[i], { size: 7 });
  });

  await drawQr(doc, cfdi, P1.qr.x, sealsY + P1.qr.dy, P1.qr.size);

  const titles = [
    "Cadena original del complemento de certificación digital del SAT",
    "Sello digital del emisor",
    "Sello digital del SAT",
  ];
  const contents = [
    cadenaOriginal(cfdi),
    cfdi.sello || cfdi.timbre.selloCFD || "",
    cfdi.timbre.selloSAT || "",
  ];
  let sy = sealsY;
  P1.seals.heights.forEach((h, i) => {
    drawPurpleSeal(doc, P1.seals.x, sy, P1.seals.w, h, titles[i], contents[i]);
    sy += h + P1.seals.gap;
  });

  drawPage1Footer(doc);
}

function drawPage2Header(
  doc: PdfDoc,
  cfdi: ParsedCfdi,
  cp: CfdiCartaPorte,
  tenant: Tenant | null | undefined,
  logo: Buffer | null,
): number {
  drawLogo(doc, logo, P2.logo.x, P2.logo.y, P2.logo.w, P2.logo.h);

  const { x: cx, w: cw } = P2.center;
  const nombre = tenant?.razon_social || cfdi.emisor.nombre;
  text(doc, nombre, cx, 19.9, { size: 10, bold: true, width: cw, leading: 13.8 });
  text(doc, `R.F.C. ${tenant?.rfc || cfdi.emisor.rfc}`, cx, 34.4, { size: 7, bold: true, width: cw });
  const domicilio = formatTenantDomicilioLine(tenant, cfdi);
  const pitch = P2.ubicacion.pitch;
  let cy = 47.6;
  text(doc, domicilio, cx, cy, { size: 7, bold: true, width: cw, leading: pitch });
  cy += lineCount(doc, domicilio, cw, 7, true) * pitch + 4.4;
  text(doc, `Lugar de Expedición: ${cfdi.lugarExpedicion}`, cx, cy, { size: 7, bold: true, width: cw });
  cy += 14;
  text(doc, `Regimen Fiscal: ${regimenFiscalDescripcion(tenant?.regimen_fiscal || cfdi.emisor.regimenFiscal)}`, cx, cy, {
    size: 7,
    bold: true,
    width: cw,
  });

  const m = P2.meta;
  const metaRows = [
    { value: "Factura Número", size: 8, top: 35.2, ruleY: 46, left: m.narrowLeft },
    { value: val(cfdi.folio), size: 8, top: 46.2, ruleY: 57, left: m.narrowLeft },
    { value: "UUID", size: 8, top: 58.2, ruleY: 69, left: m.narrowLeft },
    { value: cfdi.timbre.uuid, size: 6, top: 70.5, ruleY: 80, left: m.narrowLeft },
    { value: "Fecha y Hora de emisión", size: 8, top: 81.2, ruleY: 92, left: m.narrowLeft },
    { value: cfdi.fecha, size: 8, top: 93.2, ruleY: 104, left: m.narrowLeft },
    {
      value: `No. de serie del CSD del SAT: ${val(cfdi.timbre.noCertificadoSAT)}`,
      size: 7,
      top: 105.9,
      ruleY: 116,
      left: m.wideLeft,
    },
    {
      value: `No. de serie del CSD del emisor: ${val(cfdi.noCertificado)}`,
      size: 7,
      top: 116.9,
      ruleY: 127,
      left: m.wideLeft,
    },
    {
      value: `Fecha de certificación: ${cfdi.timbre.fechaTimbrado}`,
      size: 7,
      top: 127.9,
      ruleY: 138,
      left: m.wideLeft,
    },
  ];
  for (const row of metaRows) {
    textRight(doc, row.value, m.right, row.top, { size: row.size, bold: true, width: m.right - row.left });
    hRule(doc, row.left, row.ruleY, m.right - row.left, BLACK, 0.5);
  }

  const t = P2.title;
  hRule(doc, CONTENT_L, t.y, CONTENT_W, BLACK, 0.5);
  hRule(doc, CONTENT_L, t.y + t.h, CONTENT_W, BLACK, 0.5);
  line(doc, CONTENT_L, t.y, CONTENT_L, t.y + t.h, BLACK, 0.5);
  line(doc, CONTENT_R, t.y, CONTENT_R, t.y + t.h, BLACK, 0.5);
  textCenter(doc, `Complemento Carta Porte Version ${cp.version}`, CONTENT_L, CONTENT_R, t.y + 0.9, {
    size: 10,
    bold: true,
  });
  return t.y + t.h;
}

function drawCartaPorteFields(doc: PdfDoc, cp: CfdiCartaPorte): number {
  const f = P2.fields;
  const rows: [string, string][][] = [
    [
      ["IdCCP", val(cp.idCCP)],
      ["Entrada Salida Merc", val(cp.entradaSalidaMerc)],
      ["Total Dist Rec", val(cp.totalDistRec)],
    ],
    [
      ["Transp Internac", val(cp.transpInternac)],
      ["Pais origen - Destino", val(cp.paisOrigenDestino)],
      ["Registro ISTMO", val(cp.registroISTMO)],
    ],
    [
      ["Via Entrada Salida", val(cp.viaEntradaSalida)],
      ["Ubicación Origen - Destino", ubicacionPoloLabel(cp)],
    ],
    [["Regimenes Aduaneros", val(cp.regimenesAduaneros.filter(Boolean).join(", "))]],
  ];
  rows.forEach((row, r) => {
    row.forEach(([label, value], c) => {
      drawInlineField(doc, f.cols[c], f.top + r * f.pitch, label, value);
    });
  });
  return f.top + rows.length * f.pitch - 1.4;
}

function drawUbicacion(doc: PdfDoc, y: number, u: CfdiUbicacion): number {
  const g = P2.ubicacion;
  const columns: [string, string][][] = [
    [
      ["Tipo Ubicacion", val(u.tipoUbicacion)],
      ["ID Ubicacion", val(u.idUbicacion)],
      ["RFC Remitente Destinatario", val(u.rfcRemitenteDestinatario)],
      ["Nombre", val(u.nombreRemitenteDestinatario)],
    ],
    [
      ["NumRegIdTrib", val(u.numRegIdTrib)],
      ["Residencia Fiscal", val(u.residenciaFiscal)],
      ["Num Estacion", val(u.numEstacion)],
      ["Nombre Estacion", val(u.nombreEstacion)],
    ],
    [
      ["Navegacion Trafico", val(u.navegacionTrafico)],
      ["Fecha Hora Salida Llegada", val(u.fechaHoraSalidaLlegada)],
      ["Tipo Estacion", val(u.tipoEstacion)],
      ["Distancia Recorrida", val(u.distanciaRecorrida)],
    ],
  ];
  const top = y - 0.2;
  columns.forEach((fields, c) => {
    const [left, right] = g.cols[c];
    fields.forEach(([label, value], r) => {
      drawColumnField(doc, left, right, top + r * g.pitch, label, value);
    });
  });

  const domY = top + g.rows * g.pitch + g.domicilioGap;
  const domicilio = u.domicilio ? formatDomicilioCartaPorte(u.domicilio) : "";
  drawCell(doc, CONTENT_L, domY, g.domicilioLabelW, g.domicilioH, "Domicilio:", {
    fill: GRAY,
    align: "left",
    bold: true,
  });
  drawCell(doc, CONTENT_L + g.domicilioLabelW, domY, CONTENT_R - CONTENT_L - g.domicilioLabelW, g.domicilioH, domicilio, {
    align: "left",
    bold: true,
  });
  return domY + g.domicilioH;
}

function mercanciaRow(m: CfdiMercancia): string[] {
  return [
    val(m.bienesTransp),
    val(m.claveSTCC),
    val(m.descripcion),
    m.cantidad ? fmtCantidad(m.cantidad) : "",
    val(m.claveUnidad),
    val(m.unidad),
  ];
}

function drawMercancias(doc: PdfDoc, y: number, cp: CfdiCartaPorte): number {
  const g = P2.mercancias;
  y = drawGrayBar(doc, y, 12, "Mercancias");
  const summary: [string, string][] = [
    ["Peso Bruto Total", val(cp.pesoBrutoTotal)],
    ["Unidad Peso", cp.unidadPeso ? formatCatalogCode(cp.unidadPeso, "claveUnidad", { codeOnly: true }) : ""],
    ["Peso Neto Total", val(cp.pesoNetoTotal)],
    ["Num Total Mercancias", val(cp.numTotalMercancias)],
    ["Cargo Por Tasacion", val(cp.cargoPorTasacion)],
    ["Recolección - Devolución", val(cp.logisticaInversaRecoleccionDevolucion)],
  ];
  summary.forEach(([label, value], i) => {
    drawStackedCell(
      doc,
      g.summaryXs[i],
      y,
      g.summaryXs[i + 1] - g.summaryXs[i],
      g.summaryH,
      label,
      value,
    );
  });
  y += g.summaryH;

  y = drawCellRow(
    doc,
    g.detailXs,
    y,
    g.rowH,
    ["Bienes Transp", "Clave STCC", "Descripcion", "Cantidad", "Clave Unidad", "Unidad"],
    { fill: GRAY, bold: true },
  );
  const rows = cp.mercancias.length > 0 ? cp.mercancias.map(mercanciaRow) : [["", "", "", "", "", ""]];
  for (const row of rows) {
    y = drawCellRow(doc, g.detailXs, y, g.rowH, row, { bold: true });
  }

  const pesoKg = cp.mercancias.find((m) => m.pesoEnKg)?.pesoEnKg || cp.pesoBrutoTotal;
  if (pesoKg) text(doc, `Peso En Kg ${pesoKg}`, g.pesoX, y, { size: 7, bold: true });
  return y + g.gapAfter;
}

function drawCantidadTransporta(doc: PdfDoc, y: number, cp: CfdiCartaPorte): number {
  const g = P2.cantidadTransporta;
  y = drawGrayBar(doc, y, g.headerH, "Cantidad Transporta");
  y = drawCellRow(doc, g.xs, y, g.headerH, ["Cantidad", "ID Origen", "ID. Destino", "Cves Transporte"], {
    fill: GRAY,
    bold: true,
  });
  const items = cp.mercancias.flatMap((m) => m.cantidadTransporta ?? []);
  const rows =
    items.length > 0 ? items.map((ct) => [val(ct.cantidad), val(ct.idOrigen), val(ct.idDestino), ""]) : [["", "", "", ""]];
  for (const row of rows) {
    y = drawCellRow(doc, g.xs, y, g.rowH, row, { bold: true, align: ["left", "center", "center", "center"] });
  }
  return y;
}

function identificacionVehicularLine(a: CfdiAutotransporte): string {
  const parts = [
    a.configVehicular?.trim() ? `Config Vehicula: ${a.configVehicular.trim()}` : "",
    a.placaVM?.trim() ? `Placa VM: ${a.placaVM.trim()}` : "",
    a.anioModeloVM?.trim() ? `Año Modelo VM: ${a.anioModeloVM.trim()}` : "",
    a.pesoBrutoVehicular?.trim() ? `Peso Bruto Vehicular: ${a.pesoBrutoVehicular.trim()}` : "",
  ].filter(Boolean);
  return parts.join(", ");
}

function drawAutotransporte(doc: PdfDoc, y: number, a: CfdiAutotransporte | undefined): number {
  const g = P2.autotransporte;
  y = drawGrayBar(doc, y, g.rowH, "Autotransporte", false);

  const permValues = ["Perm SCT", val(a?.permSCT), "Num Permiso SCT", val(a?.numPermisoSCT)];
  g.permXs.slice(0, -1).forEach((x, i) => {
    drawCell(doc, x, y, g.permXs[i + 1] - x, g.rowH, permValues[i], {
      fill: i % 2 === 0 ? GRAY : undefined,
      align: i === 0 ? "left" : "center",
    });
  });
  y += g.rowH;

  drawCell(doc, g.identXs[0], y, g.identXs[1] - g.identXs[0], g.rowH, "Identificacion Vehicular", {
    fill: GRAY,
    align: "left",
  });
  drawCell(doc, g.identXs[1], y, g.identXs[2] - g.identXs[1], g.rowH, a ? identificacionVehicularLine(a) : "", {
    align: "left",
  });
  y += g.rowH;

  box(doc, CONTENT_L, y, CONTENT_W, g.segurosH, GRID, 0.5);
  line(doc, g.segurosSplit, y, g.segurosSplit, y + g.segurosH, GRID, 0.5);
  const left: [string, string][] = [
    ["Asegura Resp Civil", val(a?.aseguraRespCivil)],
    ["Poliza Resp Civil", val(a?.polizaRespCivil)],
    ["Asegura Med Ambiente", val(a?.aseguraMedAmbiente)],
    ["Poliza Med Ambiente", val(a?.polizaMedAmbiente)],
  ];
  const right: [string, string][] = [
    ["Asegura Carga", val(a?.aseguraCarga)],
    ["Poliza Carga", val(a?.polizaCarga)],
    ["Prima Seguro", val(a?.primaSeguro)],
  ];
  left.forEach(([label, value], i) => {
    drawColumnField(doc, CONTENT_L + 2, g.leftEdge, y + 0.4 + i * g.segurosPitch, label, value, {
      labelBold: false,
    });
  });
  right.forEach(([label, value], i) => {
    drawColumnField(doc, g.segurosSplit + 2, g.rightEdge, y - 1 + i * g.segurosPitch, label, value, {
      labelBold: false,
    });
  });
  return y + g.segurosH;
}

function drawFiguraTransporte(doc: PdfDoc, y: number, cp: CfdiCartaPorte): number {
  const g = P2.figura;
  y = drawGrayBar(doc, y + g.gapBefore, g.rowH, "Figura Transporte", false);
  y = drawCellRow(doc, g.xs, y, g.rowH, ["Tipo Figura", "RFC Figura", "Num Licencia", "Nombre Figura"], {
    fill: GRAY,
  });
  const figuras = cp.figuras.length > 0 ? cp.figuras : [{}];
  for (const f of figuras) {
    y = drawCellRow(doc, g.xs, y, g.rowH, [
      val(f.tipoFigura),
      val(f.rfcFigura),
      val(f.numLicencia),
      val(f.nombreFigura),
    ]);
  }
  const first = figuras[0];
  const extras: [string, string][] = [
    ["Num Reg IdTrib Figura", val(first.numRegIdTribFigura)],
    ["Residencia Fiscal Figura", val(first.residenciaFiscalFigura)],
  ];
  extras.forEach(([label, value], i) => {
    const lx = g.extraXs[i * 2];
    const vx = g.extraXs[i * 2 + 1];
    drawCell(doc, lx, y, vx - lx, g.rowH, label, { fill: GRAY });
    drawCell(doc, vx, y, g.extraXs[i * 2 + 2] - vx, g.rowH, value);
  });
  y += g.rowH;
  y = drawCellRow(doc, g.partesXs, y, g.rowH, ["Partes Transporte", "Domicilio"], { fill: GRAY });
  y = drawCellRow(doc, g.partesXs, y, g.rowH, [
    val(first.partesTransporte),
    first.domicilio ? formatDomicilio(first.domicilio) : "",
  ]);
  return y;
}

function drawPage2Seals(doc: PdfDoc, cfdi: ParsedCfdi, offset: number): void {
  const g = P2.seals;
  const titles = ["Cadena Original", "Sello Digital", "Timbre Fiscal Digital"];
  const contents = [
    cadenaOriginal(cfdi),
    cfdi.sello || cfdi.timbre.selloCFD || "",
    cfdi.timbre.selloSAT || "",
  ];
  titles.forEach((title, i) => {
    drawPlainSeal(doc, g.x, g.tops[i] + offset, g.w, g.labelH, g.bodyH, title, contents[i]);
  });
}

function drawPage2Footer(doc: PdfDoc): void {
  const f = P2.footer;
  textCenter(doc, "Este documento es una representacion impresa de un CFDI", CONTENT_L, CONTENT_R - 2, f.docTop, {
    size: 6,
    bold: true,
  });
}

/**
 * Sicofi numera cada sección por separado (la hoja fiscal y el complemento Carta
 * Porte arrancan en "Página 1 de N"), por eso se sella al final con las páginas
 * ya bufferizadas.
 */
function stampPageNumbers(doc: PdfDoc, fiscalPages: number, totalPages: number): void {
  const sections = [
    { start: 0, count: fiscalPages, footer: P1.footer, color: PURPLE },
    { start: fiscalPages, count: totalPages - fiscalPages, footer: P2.footer, color: BLACK },
  ];
  for (const s of sections) {
    for (let i = 0; i < s.count; i++) {
      doc.switchToPage(s.start + i);
      textRight(doc, `Página ${i + 1} de  ${s.count}`, s.footer.pageRight, s.footer.pageTop, {
        size: 8,
        width: 120,
        color: s.color,
      });
    }
  }
}

async function renderPage2(
  doc: PdfDoc,
  cfdi: ParsedCfdi,
  cp: CfdiCartaPorte,
  tenant: Tenant | null | undefined,
  logo: Buffer | null,
): Promise<void> {
  let y = drawPage2Header(doc, cfdi, cp, tenant, logo);
  y = drawCartaPorteFields(doc, cp);

  const ensureSpace = (needed: number) => {
    if (y + needed <= P2.contentBottom) return;
    drawPage2Footer(doc);
    doc.addPage();
    y = 40;
    text(doc, "Complemento Carta Porte (continuación)", CONTENT_L, y, { size: 8, bold: true });
    y += 18;
  };

  ensureSpace(60);
  y = drawGrayBar(doc, y, 11, "Ubicaciones");
  for (const u of cp.ubicaciones) {
    ensureSpace(52);
    y = drawUbicacion(doc, y, u);
  }

  ensureSpace(29 + Math.max(cp.mercancias.length, 1) * 10 + 18);
  y = drawMercancias(doc, y, cp);

  const ctRows = Math.max(cp.mercancias.flatMap((m) => m.cantidadTransporta ?? []).length, 1);
  ensureSpace(20 + ctRows * P2.cantidadTransporta.rowH);
  y = drawCantidadTransporta(doc, y, cp);

  ensureSpace(68);
  y = drawAutotransporte(doc, y, cp.autotransporte);

  ensureSpace(12 + 11 * (4 + Math.max(cp.figuras.length, 1)));
  y = drawFiguraTransporte(doc, y, cp);

  if (y > P2.seals.tops[0]) {
    drawPage2Footer(doc);
    doc.addPage();
    drawPage2Seals(doc, cfdi, 40 - P2.seals.tops[0]);
    await drawQr(doc, cfdi, P2.qr.x, 40, P2.qr.size);
  } else {
    drawPage2Seals(doc, cfdi, 0);
    await drawQr(doc, cfdi, P2.qr.x, P2.qr.y, P2.qr.size);
  }
  drawPage2Footer(doc);
}

/** Genera el PDF fiscal (CFDI + Carta Porte) a partir del XML timbrado. */
export async function renderCfdiPdfFromXml(xml: string, tenant?: Tenant | null): Promise<Buffer> {
  const cfdi = parseCfdiXml(xml);
  const lookup = await buildCatalogLookup(cfdi);
  const logo = tenant ? await loadTenantLogo(tenant) : null;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: [612, PAGE_H], margin: 0, autoFirstPage: true, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    void (async () => {
      try {
        await renderPage1(doc, cfdi, logo, lookup);
        const fiscalPages = doc.bufferedPageRange().count;
        if (cfdi.cartaPorte) {
          doc.addPage();
          await renderPage2(doc, cfdi, cfdi.cartaPorte, tenant, logo);
        }
        stampPageNumbers(doc, fiscalPages, doc.bufferedPageRange().count);
        doc.end();
      } catch (e) {
        reject(e);
      }
    })();
  });
}
