import { existsSync } from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import type { Tenant } from "../../models";
import { uploadRootDir } from "../../middlewares/uploadDocument";
import { buildSatQrUrl } from "./buildQrUrl";
import { numeroEnLetra } from "./numeroEnLetra";
import {
  formatDomicilio,
  parseCfdiXml,
  type ParsedCfdi,
  type CfdiCartaPorte,
} from "./parseCfdiXml";

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 36;
const CONTENT_W = PAGE_W - MARGIN * 2;

const BLACK: [number, number, number] = [0, 0, 0];
const WHITE: [number, number, number] = [255, 255, 255];
const GRAY_HEADER: [number, number, number] = [200, 200, 200];
const RED: [number, number, number] = [200, 0, 0];

function tipoLabel(tipo: string): string {
  if (tipo === "I" || tipo === "FA") return "I - Factura";
  if (tipo === "T") return "T - Traslado";
  return `${tipo} - Comprobante`;
}

function fmtMoney(n: string | number, moneda?: string): string {
  const v = typeof n === "string" ? parseFloat(n) : n;
  if (Number.isNaN(v)) return String(n);
  const formatted = v.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  return moneda ? `${formatted} ${moneda}` : formatted;
}

function impuestoLabel(code: string): string {
  if (code === "002") return "IVA";
  if (code === "001") return "ISR";
  return code;
}

async function loadTenantLogo(tenant: Tenant): Promise<Buffer | null> {
  const rel = tenant.pdf_trip_logo_path;
  if (!rel) return null;
  const abs = path.join(uploadRootDir(), rel);
  if (!existsSync(abs)) return null;
  const { readFile } = await import("node:fs/promises");
  return readFile(abs);
}

type PdfDoc = InstanceType<typeof PDFDocument>;

function drawBoxHeader(doc: PdfDoc, x: number, y: number, w: number, h: number, title: string) {
  doc.rect(x, y, w, h).fillAndStroke(BLACK, BLACK);
  doc.fillColor(WHITE).fontSize(8).text(title, x + 4, y + 4, { width: w - 8 });
  doc.fillColor(BLACK);
}

function drawGrayBar(doc: PdfDoc, y: number, title: string): number {
  const h = 16;
  doc.rect(MARGIN, y, CONTENT_W, h).fillAndStroke(GRAY_HEADER, BLACK);
  doc.fillColor(BLACK).font("Helvetica-Bold").fontSize(9).text(title, MARGIN + 4, y + 4);
  doc.font("Helvetica");
  return y + h;
}

function drawSealBox(
  doc: PdfDoc,
  x: number,
  y: number,
  w: number,
  title: string,
  content: string,
  maxH: number,
): number {
  const headerH = 14;
  drawBoxHeader(doc, x, y, w, headerH, title);
  const bodyY = y + headerH;
  const bodyH = maxH - headerH;
  doc.rect(x, bodyY, w, bodyH).stroke(BLACK);
  doc.fontSize(5).text(content || "—", x + 3, bodyY + 3, { width: w - 6, lineGap: 0.5 });
  doc.font("Helvetica").fontSize(8);
  return y + maxH;
}

