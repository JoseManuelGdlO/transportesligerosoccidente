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
  type CfdiCartaPorte,
  type CfdiConcepto,
  type CfdiMercancia,
} from "./parseCfdiXml";
import {
  BOTTOM_RESERVE,
  CONTENT_W,
  MARGIN,
  PAGE_H,
  PAGE_W,
  RED,
  BLACK,
  drawFlatBlackHeader,
  drawAllCfdiFooters,
  drawDataTable,
  drawGraySectionBar,
  drawFlatBox,
  drawSellosYQr,
  drawFieldColumns,
  drawSegurosBox,
  drawMetaRows,
  measureMetaRows,
  drawUbicacionSicofiBlock,
  drawMercanciasSummary6Col,
  drawIdentificacionVehicularInline,
  drawSellosCartaPorte,
  PAGE2_BOTTOM_RESERVE,
  type PdfDoc,
} from "./pdfLayout";
import { catalogDescription, formatCatalogCode } from "./satCatalogLabels";

type CatalogLookup = Record<string, string>;

const PAGE2_CONTENT_BOTTOM = PAGE_H - MARGIN - PAGE2_BOTTOM_RESERVE;

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
  if (tipo === "retencion") return `${base}R`;
  return tasa ? `${base}T ${tasa}` : `${base}T`;
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
  if (!clave) return "—";
  if (c.unidad?.trim()) return `${clave} - ${c.unidad.trim()}`;
  return formatCatalogCode(clave, "claveUnidad");
}

function conceptoDescripcion(c: CfdiConcepto): string {
  return c.descripcion;
}

function dash(v?: string | null): string {
  const t = v?.trim();
  return t || "—";
}

function ubicacionPoloLabel(cp: CfdiCartaPorte): string {
  const orig = cp.ubicacionPoloOrigen?.trim();
  const dest = cp.ubicacionPoloDestino?.trim();
  if (orig || dest) return [orig, dest].filter(Boolean).join(" - ");
  return "—";
}

function mercanciaClaveUnidadCode(m: CfdiMercancia): string {
  return m.claveUnidad?.trim() || "—";
}

function mercanciaUnidadLabel(m: CfdiMercancia): string {
  return m.unidad?.trim() || "—";
}

function regimenFiscalDescripcion(code?: string | null): string {
  const trimmed = (code ?? "").trim();
  if (!trimmed) return "—";
  return catalogDescription(trimmed, "regimenFiscal") || trimmed;
}

