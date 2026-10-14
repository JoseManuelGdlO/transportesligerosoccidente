import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import { accountStatementTotals } from "./accountStatementTotals";

export interface AccountStatementRow {
  entidad_nombre: string;
  folio: string;
  concepto: string;
  fecha_emision: string;
  fecha_ingreso_cobranza: string | null;
  fecha_vencimiento: string | null;
  monto_original: number;
  abonos: number;
  saldo_pendiente: number;
  estatus_display: string;
}

function fmtAmount(n: number): string {
  return n.toFixed(2);
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
    .replace(/\u00A0/g, " ");
}

/** Helvetica/WinAnsi rompe el kerning con em dash (U+2014); cobranza vacía usa hyphen ASCII. */
function emptyDate(): string {
  return "-";
}

function estatusFromDisplay(display: string): "abierta" | "pagada" | "cancelada" {
  if (display === "Pagada") return "pagada";
  if (display === "Cancelada") return "cancelada";
  return "abierta";
}

export function buildAccountStatementPdf(opts: {
  titulo: "Cuentas por cobrar" | "Cuentas por pagar";
  generadoEn: string;
  rows: AccountStatementRow[];
}): jsPDF {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "letter" });
  const margin = 14;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(opts.titulo, margin, 14);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(opts.generadoEn, margin, 20);

  const totals = accountStatementTotals(
    opts.rows.map((r) => ({
      estatus: estatusFromDisplay(r.estatus_display),
      estatus_display: r.estatus_display,
      saldo_pendiente: r.saldo_pendiente,
      monto_original: r.monto_original,
    })),
  );

  autoTable(doc, {
    startY: 26,
    head: [[
      "Entidad",
      "Folio",
      "Concepto",
      "Emisión",
      "Cobranza",
      "Vencimiento",
      "Monto",
      "Abonos",
      "Saldo",
      "Estatus",
    ]],
    body: opts.rows.map((r) => [
      r.entidad_nombre,
      r.folio,
      r.concepto,
      r.fecha_emision,
      r.fecha_ingreso_cobranza || emptyDate(),
      r.fecha_vencimiento || emptyDate(),
      fmtAmount(r.monto_original),
      fmtAmount(r.abonos),
      fmtAmount(r.saldo_pendiente),
      r.estatus_display,
    ]),
    foot: [[
      {
        content: `Pendiente: ${fmtAmount(totals.pendiente)}   Vencido: ${fmtAmount(totals.vencido)}   Pagadas: ${fmtAmount(totals.pagadas)}`,
        colSpan: 10,
      },
    ]],
    showFoot: "lastPage",
    styles: { fontSize: 8, cellPadding: 1.4, font: "helvetica" },
    headStyles: { fillColor: [33, 37, 41], textColor: 255, fontSize: 8 },
    footStyles: { fillColor: [245, 246, 248], textColor: [33, 37, 41], fontStyle: "bold" },
    columnStyles: {
      6: { halign: "right" },
      7: { halign: "right" },
      8: { halign: "right" },
    },
    didParseCell: (hookData) => {
      hookData.cell.text = hookData.cell.text.map((line) => pdfSafeText(String(line)));
    },
  });

  return doc;
}