async function renderPage1(doc: PdfDoc, cfdi: ParsedCfdi, logo: Buffer | null): Promise<void> {
  let y = MARGIN;

  const headerRightW = 200;
  const logoW = 120;
  const logoH = 50;

  if (logo) {
    try {
      doc.image(logo, MARGIN, y, { fit: [logoW, logoH] });
    } catch {
      /* ignore bad image */
    }
  }

  const boxX = PAGE_W - MARGIN - headerRightW;
  drawBoxHeader(doc, boxX, y, headerRightW, 14, `${tipoLabel(cfdi.tipoDeComprobante)} - VERSIÓN ${cfdi.version}`);
  doc.rect(boxX, y + 14, headerRightW, 90).stroke(BLACK);
  doc
    .fillColor(RED)
    .font("Helvetica-Bold")
    .fontSize(22)
    .text(cfdi.folio || "—", boxX + 8, y + 20);
  doc.fillColor(BLACK).font("Helvetica").fontSize(7);
  let hy = y + 48;
  const metaLines = [
    `No. de serie del CSD del emisor: ${cfdi.noCertificado || "—"}`,
    `Fecha y Hora de emisión: ${cfdi.fecha}`,
    `Folio Fiscal: ${cfdi.timbre.uuid}`,
  ];
  for (const line of metaLines) {
    doc.text(line, boxX + 6, hy, { width: headerRightW - 12 });
    hy += 12;
  }

  y = Math.max(y + logoH + 4, hy + 4);
  doc.fontSize(8).text(`Lugar de expedición: ${cfdi.lugarExpedicion}`, MARGIN, y);
  y += 14;

  // Emisor
  const blockH = 52;
  drawBoxHeader(doc, MARGIN, y, CONTENT_W, 14, "Emisor");
  doc.rect(MARGIN, y + 14, CONTENT_W, blockH - 14).stroke(BLACK);
  doc.fontSize(8).text(`RFC: ${cfdi.emisor.rfc}`, MARGIN + 6, y + 18);
  doc.text(`Razón Social: ${cfdi.emisor.nombre}`, MARGIN + 6, y + 30);
  doc.text(`Regimen Fiscal: ${cfdi.emisor.regimenFiscal}`, MARGIN + 6, y + 42);
  y += blockH + 4;

  // Certificación row
  const colW = CONTENT_W / 3;
  const certH = 28;
  drawBoxHeader(doc, MARGIN, y, colW, 12, "Fecha y hora de certificación");
  drawBoxHeader(doc, MARGIN + colW, y, colW, 12, "No. de serie del CSD del SAT");
  drawBoxHeader(doc, MARGIN + colW * 2, y, colW, 12, "Forma de Pago");
  doc.rect(MARGIN, y + 12, colW, certH - 12).stroke(BLACK);
  doc.rect(MARGIN + colW, y + 12, colW, certH - 12).stroke(BLACK);
  doc.rect(MARGIN + colW * 2, y + 12, colW, certH - 12).stroke(BLACK);
  doc.fontSize(7).text(cfdi.timbre.fechaTimbrado, MARGIN + 4, y + 16, { width: colW - 8 });
  doc.text(cfdi.timbre.noCertificadoSAT || "—", MARGIN + colW + 4, y + 16, { width: colW - 8 });
  doc.text(cfdi.formaPago || "—", MARGIN + colW * 2 + 4, y + 16, { width: colW - 8 });
  y += certH + 4;

  // Receptor
  drawBoxHeader(doc, MARGIN, y, CONTENT_W, 14, "Receptor");
  doc.rect(MARGIN, y + 14, CONTENT_W, blockH - 14).stroke(BLACK);
  doc.fontSize(8);
  doc.text(`RFC: ${cfdi.receptor.rfc}`, MARGIN + 6, y + 18);
  doc.text(`Razón Social: ${cfdi.receptor.nombre}`, MARGIN + 6, y + 30);
  doc.text(`Uso de CFDI: ${cfdi.receptor.usoCFDI || "—"}`, MARGIN + 6, y + 42);
  const rx = MARGIN + CONTENT_W / 2;
  doc.text(`Regimen Fiscal Receptor: ${cfdi.receptor.regimenFiscal || "—"}`, rx, y + 18);
  doc.text(`Domicilio Fiscal Receptor: ${cfdi.receptor.domicilioFiscal || "—"}`, rx, y + 30);
  y += blockH + 4;

  const isIngreso = cfdi.tipoDeComprobante === "I" || cfdi.tipoDeComprobante === "FA";

  if (isIngreso && cfdi.conceptos.length > 0) {
    const cols = [
      { label: "Cantidad", w: 50 },
      { label: "Clave Unidad", w: 60 },
      { label: "Descripción", w: CONTENT_W - 50 - 60 - 70 - 70 },
      { label: "Valor Unitario", w: 70 },
      { label: "Importe", w: 70 },
    ];
    let cx = MARGIN;
    const th = 14;
    for (const col of cols) {
      drawBoxHeader(doc, cx, y, col.w, th, col.label);
      cx += col.w;
    }
    const rowH = 28;
    for (const c of cfdi.conceptos.slice(0, 3)) {
      cx = MARGIN;
      doc.rect(cx, y + th, cols[0].w, rowH).stroke(BLACK);
      doc.fontSize(7).text(c.cantidad, cx + 2, y + th + 4, { width: cols[0].w - 4, align: "center" });
      cx += cols[0].w;
      doc.rect(cx, y + th, cols[1].w, rowH).stroke(BLACK);
      doc.text(c.claveUnidad, cx + 2, y + th + 4, { width: cols[1].w - 4 });
      cx += cols[1].w;
      doc.rect(cx, y + th, cols[2].w, rowH).stroke(BLACK);
      const desc = c.claveProdServ ? `${c.descripcion}\nClaveProdServ - ${c.claveProdServ}` : c.descripcion;
      doc.text(desc, cx + 2, y + th + 2, { width: cols[2].w - 4, lineGap: 0 });
      cx += cols[2].w;
      doc.rect(cx, y + th, cols[3].w, rowH).stroke(BLACK);
      doc.text(fmtMoney(c.valorUnitario), cx + 2, y + th + 4, { width: cols[3].w - 4, align: "right" });
      cx += cols[3].w;
      doc.rect(cx, y + th, cols[4].w, rowH).stroke(BLACK);
      doc.text(fmtMoney(c.importe), cx + 2, y + th + 4, { width: cols[4].w - 4, align: "right" });
      y += rowH;
    }
    y += th + 4;

    const totalBoxW = 160;
    const totalX = PAGE_W - MARGIN - totalBoxW;
    const traslados = cfdi.impuestos.filter((i) => i.tipo === "traslado");
    const retenciones = cfdi.impuestos.filter((i) => i.tipo === "retencion");
    const rows: [string, string][] = [["Subtotal", fmtMoney(cfdi.subTotal, cfdi.moneda)]];
    for (const t of traslados) {
      rows.push([`${impuestoLabel(t.impuesto)}T ${t.tasaOCuota || ""}`, fmtMoney(t.importe, cfdi.moneda)]);
    }
    for (const r of retenciones) {
      rows.push([`${impuestoLabel(r.impuesto)}R ${r.tasaOCuota || ""}`, fmtMoney(r.importe, cfdi.moneda)]);
    }
    rows.push(["Total", fmtMoney(cfdi.total, cfdi.moneda)]);

    let ty = y;
    for (const [label, val] of rows) {
      drawBoxHeader(doc, totalX, ty, totalBoxW / 2, 12, label);
      doc.rect(totalX + totalBoxW / 2, ty, totalBoxW / 2, 12).stroke(BLACK);
      doc.fontSize(7).text(val, totalX + totalBoxW / 2 + 2, ty + 3, { width: totalBoxW / 2 - 4, align: "right" });
      ty += 12;
    }

    doc.fontSize(7).text(`TOTAL EN LETRA: ${numeroEnLetra(parseFloat(cfdi.total), cfdi.moneda)}`, MARGIN, y, {
      width: CONTENT_W - totalBoxW - 8,
    });
    y = Math.max(ty, y + 24) + 4;

    if (cfdi.metodoPago || cfdi.condicionesDePago) {
      doc.fontSize(7);
      if (cfdi.metodoPago) doc.text(`Método de Pago: ${cfdi.metodoPago}`, MARGIN, y);
      if (cfdi.condicionesDePago) doc.text(`Condiciones de Pago: ${cfdi.condicionesDePago}`, MARGIN, y + 10);
      y += 22;
    }
  }

  // Sellos + QR (bottom of page 1)
  const footerTop = Math.max(y + 8, PAGE_H - MARGIN - 200);
  y = footerTop;

  const qrW = 110;
  const sealsW = CONTENT_W - qrW - 8;
  const sealH = 52;
  const cadena =
    `||1.1|${cfdi.timbre.uuid}|${cfdi.timbre.fechaTimbrado}|${cfdi.timbre.rfcProvCertif || ""}|` +
    `${cfdi.timbre.selloCFD || ""}|${cfdi.timbre.selloSAT || ""}||`;

  y = drawSealBox(
    doc,
    MARGIN,
    y,
    sealsW,
    "Cadena original del complemento de certificación digital del SAT",
    cadena,
    sealH,
  );
  y = drawSealBox(doc, MARGIN, y + 2, sealsW, "Sello digital del emisor", cfdi.sello || cfdi.timbre.selloCFD || "", sealH);
  y = drawSealBox(
    doc,
    MARGIN,
    y + 2,
    sealsW,
    "Sello digital del SAT",
    cfdi.timbre.selloSAT || "",
    sealH,
  );

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
  doc.image(qrBuf, PAGE_W - MARGIN - qrW, footerTop, { fit: [qrW, qrW] });
  doc.fontSize(7).text("Página 1 de 2", PAGE_W - MARGIN - qrW, footerTop + qrW + 4, { width: qrW, align: "center" });

  doc.fontSize(7).text(
    "Este documento es una representación impresa de un CFDI",
    MARGIN,
    PAGE_H - MARGIN - 12,
    { width: CONTENT_W, align: "center" },
  );
}

