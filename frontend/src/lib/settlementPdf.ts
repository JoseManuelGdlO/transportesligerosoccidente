import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import type { Driver, Trip } from "@/types/tlo";
import type { SettlementSummary } from "@/lib/calc";
import { computeTrip } from "@/lib/calc";
import { fmtMXN, fmtDate, fmtNumber } from "@/lib/format";
import { apiBaseUrl, getStoredToken } from "@/lib/api";

export const DEFAULT_PDF_BRANDING: PdfBranding = {
  titulo: "Liquidación semanal",
  color_header: "#212529",
  color_header_text: "#ffffff",
  pie_pagina: "",
};

export interface PdfBranding {
  titulo?: string;
  color_header?: string;
  color_header_text?: string;
  pie_pagina?: string;
}

function safeFileSegment(s: string): string {
  return s.replace(/[/\\?%*:|"<>]/g, "-").replace(/\s+/g, "_").slice(0, 64);
}

type DocWithAutoTable = jsPDF & { lastAutoTable?: { finalY: number } };

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const n = parseInt(h, 16);
  if (h.length !== 6 || Number.isNaN(n)) return [33, 37, 41];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function resolveBranding(b?: PdfBranding | null): Required<PdfBranding> {
  return {
    titulo: b?.titulo?.trim() || DEFAULT_PDF_BRANDING.titulo!,
    color_header: b?.color_header || DEFAULT_PDF_BRANDING.color_header!,
    color_header_text: b?.color_header_text || DEFAULT_PDF_BRANDING.color_header_text!,
    pie_pagina: b?.pie_pagina ?? "",
  };
}

export async function loadPdfLogoDataUrl(): Promise<string | null> {
  const base = apiBaseUrl();
  const token = getStoredToken();
  if (!base || !token) return null;
  try {
    const res = await fetch(`${base}/tenant/pdf-logo`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export function buildSettlementPdf(opts: {
  tenantNombre: string;
  driver: Driver;
  inicio: string;
  fin: string;
  summary: SettlementSummary;
  branding?: PdfBranding | null;
  logoDataUrl?: string | null;
}): jsPDF {
  const { tenantNombre, driver, inicio, fin, summary, branding, logoDataUrl } = opts;
  const brand = resolveBranding(branding);
  const headerRgb = hexToRgb(brand.color_header);
  const headerTextRgb = hexToRgb(brand.color_header_text);

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const margin = 14;
  let y = 16;

  const pageW = doc.internal.pageSize.getWidth();
  if (logoDataUrl) {
    try {
      const fmt = logoDataUrl.includes("image/png") ? "PNG" : "JPEG";
      doc.addImage(logoDataUrl, fmt, pageW - margin - 32, y - 4, 32, 14);
    } catch {
      /* ignore broken image */
    }
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(brand.titulo, margin, y);
  y += 9;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Empresa: ${tenantNombre}`, margin, y);
  y += 6;
  doc.text(`Operador: ${driver.nombre}`, margin, y);
  y += 6;
  doc.text(`Periodo: ${fmtDate(`${inicio}T12:00:00`)} — ${fmtDate(`${fin}T12:00:00`)}`, margin, y);
  y += 6;
  doc.setFontSize(8);
  doc.setTextColor(90, 90, 90);
  doc.text(`Generado: ${new Date().toLocaleString("es-MX")}`, margin, y);
  doc.setTextColor(0, 0, 0);
  y += 10;

  doc.setFontSize(10);
  doc.text(`Viajes: ${summary.trips.length}`, margin, y);
  doc.text(`Ingresos: ${fmtMXN(summary.total_ingresos)}`, margin + 55, y);
  doc.text(`Km totales: ${fmtNumber(summary.total_km)}`, margin + 115, y);
  y += 6;
  doc.text(`Comisiones: ${fmtMXN(summary.total_comisiones)}`, margin, y);
  doc.text(`Neto a pagar: ${fmtMXN(summary.neto_pagar)}`, margin + 55, y);
  y += 8;

  const head = [["Folio", "Factura", "Fecha", "Ruta", "Km", "Ingreso", "Comisión"]];
  const body: string[][] = summary.trips.map((t: Trip) => {
    const f = computeTrip(t, driver);
    return [
      String(t.folio),
      t.num_factura?.trim() || "—",
      fmtDate(t.fecha_salida),
      `${t.origen} → ${t.destino}`,
      fmtNumber(f.km_recorridos),
      fmtMXN(f.ingreso),
      fmtMXN(f.comision),
    ];
  });

  autoTable(doc, {
    startY: y,
    head,
    body: body.length > 0 ? body : [["—", "—", "—", "Sin viajes en el periodo", "", "", ""]],
    styles: { fontSize: 8, cellPadding: 1.5, font: "helvetica" },
    headStyles: { fillColor: headerRgb, textColor: headerTextRgb },
    margin: { left: margin, right: margin },
    columnStyles: {
      0: { cellWidth: 20 },
      1: { cellWidth: 22 },
      2: { cellWidth: 22 },
      3: { cellWidth: 48 },
      4: { halign: "right", cellWidth: 16 },
      5: { halign: "right", cellWidth: 26 },
      6: { halign: "right", cellWidth: 26 },
    },
  });

  const finalY = (doc as DocWithAutoTable).lastAutoTable?.finalY ?? y + 30;
  y = finalY + 10;

  if (y > 250) {
    doc.addPage();
    y = 20;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Resumen de viáticos", margin, y);
  y += 7;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Entregados: ${fmtMXN(summary.viaticos_entregados)}`, margin, y);
  y += 6;
  doc.text(`Comprobados: ${fmtMXN(summary.viaticos_comprobados)}`, margin, y);
  y += 6;
  const saldoLabel = summary.saldo_viaticos >= 0 ? "A favor del operador" : "Saldo viáticos (no comprobado)";
  doc.text(`${saldoLabel}: ${fmtMXN(Math.abs(summary.saldo_viaticos))}`, margin, y);
  y += 6;
  doc.text(`Viáticos no comprobados (deducción): ${fmtMXN(Math.max(0, summary.viaticos_entregados - summary.viaticos_comprobados))}`, margin, y);
  y += 6;
  if (summary.total_descuentos > 0) {
    doc.text(`Descuentos (periodo): −${fmtMXN(summary.total_descuentos)}`, margin, y);
    y += 6;
  }
  if (summary.total_anticipos > 0) {
    doc.text(`Anticipos (periodo): −${fmtMXN(summary.total_anticipos)}`, margin, y);
    y += 6;
  }
  y += 4;

  const advances = summary.advances ?? [];
  const discounts = summary.discounts ?? [];

  if (advances.length > 0) {
    if (y > 240) {
      doc.addPage();
      y = 20;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Anticipos pendientes", margin, y);
    y += 4;
    autoTable(doc, {
      startY: y,
      head: [["Fecha", "Descripción", "Monto", "En periodo"]],
      body: advances.map((a) => [
        fmtDate(a.fecha),
        a.descripcion,
        fmtMXN(a.monto),
        a.en_periodo === false ? "No" : "Sí",
      ]),
      styles: { fontSize: 8, cellPadding: 1.5 },
      headStyles: { fillColor: headerRgb, textColor: headerTextRgb },
      margin: { left: margin, right: margin },
    });
    y = ((doc as DocWithAutoTable).lastAutoTable?.finalY ?? y) + 8;
  }

  if (discounts.length > 0) {
    if (y > 240) {
      doc.addPage();
      y = 20;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Descuentos pendientes", margin, y);
    y += 4;
    autoTable(doc, {
      startY: y,
      head: [["Tipo", "Fecha", "Descripción", "Monto", "En periodo"]],
      body: discounts.map((d) => [
        d.tipo,
        fmtDate(d.fecha),
        d.descripcion,
        fmtMXN(d.monto),
        d.en_periodo === false ? "No" : "Sí",
      ]),
      styles: { fontSize: 8, cellPadding: 1.5 },
      headStyles: { fillColor: headerRgb, textColor: headerTextRgb },
      margin: { left: margin, right: margin },
    });
    y = ((doc as DocWithAutoTable).lastAutoTable?.finalY ?? y) + 8;
  }

  if (y > 250) {
    doc.addPage();
    y = 20;
  }

  doc.setFillColor(...headerRgb);
  doc.roundedRect(margin, y, 182, 18, 2, 2, "F");
  doc.setTextColor(...headerTextRgb);
  doc.setFontSize(9);
  doc.text("NETO A PAGAR", margin + 4, y + 7);
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text(fmtMXN(summary.neto_pagar), margin + 4, y + 14);
  doc.setTextColor(0, 0, 0);

  if (brand.pie_pagina.trim()) {
    const pageH = doc.internal.pageSize.getHeight();
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    const lines = doc.splitTextToSize(brand.pie_pagina.trim(), pageW - margin * 2);
    doc.text(lines, margin, pageH - 10 - (lines.length - 1) * 4);
    doc.setTextColor(0, 0, 0);
  }

  return doc;
}

export function previewSettlementPdfBlobUrl(opts: Parameters<typeof buildSettlementPdf>[0]): string {
  const doc = buildSettlementPdf(opts);
  const blob = doc.output("blob");
  return URL.createObjectURL(blob);
}

export async function downloadSettlementPdf(opts: Parameters<typeof buildSettlementPdf>[0]): Promise<void> {
  const doc = buildSettlementPdf(opts);
  const { driver, inicio, fin } = opts;
  const name = safeFileSegment(driver.nombre);
  doc.save(`liquidacion_${name}_${inicio}_${fin}.pdf`);
}
