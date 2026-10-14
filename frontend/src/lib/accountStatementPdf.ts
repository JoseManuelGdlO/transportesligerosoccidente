import { jsPDF } from "jspdf";
import { autoTable, type CellInput } from "jspdf-autotable";
import type { AccountDocument, AccountDocumentOrigen } from "@/types/tlo";
import type { PdfTemplate, PdfTemplatesConfig } from "@/types/pdfTemplate";
import { fmtNumber, parseDateOnlyLocal } from "./format";

/** Texto de ejemplo del bloque fiscal. Si no se personalizó, no se imprime un RFC falso. */
const PLACEHOLDER_COMPANY_TEXT =
  "RAZÓN SOCIAL S.A. DE C.V.\nDirección, número exterior\nColonia, CP: 00000\nMunicipio, Estado\nRFC: XXXXXXXXXXX\nTels. 00-00000000";

const CXP_TIPO: Record<AccountDocumentOrigen, string> = {
  manual: "MANUAL",
  viaje: "VIAJE",
  combustible: "COMBUSTIBLE",
  mantenimiento: "MANTENIMIENTO",
  gasto: "GASTO",
};

export type SaldosAlcance = "activos" | "todos" | "pantalla";

export const SALDOS_ALCANCE_LABEL: Record<SaldosAlcance, string> = {
  activos: "ACTIVOS",
  todos: "TODOS",
  pantalla: "FILTRO DE PANTALLA",
};

export interface AccountStatementRow {
  entidad_id: string;
  entidad_nombre: string;
  tipo_docto: string;
  folio: string;
  fecha_emision: string;
  fecha_ingreso_cobranza: string | null;
  fecha_vencimiento: string | null;
  monto_original: number;
  abonos: number;
  saldo_pendiente: number;
}

export interface SaldosGrupo {
  id: string;
  nombre: string;
  rows: AccountStatementRow[];
  neto: number;
  pagos: number;
  saldo: number;
}