function drawLogo(doc: PdfDoc, logo: Buffer | null, x: number, y: number, w: number, h: number): number {
  if (logo) {
    try {
      doc.image(logo, x, y, { fit: [w, h] });
      return h;
    } catch {
      /* fallback to text */
    }
  }
  doc.font("Helvetica-Bold").fontSize(22).text("TLO", x, y);
  doc.font("Helvetica").fontSize(8).text("Transportes Ligeros de Occidente", x, y + 24, { width: w });
  return 36;
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

function formatTenantDomicilioLines(tenant: Tenant | null | undefined, cfdi: ParsedCfdi): string[] {
  const line = formatTenantDomicilioLine(tenant, cfdi);
  return [line];
}

function drawInvoiceBox(doc: PdfDoc, cfdi: ParsedCfdi, x: number, y: number, w: number): number {
  const headerH = 13;
  const boxH = 96;
  drawFlatBlackHeader(doc, x, y, w, headerH, `${tipoLabel(cfdi.tipoDeComprobante)} - VERSIÓN ${cfdi.version}`, 7);
  drawFlatBox(doc, x, y + headerH, w, boxH - headerH);
  const bodyY = y + headerH;
  doc
    .fillColor(RED)
    .font("Helvetica-Bold")
    .fontSize(20)
    .text(cfdi.folio || "—", x, bodyY + 4, { width: w, align: "center" });
  doc.fillColor(BLACK).font("Helvetica").fontSize(6.5);
  let hy = bodyY + 28;
  const metaLines = [
    `No. de serie del CSD del emisor: ${cfdi.noCertificado || "—"}`,
    `Fecha y Hora de emisión: ${cfdi.fecha}`,
    `Folio Fiscal: ${cfdi.timbre.uuid}`,
  ];
  for (const line of metaLines) {
    doc.text(line, x + 5, hy, { width: w - 10, align: "left" });
    hy += 11;
  }
  return boxH;
}

function drawEmisorBlock(doc: PdfDoc, cfdi: ParsedCfdi, x: number, y: number, w: number, h: number) {
  drawFlatBlackHeader(doc, x, y, w, 13, "Emisor", 7);
  drawFlatBox(doc, x, y + 13, w, h - 13);
  doc.fontSize(7).text(`RFC: ${cfdi.emisor.rfc}`, x + 5, y + 17);
  doc.text(`Razón Social: ${cfdi.emisor.nombre}`, x + 5, y + 28, { width: w - 10 });
  doc.text(`Regimen Fiscal: ${formatCatalogCode(cfdi.emisor.regimenFiscal, "regimenFiscal")}`, x + 5, y + 39, {
    width: w - 10,
  });
}

function drawCertificationBlock(doc: PdfDoc, cfdi: ParsedCfdi, x: number, y: number, w: number, h: number) {
  const colW = w / 3;
  const headerH = 13;
  const bodyH = h - headerH;
  drawFlatBlackHeader(doc, x, y, colW, headerH, "Fecha y hora de certificación", 5.5);
  drawFlatBlackHeader(doc, x + colW, y, colW, headerH, "No. de serie del CSD del SAT", 5.5);
  drawFlatBlackHeader(doc, x + colW * 2, y, colW, headerH, "Forma de Pago", 5.5);
  doc.rect(x, y + headerH, colW, bodyH).stroke(BLACK);
  doc.rect(x + colW, y + headerH, colW, bodyH).stroke(BLACK);
  doc.rect(x + colW * 2, y + headerH, colW, bodyH).stroke(BLACK);
  doc.fontSize(6).text(cfdi.timbre.fechaTimbrado, x + 2, y + headerH + 4, { width: colW - 4, align: "center" });
  doc.text(cfdi.timbre.noCertificadoSAT || "—", x + colW + 2, y + headerH + 4, { width: colW - 4, align: "center" });
  doc.text(formatCatalogCode(cfdi.formaPago, "formaPago"), x + colW * 2 + 2, y + headerH + 4, {
    width: colW - 4,
    align: "center",
  });
}

async function renderPage1(
  doc: PdfDoc,
  cfdi: ParsedCfdi,
  logo: Buffer | null,
  _lookup: CatalogLookup,
): Promise<void> {
  let y = MARGIN;
  const headerRightW = 195;
  const logoW = 185;
  const logoH = 72;
  const boxX = PAGE_W - MARGIN - headerRightW;

  const logoUsedH = drawLogo(doc, logo, MARGIN, y, logoW, logoH);
  const boxH = drawInvoiceBox(doc, cfdi, boxX, y, headerRightW);
  y += Math.max(logoUsedH, boxH) + 6;

  doc.fontSize(7).text(`Lugar de expedición: ${cfdi.lugarExpedicion}`, MARGIN, y, {
    width: CONTENT_W,
    align: "right",
  });
  y += 12;

  const blockH = 52;
  const emisorW = Math.round(CONTENT_W * 0.58);
  const certW = CONTENT_W - emisorW - 6;
  drawEmisorBlock(doc, cfdi, MARGIN, y, emisorW, blockH);
  drawCertificationBlock(doc, cfdi, MARGIN + emisorW + 6, y, certW, blockH);
  y += blockH + 4;

  drawFlatBlackHeader(doc, MARGIN, y, CONTENT_W, 13, "Receptor", 7);
  drawFlatBox(doc, MARGIN, y + 13, CONTENT_W, blockH - 13);
  doc.fontSize(7);
  doc.text(`RFC: ${cfdi.receptor.rfc}`, MARGIN + 5, y + 17);
  doc.text(`Razón Social: ${cfdi.receptor.nombre}`, MARGIN + 5, y + 28);
  doc.text(`Uso de CFDI: ${formatCatalogCode(cfdi.receptor.usoCFDI, "usoCfdi")}`, MARGIN + 5, y + 39);
  const rx = MARGIN + CONTENT_W / 2;
  doc.text(
    `Regimen Fiscal Receptor: ${cfdi.receptor.regimenFiscal ? formatCatalogCode(cfdi.receptor.regimenFiscal, "regimenFiscal") : "—"}`,
    rx,
    y + 17,
  );
  doc.text(`Domicilio Fiscal Receptor: ${cfdi.receptor.domicilioFiscal || "—"}`, rx, y + 28);
  y += blockH + 4;

  const isIngreso = cfdi.tipoDeComprobante === "I" || cfdi.tipoDeComprobante === "FA";

  if (isIngreso && cfdi.conceptos.length > 0) {
    const cols = [
      { label: "Cantidad", w: 52 },
      { label: "Clave Unidad", w: 72 },
      { label: "Descripción", w: CONTENT_W - 52 - 72 - 64 - 64 },
      { label: "Valor Unitario", w: 64 },
      { label: "Importe", w: 64 },
    ];
    let cx = MARGIN;
    const th = 13;
    for (const col of cols) {
      drawFlatBlackHeader(doc, cx, y, col.w, th, col.label, 6);
      cx += col.w;
    }
    let tableBodyY = y + th;
    for (const c of cfdi.conceptos.slice(0, 5)) {
      const desc = conceptoDescripcion(c);
      const descH = doc.heightOfString(desc, { width: cols[2].w - 4, lineGap: 0 });
      const rowHConcept = Math.max(24, descH + 6);
      cx = MARGIN;
      doc.rect(cx, tableBodyY, cols[0].w, rowHConcept).stroke(BLACK);
      doc.fontSize(6.5).text(fmtCantidad(c.cantidad), cx + 2, tableBodyY + 4, { width: cols[0].w - 4, align: "center" });
      cx += cols[0].w;
      doc.rect(cx, tableBodyY, cols[1].w, rowHConcept).stroke(BLACK);
      doc.text(conceptoClaveUnidad(c), cx + 2, tableBodyY + 4, { width: cols[1].w - 4 });
      cx += cols[1].w;
      doc.rect(cx, tableBodyY, cols[2].w, rowHConcept).stroke(BLACK);
      doc.text(desc, cx + 2, tableBodyY + 2, { width: cols[2].w - 4, lineGap: 0 });
      cx += cols[2].w;
      doc.rect(cx, tableBodyY, cols[3].w, rowHConcept).stroke(BLACK);
      doc.text(fmtMoney(c.valorUnitario, undefined, 2), cx + 2, tableBodyY + 4, { width: cols[3].w - 4, align: "right" });
      cx += cols[3].w;
      doc.rect(cx, tableBodyY, cols[4].w, rowHConcept).stroke(BLACK);
      doc.text(fmtMoney(c.importe, undefined, 2), cx + 2, tableBodyY + 4, { width: cols[4].w - 4, align: "right" });
      tableBodyY += rowHConcept;
    }
    y = tableBodyY + 6;

    const totalBoxW = 162;
    const totalX = PAGE_W - MARGIN - totalBoxW;
    const traslados = cfdi.impuestos.filter((i) => i.tipo === "traslado");
    const retenciones = cfdi.impuestos.filter((i) => i.tipo === "retencion");
    const rows: [string, string][] = [["Subtotal", fmtMoney(cfdi.subTotal, cfdi.moneda)]];
    for (const t of traslados) {
      rows.push([impuestoTotalLabel("traslado", t.impuesto, t.tasaOCuota), fmtMoney(t.importe, cfdi.moneda)]);
    }
    for (const r of retenciones) {
      rows.push([impuestoTotalLabel("retencion", r.impuesto), fmtMoney(r.importe, cfdi.moneda)]);
    }
    rows.push(["Total", fmtMoney(cfdi.total, cfdi.moneda)]);

    const labelW = 82;
    const valueW = totalBoxW - labelW;
    let ty = y;
    for (const [label, val] of rows) {
      drawFlatBlackHeader(doc, totalX, ty, labelW, 12, label, 6);
      doc.rect(totalX + labelW, ty, valueW, 12).stroke(BLACK);
      doc.fontSize(6.5).text(val, totalX + labelW + 2, ty + 2, { width: valueW - 4, align: "right" });
      ty += 12;
    }

    y = ty + 4;

    if (cfdi.metodoPago || cfdi.condicionesDePago) {
      doc.fontSize(7);
      if (cfdi.metodoPago) {
        doc.text(`Método de Pago: ${formatCatalogCode(cfdi.metodoPago, "metodoPago")}`, MARGIN, y);
        y += 9;
      }
      if (cfdi.condicionesDePago) {
        doc.text(`Condiciones de Pago: ${cfdi.condicionesDePago}`, MARGIN, y);
        y += 9;
      }
      y += 2;
    }
  }

  const footerTop = Math.max(y + 8, PAGE_H - MARGIN - BOTTOM_RESERVE);
  await drawSellosYQr(doc, cfdi, footerTop);
}

function drawPage2Header(
  doc: PdfDoc,
  cfdi: ParsedCfdi,
  cp: CfdiCartaPorte,
  tenant: Tenant | null | undefined,
  logo: Buffer | null,
): number {
  const y0 = MARGIN;
  const logoW = 95;
  const centerX = MARGIN + logoW + 6;
  const centerW = CONTENT_W * 0.38;
  const rightX = centerX + centerW + 6;
  const rightW = PAGE_W - MARGIN - rightX;

  const logoH = drawLogo(doc, logo, MARGIN, y0, logoW, 48);

  const nombre = tenant?.razon_social || cfdi.emisor.nombre;
  doc.font("Helvetica-Bold").fontSize(7.5).text(nombre, centerX, y0, { width: centerW, lineGap: 0 });
  let cy = y0 + doc.heightOfString(nombre, { width: centerW, lineGap: 0 }) + 2;
  doc.font("Helvetica").fontSize(5.5);
  const centerLines = [
    `R.F.C. ${tenant?.rfc || cfdi.emisor.rfc}`,
    ...formatTenantDomicilioLines(tenant, cfdi),
    `Lugar de Expedición: ${cfdi.lugarExpedicion}`,
    `Regimen Fiscal: ${regimenFiscalDescripcion(tenant?.regimen_fiscal || cfdi.emisor.regimenFiscal)}`,
    `No. de serie del CSD del SAT: ${cfdi.timbre.noCertificadoSAT || "—"}`,
    `No. de serie del CSD del emisor: ${cfdi.noCertificado || "—"}`,
    `Fecha de certificación: ${cfdi.timbre.fechaTimbrado}`,
  ];
  for (const line of centerLines) {
    doc.text(line, centerX, cy, { width: centerW, lineGap: 0 });
    cy += doc.heightOfString(line, { width: centerW, lineGap: 0 }) + 1;
  }

  const rightFields: [string, string][] = [
    ["Factura Número", cfdi.folio || "—"],
    ["UUID", cfdi.timbre.uuid],
    ["Fecha y Hora de emisión", cfdi.fecha],
    ["No. Certificado CSD del SAT", cfdi.timbre.noCertificadoSAT || "—"],
    ["No. de serie del CSD del emisor", cfdi.noCertificado || "—"],
    ["Fecha de certificación", cfdi.timbre.fechaTimbrado],
  ];
  const metaTop = y0;
  const metaH = measureMetaRows(doc, rightW, rightFields, 5.5);
  drawFlatBox(doc, rightX, metaTop, rightW, metaH);
  const metaBottom = drawMetaRows(doc, rightX, metaTop, rightW, rightFields, 5.5);

  let y = Math.max(cy, metaBottom, y0 + logoH) + 6;
  y = drawGraySectionBar(doc, y, `Complemento Carta Porte Version ${cp.version}`, 8);
  return y + 4;
}

async function renderPage2(
  doc: PdfDoc,
  cfdi: ParsedCfdi,
  cp: CfdiCartaPorte,
  tenant: Tenant | null | undefined,
  logo: Buffer | null,
): Promise<void> {
  let cartaPortePageIndex = doc.bufferedPageRange().count - 1;
  let y = drawPage2Header(doc, cfdi, cp, tenant, logo);

  const ensureSpace = (needed: number) => {
    if (y + needed > PAGE2_CONTENT_BOTTOM) {
      doc.addPage();
      cartaPortePageIndex = doc.bufferedPageRange().count - 1;
      y = MARGIN;
      doc.font("Helvetica-Bold").fontSize(8).text("Complemento Carta Porte (continuación)", MARGIN, y);
      y += 16;
    }
  };

  y = drawFieldColumns(
    doc,
    y,
    [
      ["IdCCP", dash(cp.idCCP)],
      ["Entrada Salida Merc", dash(cp.entradaSalidaMerc)],
      ["Total Dist Rec", dash(cp.totalDistRec)],
    ],
    3,
    5.5,
    2,
  );
  y = drawFieldColumns(
    doc,
    y,
    [
      ["Transp Internac", dash(cp.transpInternac)],
      ["Pais origen - Destino", dash(cp.paisOrigenDestino)],
      ["Registro ISTMO", dash(cp.registroISTMO)],
    ],
    3,
    5.5,
    2,
  );
  y = drawFieldColumns(
    doc,
    y,
    [
      ["Via Entrada Salida", dash(cp.viaEntradaSalida)],
      ["Ubicación Origen - Destino", ubicacionPoloLabel(cp)],
    ],
    3,
    5.5,
    2,
  );

  ensureSpace(24);
  y = drawGraySectionBar(doc, y, "Regimenes Aduaneros");
  if (cp.regimenesAduaneros.length > 0) {
    y = drawFieldColumns(
      doc,
      y,
      cp.regimenesAduaneros.map((r, i) => [`Regimen Aduanero ${i + 1}`, r] as [string, string]),
      3,
      6,
    );
  } else {
    doc.fontSize(6).text("—", MARGIN, y + 2);
    y += 12;
  }

  ensureSpace(40);
  y = drawGraySectionBar(doc, y, "Ubicaciones");
  for (const u of cp.ubicaciones) {
    ensureSpace(72);
    y = drawUbicacionSicofiBlock(
      doc,
      y,
      u,
      u.domicilio ? formatDomicilioCartaPorte(u.domicilio) : undefined,
    );
  }

  ensureSpace(50);
  y = drawGraySectionBar(doc, y, "Mercancias");
  y = drawMercanciasSummary6Col(doc, y, [
    dash(cp.logisticaInversaRecoleccionDevolucion),
    cp.unidadPeso ? formatCatalogCode(cp.unidadPeso, "claveUnidad", { codeOnly: true }) : "—",
    dash(cp.cargoPorTasacion),
    dash(cp.pesoNetoTotal),
    dash(cp.numTotalMercancias),
    dash(cp.pesoBrutoTotal),
  ]);
  y += 4;

  const colUnidad = 40;
  const colCant = 40;
  const colClaveUnidad = 48;
  const colBienes = 52;
  const colStcc = 44;
  const colDesc = CONTENT_W - colBienes - colStcc - colCant - colClaveUnidad - colUnidad;
  const mHeaders = ["Bienes Transp", "Clave STCC", "Descripcion", "Cantidad", "Clave Unidad", "Unidad"];
  const mw = [colBienes, colStcc, colDesc, colCant, colClaveUnidad, colUnidad];
  const mRows = cp.mercancias.map((m) => [
    dash(m.bienesTransp),
    dash(m.claveSTCC),
    dash(m.descripcion),
    m.cantidad ? fmtCantidad(m.cantidad) : "—",
    mercanciaClaveUnidadCode(m),
    mercanciaUnidadLabel(m),
  ]);
  ensureSpace(20 + Math.max(mRows.length, 1) * 14);
  y = drawDataTable(doc, y, mHeaders, mRows.length > 0 ? mRows : [["—", "—", "—", "—", "—", "—"]], mw, 10, 11, 5.5);

  const pesoKg = cp.mercancias.find((m) => m.pesoEnKg)?.pesoEnKg || cp.pesoBrutoTotal;
  if (pesoKg) {
    const boxW = 90;
    doc.fontSize(6).text(`Peso En Kg ${pesoKg}`, PAGE_W - MARGIN - boxW, y + 2, { width: boxW, align: "right" });
    y += 11;
  }

  ensureSpace(24);
  y = drawGraySectionBar(doc, y, "Cantidad Transporta");
  const cantTransp = cp.mercancias.flatMap((m) => m.cantidadTransporta || []);
  const ctRows =
    cantTransp.length > 0
      ? cantTransp.map((ct) => [ct.cantidad, ct.idOrigen, ct.idDestino])
      : [["—", "—", "—"]];
  y = drawDataTable(doc, y, ["Cantidad", "ID Origen", "ID. Destino"], ctRows, [60, 150, 150], 10, 11, 5.5);

  ensureSpace(48);
  y = drawGraySectionBar(doc, y, "Autotransporte");
  const a = cp.autotransporte;
  if (a) {
    y = drawFieldColumns(
      doc,
      y,
      [
        ["Perm SCT", dash(a.permSCT)],
        ["Num Permiso SCT", dash(a.numPermisoSCT)],
      ],
      2,
      5.5,
      2,
    );
    y = drawIdentificacionVehicularInline(doc, y, a);
    y = drawSegurosBox(
      doc,
      y,
      [
        ["Asegura Resp Civil", dash(a.aseguraRespCivil)],
        ["Poliza Resp Civil", dash(a.polizaRespCivil)],
        ["Asegura Med Ambiente", dash(a.aseguraMedAmbiente)],
        ["Poliza Med Ambiente", dash(a.polizaMedAmbiente)],
      ],
      [
        ["Asegura Carga", dash(a.aseguraCarga)],
        ["Poliza Carga", dash(a.polizaCarga)],
        ["Prima Seguro", dash(a.primaSeguro)],
      ],
    );
  } else {
    doc.fontSize(6).text("—", MARGIN, y + 2);
    y += 12;
  }

  ensureSpace(50);
  y = drawGraySectionBar(doc, y, "Figura Transporte");
  const figRows =
    cp.figuras.length > 0
      ? cp.figuras.map((f) => [
          dash(f.tipoFigura),
          dash(f.rfcFigura),
          dash(f.numLicencia),
          dash(f.nombreFigura),
        ])
      : [["—", "—", "—", "—"]];
  y = drawDataTable(
    doc,
    y,
    ["Tipo Figura", "RFC Figura", "Num Licencia", "Nombre Figura"],
    figRows,
    [55, 80, 80, CONTENT_W - 215],
    10,
    11,
    5.5,
  );
  for (const f of cp.figuras) {
    const hasExtra =
      f.numRegIdTribFigura?.trim() ||
      f.residenciaFiscalFigura?.trim() ||
      f.partesTransporte?.trim() ||
      f.domicilio;
    if (!hasExtra) continue;
    ensureSpace(24);
    y = drawDataTable(
      doc,
      y,
      ["Num Reg IdTrib Figura", "Residencia Fiscal Figura", "Partes Transporte", "Domicilio"],
      [
        [
          dash(f.numRegIdTribFigura),
          dash(f.residenciaFiscalFigura),
          dash(f.partesTransporte),
          f.domicilio ? formatDomicilio(f.domicilio) : "—",
        ],
      ],
      [CONTENT_W * 0.22, CONTENT_W * 0.22, CONTENT_W * 0.22, CONTENT_W * 0.34],
      12,
      20,
      5.5,
    );
  }
  if (cp.figuras.length === 0) {
    y = drawDataTable(
      doc,
      y,
      ["Num Reg IdTrib Figura", "Residencia Fiscal Figura", "Partes Transporte", "Domicilio"],
      [["—", "—", "—", "—"]],
      [CONTENT_W * 0.22, CONTENT_W * 0.22, CONTENT_W * 0.22, CONTENT_W * 0.34],
      12,
      14,
      6,
    );
  }

  const sealTop = PAGE_H - MARGIN - PAGE2_BOTTOM_RESERVE;
  doc.switchToPage(cartaPortePageIndex);
  drawSellosCartaPorte(doc, cfdi, sealTop);
}

/** Genera el PDF fiscal (CFDI + Carta Porte) a partir del XML timbrado. */
export async function renderCfdiPdfFromXml(xml: string, tenant?: Tenant | null): Promise<Buffer> {
  const cfdi = parseCfdiXml(xml);
  const lookup = await buildCatalogLookup(cfdi);
  const logo = tenant ? await loadTenantLogo(tenant) : null;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: [PAGE_W, PAGE_H], margin: 0, autoFirstPage: true, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    void (async () => {
      try {
        await renderPage1(doc, cfdi, logo, lookup);
        if (cfdi.cartaPorte) {
          doc.addPage();
          await renderPage2(doc, cfdi, cfdi.cartaPorte, tenant, logo);
        }
        drawAllCfdiFooters(doc);
        doc.end();
      } catch (e) {
        reject(e);
      }
    })();
  });
}
