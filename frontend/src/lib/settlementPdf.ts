import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import type { Driver, Trip } from "@/types/tlo";
import type { SettlementSummary } from "@/lib/calc";
import { computeTrip } from "@/lib/calc";
import { fmtMXN, fmtDate, fmtNumber } from "@/lib/format";

function safeFileSegment(s: string): string {
  return s.replace(/[/\\?%*:|"<>]/g, "-").replace(/\s+/g, "_").slice(0, 64);
}

type DocWithAutoTable = jsPDF & { lastAutoTable?: { finalY: number } };

export function downloadSettlementPdf(opts: {
  tenantNombre: string;
  driver: Driver;
  inicio: string;
  fin: string;
  summary: SettlementSummary;
}): void {
  const { tenantNombre, driver, inicio, fin, summary } = opts;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const margin = 14;
  let y = 16;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("Liquidación semanal", margin, y);
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
    headStyles: { fillColor: [33, 37, 41], textColor: 255 },
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
  y += 10;

  doc.setFillColor(33, 37, 41);
  doc.roundedRect(margin, y, 182, 18, 2, 2, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9);
  doc.text("NETO A PAGAR", margin + 4, y + 7);
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text(fmtMXN(summary.neto_pagar), margin + 4, y + 14);
  doc.setTextColor(0, 0, 0);

  const name = safeFileSegment(driver.nombre);
  doc.save(`liquidacion_${name}_${inicio}_${fin}.pdf`);
}