export interface SaldosTotales {
  neto: number;
  pagos: number;
  saldo: number;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Helvetica (WinAnsi) no soporta →, —, etc.; un solo carácter rompe el kerning de toda la celda. */
function pdfSafeText(text: string): string {
  return text
    .replace(/\u2192/g, " > ")
    .replace(/\u2014/g, "-")
    .replace(/\u2013/g, "-")
    .replace(/\u2212/g, "-")
    .replace(/\u00B7/g, " - ")
    .replace(/\u2022/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u00A0/g, " ")
    .replace(/\u202F/g, " ");
}

function fmtAmount(n: number): string {
  return fmtNumber(n, 2);
}

/** `dd/MM/yyyy`. Vacío o inválido queda en guion ASCII. */
export function fmtPdfDate(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = parseDateOnlyLocal(String(iso).trim().slice(0, 10));
  if (!d) return "-";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

/**
 * Días de atraso = fecha de corte menos vencimiento.
 * Sin vencimiento es 0. Si el corte es anterior al vencimiento, el resultado es negativo.
 */
export function diasAtraso(fechaVencimiento: string | null | undefined, fechaCorte: string): number {
  if (!fechaVencimiento?.trim()) return 0;
  const corte = parseDateOnlyLocal(fechaCorte.trim().slice(0, 10));
  const venc = parseDateOnlyLocal(fechaVencimiento.trim().slice(0, 10));
  if (!corte || !venc) return 0;
  return Math.round((corte.getTime() - venc.getTime()) / 86_400_000);
}

export function entidadKey(
  doc: Pick<AccountDocument, "tipo" | "client_id" | "supplier_id" | "entidad_nombre">,
): string {
  if (doc.tipo === "cxc" && doc.client_id) return `c:${doc.client_id}`;
  if (doc.tipo === "cxp" && doc.supplier_id) return `s:${doc.supplier_id}`;
  return `n:${doc.entidad_nombre.trim().toLowerCase()}`;
}

export function docsConSaldo(docs: AccountDocument[]): AccountDocument[] {
  return docs.filter(
    (d) => d.saldo_pendiente > 0 && d.estatus !== "pagada" && d.estatus !== "cancelada",
  );
}

export function rowFromAccountDocument(doc: AccountDocument): AccountStatementRow {
  return {
    entidad_id: entidadKey(doc),
    entidad_nombre: doc.entidad_nombre,
    tipo_docto: doc.tipo === "cxc" ? "FACTURA" : (CXP_TIPO[doc.origen] ?? "DOCUMENTO"),
    folio: doc.folio,
    fecha_emision: doc.fecha_emision,
    fecha_ingreso_cobranza: doc.fecha_ingreso_cobranza ?? null,
    fecha_vencimiento: doc.fecha_vencimiento ?? null,
    monto_original: doc.monto_original,
    abonos: doc.abonos,
    saldo_pendiente: doc.saldo_pendiente,
  };
}

export function groupSaldos(rows: AccountStatementRow[]): { grupos: SaldosGrupo[]; totales: SaldosTotales } {
  const map = new Map<string, SaldosGrupo>();
  for (const row of rows) {
    const id = row.entidad_id || `n:${row.entidad_nombre.trim().toLowerCase()}`;
    let grupo = map.get(id);
    if (!grupo) {
      grupo = {
        id,
        nombre: row.entidad_nombre.trim() || "Sin nombre",
        rows: [],
        neto: 0,
        pagos: 0,
        saldo: 0,
      };
      map.set(id, grupo);
    }
    grupo.rows.push(row);
    grupo.neto += row.monto_original;
    grupo.pagos += row.abonos;
    grupo.saldo += row.saldo_pendiente;
  }

  const grupos = [...map.values()]
    .map((grupo) => ({
      ...grupo,
      rows: [...grupo.rows].sort(
        (a, b) => a.fecha_emision.localeCompare(b.fecha_emision) || a.folio.localeCompare(b.folio, "es"),
      ),
      neto: round2(grupo.neto),
      pagos: round2(grupo.pagos),
      saldo: round2(grupo.saldo),
    }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" }));

  const totales = grupos.reduce<SaldosTotales>(
    (acc, grupo) => ({
      neto: acc.neto + grupo.neto,
      pagos: acc.pagos + grupo.pagos,
      saldo: acc.saldo + grupo.saldo,
    }),
    { neto: 0, pagos: 0, saldo: 0 },
  );

  return {
    grupos,
    totales: {
      neto: round2(totales.neto),
      pagos: round2(totales.pagos),
      saldo: round2(totales.saldo),
    },
  };
}

function companyText(template?: PdfTemplate): string | null {
  if (!template) return null;
  const zones = [template.sections.header, template.sections.body, template.sections.footer];
  for (const zone of zones) {
    const block = zone.find((b) => b.id === "company_fiscal_block" && b.enabled);
    const text = block?.props?.text?.trim();
    if (text) return text;
  }
  return null;
}

function isPlaceholderCompany(text: string): boolean {
  return text.replace(/\r\n/g, "\n").trim() === PLACEHOLDER_COMPANY_TEXT;
}

/** Liquidación personalizada, si no el viaje, si no el nombre del tenant. */
export function empresaLineasParaSaldos(
  pdfConfig: PdfTemplatesConfig | null | undefined,
  tenantNombre: string,
): string[] {
  const settlement = companyText(pdfConfig?.settlement);
  const trip = companyText(pdfConfig?.trip);
  const chosen =
    settlement && !isPlaceholderCompany(settlement)
      ? settlement
      : trip && !isPlaceholderCompany(trip)
        ? trip
        : null;
  if (!chosen) {
    const name = tenantNombre.trim();
    return name ? [name] : [];
  }
  return chosen
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function imageFormat(dataUrl: string): "PNG" | "JPEG" | "WEBP" {
  if (dataUrl.includes("image/jpeg") || dataUrl.includes("image/jpg")) return "JPEG";
  if (dataUrl.includes("image/webp")) return "WEBP";
  return "PNG";
}

function totalesRow(label: string, neto: number, pagos: number, saldo: number): CellInput[] {
  const amount = { fontStyle: "bold" as const, halign: "right" as const };
  return [
    { content: label, colSpan: 6, styles: { fontStyle: "bold", halign: "right" } },
    { content: fmtAmount(neto), styles: amount },
    { content: fmtAmount(pagos), styles: amount },
    { content: fmtAmount(saldo), styles: amount },
    { content: fmtAmount(saldo), styles: amount },
    "",
  ];
}

export function buildAccountStatementPdf(opts: {
  titulo: "Saldos de Clientes" | "Saldos de Proveedores";
  fechaCorte: string;
  alcanceLabel: string;
  entidadEtiqueta: "CLIENTE" | "PROVEEDOR";
  /** Nombres cuando no están todos los del alcance. Null si la selección es completa. */
  seleccionLabel: string | null;
  empresaLineas: string[];
  logoDataUrl?: string | null;
  grupos: SaldosGrupo[];
  totales: SaldosTotales;
  generadoEn?: Date;
}): jsPDF {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "letter" });
  const margin = 10;
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  let companyBottom = 10;
  if (opts.logoDataUrl) {
    try {
      doc.addImage(opts.logoDataUrl, imageFormat(opts.logoDataUrl), margin, 8, 16, 16);
    } catch {
      // Un logo ilegible no debe impedir el estado de saldos.
    }
  }

  const textX = opts.logoDataUrl ? margin + 20 : margin;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  let y = 12;
  const companyMaxW = pageW * 0.46;
  for (const line of opts.empresaLineas) {
    const wrapped = doc.splitTextToSize(pdfSafeText(line), companyMaxW);
    doc.text(wrapped, textX, y);
    y += wrapped.length * 3.5;
  }
  companyBottom = Math.max(companyBottom, y);

  let rightY = 12;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(pdfSafeText(opts.titulo), pageW - margin, rightY, { align: "right" });
  rightY += 7;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const filtro = opts.seleccionLabel
    ? `${opts.entidadEtiqueta}: ${opts.alcanceLabel} (${opts.seleccionLabel})`
    : `${opts.entidadEtiqueta}: ${opts.alcanceLabel}`;
  const filtroLines = doc.splitTextToSize(pdfSafeText(filtro), pageW * 0.42);
  doc.text(filtroLines, pageW - margin, rightY, { align: "right" });
  rightY += filtroLines.length * 4;
  doc.text(`Fecha: ${fmtPdfDate(opts.fechaCorte)}`, pageW - margin, rightY, { align: "right" });
  rightY += 4;

  const startY = Math.max(companyBottom, rightY) + 3;

  const body: CellInput[][] = [];
  for (const grupo of opts.grupos) {
    body.push([
      {
        content: grupo.nombre,
        colSpan: 11,
        styles: { fontStyle: "bold", fillColor: [255, 255, 255], textColor: [33, 37, 41] },
      },
    ]);
    for (const row of grupo.rows) {
      body.push([
        row.tipo_docto,
        row.folio,
        fmtPdfDate(row.fecha_emision),
        fmtPdfDate(row.fecha_ingreso_cobranza),
        fmtPdfDate(row.fecha_vencimiento),
        String(diasAtraso(row.fecha_vencimiento, opts.fechaCorte)),
        fmtAmount(row.monto_original),
        fmtAmount(row.abonos),
        fmtAmount(row.saldo_pendiente),
        fmtAmount(row.saldo_pendiente),
        "MN",
      ]);
    }
    body.push(totalesRow("Totales por cliente:", grupo.neto, grupo.pagos, grupo.saldo));
  }
  body.push(totalesRow("Totales del reporte:", opts.totales.neto, opts.totales.pagos, opts.totales.saldo));

  autoTable(doc, {
    startY,
    margin: { left: margin, right: margin, bottom: 16, top: 12 },
    theme: "plain",
    showHead: "everyPage",
    head: [[
      "Tipo de Docto.",
      "Serie Folio",
      "Fecha de Expedición",
      "Recepción de documento",
      "Fecha de vencimiento",
      "Días de atraso",
      "Neto",
      "Pagos",
      "Saldo",
      "Saldo MN",
      "Moneda",
    ]],
    body,
    styles: { fontSize: 7, cellPadding: 1.1, font: "helvetica", textColor: [33, 37, 41], lineWidth: 0 },
    headStyles: {
      fillColor: [255, 255, 255],
      textColor: [33, 37, 41],
      fontStyle: "bold",
      fontSize: 7,
      lineWidth: { bottom: 0.3 },
      lineColor: [33, 37, 41],
    },
    columnStyles: {
      5: { halign: "right" },
      6: { halign: "right" },
      7: { halign: "right" },
      8: { halign: "right" },
      9: { halign: "right" },
    },
    didParseCell: (hookData) => {
      hookData.cell.text = hookData.cell.text.map((line) => pdfSafeText(String(line)));
    },
  });

  const generado = (opts.generadoEn ?? new Date()).toLocaleString("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(33, 37, 41);
    doc.text(pdfSafeText(generado), pageW - margin, pageH - 8, { align: "right" });
    doc.text(`Pagina ${i} de ${total}`, pageW - margin, pageH - 4, { align: "right" });
  }

  return doc;
}