function renderPage2(doc: PdfDoc, cfdi: ParsedCfdi, cp: CfdiCartaPorte, tenantNombre?: string): void {
  doc.addPage();
  let y = MARGIN;

  doc.font("Helvetica-Bold").fontSize(10).text(tenantNombre || cfdi.emisor.nombre, MARGIN, y, { width: CONTENT_W, align: "center" });
  y += 14;
  doc.font("Helvetica").fontSize(7);
  doc.text(`RFC: ${cfdi.emisor.rfc}`, MARGIN, y);
  doc.text(`Lugar de Expedición: ${cfdi.lugarExpedicion}`, MARGIN + CONTENT_W / 2, y);
  y += 10;
  doc.text(`Regimen Fiscal: ${cfdi.emisor.regimenFiscal}`, MARGIN, y);
  y += 12;

  const metaCols = [
    [`Factura Número: ${cfdi.folio || "—"}`, `UUID: ${cfdi.timbre.uuid}`],
    [`Fecha y Hora de emisión: ${cfdi.fecha}`, `No. Certificado CSD del SAT: ${cfdi.timbre.noCertificadoSAT || "—"}`],
    [`No. de serie del CSD del emisor: ${cfdi.noCertificado || "—"}`, `Fecha de certificación: ${cfdi.timbre.fechaTimbrado}`],
  ];
  for (const [left, right] of metaCols) {
    doc.text(left, MARGIN, y, { width: CONTENT_W / 2 });
    doc.text(right, MARGIN + CONTENT_W / 2, y, { width: CONTENT_W / 2 });
    y += 10;
  }
  y += 4;

  y = drawGrayBar(doc, y, `Complemento Carta Porte Version ${cp.version}`);

  const fields: [string, string][] = [
    ["IdCCP", cp.idCCP || "—"],
    ["Transp Internac", cp.transpInternac || "—"],
    ["Total Dist Rec", cp.totalDistRec || "—"],
    ["Peso Bruto Total", cp.pesoBrutoTotal || "—"],
    ["Unidad Peso", cp.unidadPeso || "—"],
    ["Num Total Mercancias", cp.numTotalMercancias || "—"],
  ];
  doc.fontSize(7);
  let col = 0;
  for (const [label, val] of fields) {
    const fx = MARGIN + (col % 2) * (CONTENT_W / 2);
    const fy = y + Math.floor(col / 2) * 10;
    doc.text(`${label}: ${val}`, fx, fy, { width: CONTENT_W / 2 - 4 });
    col++;
  }
  y += Math.ceil(fields.length / 2) * 10 + 6;

  y = drawGrayBar(doc, y, "Ubicaciones");
  for (const u of cp.ubicaciones) {
    if (y > PAGE_H - MARGIN - 80) {
      doc.fontSize(6);
    }
    doc.font("Helvetica-Bold").fontSize(7).text(u.tipoUbicacion, MARGIN, y);
    y += 10;
    doc.font("Helvetica").fontSize(6);
    const left = [
      `Tipo Ubicacion: ${u.tipoUbicacion}`,
      `ID Ubicacion: ${u.idUbicacion || "—"}`,
      `RFC Remitente Destinatario: ${u.rfcRemitenteDestinatario || "—"}`,
      `Nombre: ${u.nombreRemitenteDestinatario || "—"}`,
    ];
    const right = [
      `Fecha Hora Salida Llegada: ${u.fechaHoraSalidaLlegada || "—"}`,
      u.distanciaRecorrida ? `Distancia Recorrida: ${u.distanciaRecorrida}` : "",
    ].filter(Boolean);
    for (let i = 0; i < Math.max(left.length, right.length); i++) {
      if (left[i]) doc.text(left[i], MARGIN, y, { width: CONTENT_W / 2 - 4 });
      if (right[i]) doc.text(right[i], MARGIN + CONTENT_W / 2, y, { width: CONTENT_W / 2 - 4 });
      y += 9;
    }
    if (u.domicilio) {
      doc.text(`Domicilio: ${formatDomicilio(u.domicilio)}`, MARGIN, y, { width: CONTENT_W, lineGap: 0 });
      y += 14;
    }
    y += 4;
  }

  y = drawGrayBar(doc, y, "Mercancias");
  const mCols = ["Bienes Transp", "Descripcion", "Cantidad", "Clave Unidad", "Peso Kg"];
  const mw = [70, CONTENT_W - 70 - 45 - 55 - 50, 45, 55, 50];
  let mx = MARGIN;
  const mh = 12;
  for (let i = 0; i < mCols.length; i++) {
    drawBoxHeader(doc, mx, y, mw[i], mh, mCols[i]);
    mx += mw[i];
  }
  y += mh;
  const fontSize = cp.mercancias.length > 4 ? 5.5 : 6.5;
  doc.fontSize(fontSize);
  for (const m of cp.mercancias) {
    mx = MARGIN;
    const vals = [m.bienesTransp || "—", m.descripcion || "—", m.cantidad || "—", m.claveUnidad || "—", m.pesoEnKg || "—"];
    const rh = 16;
    for (let i = 0; i < vals.length; i++) {
      doc.rect(mx, y, mw[i], rh).stroke(BLACK);
      doc.text(vals[i], mx + 2, y + 3, { width: mw[i] - 4, lineGap: 0 });
      mx += mw[i];
    }
    y += rh;
    if (y > PAGE_H - MARGIN - 40) doc.fontSize(fontSize - 0.5);
  }
  y += 4;

  const cantTransp = cp.mercancias.flatMap((m) => m.cantidadTransporta || []);
  if (cantTransp.length > 0) {
    y = drawGrayBar(doc, y, "Cantidad Transporta");
    const ctCols = ["Cantidad", "ID Origen", "ID Destino"];
    const ctW = [60, 100, 100];
    let cx = MARGIN;
    for (let i = 0; i < ctCols.length; i++) {
      drawBoxHeader(doc, cx, y, ctW[i], mh, ctCols[i]);
      cx += ctW[i];
    }
    y += mh;
    doc.fontSize(6);
    for (const ct of cantTransp) {
      cx = MARGIN;
      for (const val of [ct.cantidad, ct.idOrigen, ct.idDestino]) {
        doc.rect(cx, y, ctW[0], 12).stroke(BLACK);
        doc.text(val, cx + 2, y + 2, { width: ctW[0] - 4 });
        cx += ctW[0];
      }
      y += 12;
    }
    y += 4;
  }

  if (cp.autotransporte) {
    y = drawGrayBar(doc, y, "Autotransporte");
    const a = cp.autotransporte;
    doc.fontSize(6);
    const autoLines = [
      `Perm SCT: ${a.permSCT || "—"}  Num Permiso SCT: ${a.numPermisoSCT || "—"}`,
      `Config Vehicular: ${a.configVehicular || "—"}  Placa VM: ${a.placaVM || "—"}  Año Modelo VM: ${a.anioModeloVM || "—"}  Peso Bruto Vehicular: ${a.pesoBrutoVehicular || "—"}`,
      `Asegura Resp Civil: ${a.aseguraRespCivil || "—"}  Poliza Resp Civil: ${a.polizaRespCivil || "—"}`,
      `Asegura Carga: ${a.aseguraCarga || "—"}  Poliza Carga: ${a.polizaCarga || "—"}`,
    ];
    for (const line of autoLines) {
      doc.text(line, MARGIN, y, { width: CONTENT_W });
      y += 9;
    }
    y += 4;
  }

  if (cp.figuras.length > 0) {
    y = drawGrayBar(doc, y, "Figura Transporte");
    const fCols = ["Tipo Figura", "RFC Figura", "Num Licencia", "Nombre Figura"];
    const fw = [55, 80, 80, CONTENT_W - 215];
    let fx = MARGIN;
    for (let i = 0; i < fCols.length; i++) {
      drawBoxHeader(doc, fx, y, fw[i], mh, fCols[i]);
      fx += fw[i];
    }
    y += mh;
    doc.fontSize(6);
    for (const f of cp.figuras) {
      fx = MARGIN;
      const fvals = [f.tipoFigura || "—", f.rfcFigura || "—", f.numLicencia || "—", f.nombreFigura || "—"];
      for (let i = 0; i < fvals.length; i++) {
        doc.rect(fx, y, fw[i], 14).stroke(BLACK);
        doc.text(fvals[i], fx + 2, y + 3, { width: fw[i] - 4, lineGap: 0 });
        fx += fw[i];
      }
      y += 14;
    }
  }

  doc.fontSize(7).text("Página 2 de 2", MARGIN, PAGE_H - MARGIN - 10, { width: CONTENT_W, align: "right" });
}

/** Genera el PDF fiscal (2 páginas) a partir del XML timbrado. */
export async function renderCfdiPdfFromXml(xml: string, tenant?: Tenant | null): Promise<Buffer> {
  const cfdi = parseCfdiXml(xml);
  const logo = tenant ? await loadTenantLogo(tenant) : null;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 0, autoFirstPage: true });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    void (async () => {
      try {
        await renderPage1(doc, cfdi, logo);
        if (cfdi.cartaPorte) {
          renderPage2(doc, cfdi, cfdi.cartaPorte, tenant?.razon_social || cfdi.emisor.nombre);
        } else {
          doc.addPage();
          doc.fontSize(10).text("Sin complemento Carta Porte en el XML", MARGIN, MARGIN);
        }
        doc.end();
      } catch (e) {
        reject(e);
      }
    })();
  });
}
