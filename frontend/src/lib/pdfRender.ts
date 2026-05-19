import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import type { Client, Driver, FuelLoad, Expense, Trip, Truck } from "@/types/tlo";
import type { SettlementSummary } from "@/lib/calc";
import { computeTrip } from "@/lib/calc";
import { fmtMXN, fmtDate, fmtNumber } from "@/lib/format";
import {
  BLOCK_CATALOG,
  isBlockType,
  type BlockInstance,
  type BlockProps,
  type BlockType,
  type PdfBranding,
  type PdfTemplate,
  type TemplateKind,
  type ZoneId,
} from "@/types/pdfTemplate";

type DocWithAutoTable = jsPDF & { lastAutoTable?: { finalY: number } };

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const n = parseInt(h, 16);
  if (h.length !== 6 || Number.isNaN(n)) return [33, 37, 41];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export interface SettlementRenderData {
  kind: "settlement";
  tenantNombre: string;
  driver: Driver;
  inicio: string;
  fin: string;
  summary: SettlementSummary;
}

export interface TripRenderData {
  kind: "trip";
  tenantNombre: string;
  trip: Trip;
  driver?: Driver | null;
  truck?: Truck | null;
  client?: Client | null;
}

export type RenderData = SettlementRenderData | TripRenderData;

interface RenderState {
  doc: jsPDF;
  y: number;
  margin: number;
  pageW: number;
  pageH: number;
  branding: PdfBranding;
  logoDataUrl: string | null;
  data: RenderData;
  zone: ZoneId;
  /** Bottom Y of anchored content on the right (logo, company block in header). */
  rightColumnY: number;
  /** Reserved bottom margin for footer in mm; used by ensureSpace. */
  footerReserve: number;
  /** Active page being drawn (1-based). Updated during footer/header loops. */
  currentPage: number;
}

type BlockRenderer = (state: RenderState, props: BlockProps) => void;

function ensureSpace(state: RenderState, needed: number): void {
  const bottom = state.pageH - Math.max(14, state.footerReserve);
  if (state.y + needed > bottom) {
    state.doc.addPage();
    state.y = 16;
    state.rightColumnY = 0;
  }
}

function fmtDateShort(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function setHeaderColors(state: RenderState): {
  fill: [number, number, number];
  text: [number, number, number];
} {
  return {
    fill: hexToRgb(state.branding.color_header),
    text: hexToRgb(state.branding.color_header_text),
  };
}

function textBlock(state: RenderState, lines: string[], opts?: { bold?: boolean; size?: number; gray?: boolean; align?: "left" | "center" | "right" }) {
  const { doc, margin, pageW } = state;
  const size = opts?.size ?? 10;
  doc.setFont("helvetica", opts?.bold ? "bold" : "normal");
  doc.setFontSize(size);
  if (opts?.gray) doc.setTextColor(90, 90, 90);
  const align = opts?.align ?? "left";
  const x = align === "right" ? pageW - margin : align === "center" ? pageW / 2 : margin;
  for (const line of lines) {
    ensureSpace(state, size * 0.45 + 2);
    doc.text(line, x, state.y, { align });
    state.y += size * 0.45 + 1.5;
  }
  if (opts?.gray) doc.setTextColor(0, 0, 0);
}

const renderLogo: BlockRenderer = (state, props) => {
  if (!state.logoDataUrl) return;
  const align = props.align ?? "right";
  const w = 32;
  const h = 14;
  const fmt = state.logoDataUrl.includes("image/png") ? "PNG" : "JPEG";

  if (state.zone === "header") {
    const yTop = 10;
    const x =
      align === "right"
        ? state.pageW - state.margin - w
        : align === "center"
          ? (state.pageW - w) / 2
          : state.margin;
    try {
      state.doc.addImage(state.logoDataUrl, fmt, x, yTop, w, h);
    } catch {
      /* ignore */
    }
    if (align === "right") {
      state.rightColumnY = Math.max(state.rightColumnY, yTop + h + 2);
    } else {
      state.y = Math.max(state.y, yTop + h + 2);
    }
    return;
  }

  const x =
    align === "right"
      ? state.pageW - state.margin - w
      : align === "center"
        ? (state.pageW - w) / 2
        : state.margin;
  ensureSpace(state, h + 2);
  try {
    state.doc.addImage(state.logoDataUrl, fmt, x, state.y, w, h);
  } catch {
    /* ignore */
  }
  state.y += h + 4;
};

const renderTitle: BlockRenderer = (state, props) => {
  const sizeMap: Record<string, number> = { sm: 13, md: 16, lg: 20 };
  const size = sizeMap[props.size ?? "md"] ?? 16;
  textBlock(state, [state.branding.titulo], { bold: true, size, align: props.align ?? "left" });
  state.y += 2;
};

const renderTenantName: BlockRenderer = (state, props) => {
  textBlock(state, [`Empresa: ${state.data.tenantNombre}`], { align: props.align });
};

const renderSettlementMeta: BlockRenderer = (state, props) => {
  if (state.data.kind !== "settlement") return;
  const { driver, inicio, fin } = state.data;
  textBlock(
    state,
    [
      `Operador: ${driver.nombre}`,
      `Periodo: ${fmtDate(`${inicio}T12:00:00`)} — ${fmtDate(`${fin}T12:00:00`)}`,
    ],
    { align: props.align },
  );
};

const renderTripHeader: BlockRenderer = (state, props) => {
  if (state.data.kind !== "trip") return;
  const { trip } = state.data;
  const lines = [
    `Folio: ${trip.folio}`,
    `Ruta: ${trip.origen} → ${trip.destino}`,
    `Tipo: ${trip.tipo_viaje === "foraneo" ? "Foráneo" : "Local"} · Estatus: ${trip.estatus}`,
  ];
  textBlock(state, lines, { align: props.align });
};

const renderTripMeta: BlockRenderer = (state, props) => {
  if (state.data.kind !== "trip") return;
  const { trip, driver, truck, client } = state.data;
  const lines = [
    `Cliente: ${client?.razon_social ?? "—"}`,
    `Operador: ${driver?.nombre ?? "—"}`,
    `Camión: ${truck ? `${truck.marca} ${truck.modelo} (${truck.placas})` : "—"}`,
    `Salida: ${trip.fecha_salida ? fmtDate(trip.fecha_salida) : "—"}` +
      (trip.fecha_llegada ? ` · Llegada: ${fmtDate(trip.fecha_llegada)}` : ""),
    `Km: ${fmtNumber(trip.km_inicial)} → ${trip.km_final != null ? fmtNumber(trip.km_final) : "—"}`,
    `Factura: ${trip.num_factura?.trim() || "—"}`,
    `Viáticos entregados: ${fmtMXN(trip.viaticos_entregados)}`,
  ];
  textBlock(state, lines, { align: props.align });
};

const renderGeneratedAt: BlockRenderer = (state, props) => {
  textBlock(state, [`Generado: ${new Date().toLocaleString("es-MX")}`], {
    size: 8,
    gray: true,
    align: props.align,
  });
};

/** Multi-line right-aligned block for fiscal address. Anchored top-right when in header. */
const renderCompanyFiscalBlock: BlockRenderer = (state, props) => {
  const text = (props.text ?? "").toString().trim();
  if (!text) return;
  const align = props.align ?? "right";
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return;
  const { doc, margin, pageW } = state;
  const lineH = 3.6;

  const anchored = state.zone === "header" && align === "right";
  if (anchored) {
    const x = pageW - margin;
    let y = Math.max(state.rightColumnY + 1, 12);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(lines[0], x, y, { align: "right" });
    y += lineH + 0.8;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    for (let i = 1; i < lines.length; i++) {
      doc.text(lines[i], x, y, { align: "right" });
      y += lineH;
    }
    state.rightColumnY = Math.max(state.rightColumnY, y + 1);
    return;
  }

  ensureSpace(state, lineH * lines.length + 4);
  const x =
    align === "right" ? pageW - margin : align === "center" ? pageW / 2 : margin;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(lines[0], x, state.y, { align });
  state.y += lineH + 0.8;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  for (let i = 1; i < lines.length; i++) {
    doc.text(lines[i], x, state.y, { align });
    state.y += lineH;
  }
  state.y += 2;
};

const renderPeriodLabel: BlockRenderer = (state, props) => {
  const labelTxt = ((props.label ?? "") as string).trim() || "Fecha";
  let value = "";
  if (state.data.kind === "trip") {
    const t = state.data.trip;
    const a = fmtDateShort(t.fecha_salida);
    const b = t.fecha_llegada ? fmtDateShort(t.fecha_llegada) : "";
    value = a + (b && b !== a ? ` a ${b}` : "");
  } else {
    const a = fmtDateShort(`${state.data.inicio}T12:00:00`);
    const b = fmtDateShort(`${state.data.fin}T12:00:00`);
    value = a + (b && b !== a ? ` a ${b}` : "");
  }
  if (!value || value === "—") return;
  ensureSpace(state, 6);
  const { doc, margin, pageW } = state;
  const align = props.align ?? "left";
  const x = align === "right" ? pageW - margin : align === "center" ? pageW / 2 : margin;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(`${labelTxt}: ${value}`, x, state.y, { align });
  doc.setFont("helvetica", "normal");
  state.y += 5;
};

const renderTripInfoGrid: BlockRenderer = (state) => {
  if (state.data.kind !== "trip") return;
  const { trip, driver, truck, client } = state.data;
  const f = computeTrip(trip, driver ?? undefined);
  const { doc, margin, pageW } = state;
  const totalGastos = f.diesel_total + f.gastos_total;
  const utilXKm = f.km_recorridos > 0 ? f.utilidad / f.km_recorridos : 0;

  const peso = (trip.mercancias ?? []).reduce(
    (s, m) => s + (m.peso_kg || 0) * (m.cantidad || 1),
    0,
  );
  const cartas = (trip.carta_porte
    ? [
        [trip.carta_porte.serie, trip.carta_porte.folio_cfdi]
          .filter(Boolean)
          .join("-"),
      ]
    : []
  ).filter(Boolean) as string[];

  const leftRows: Array<[string, string]> = [
    ["Folio", `AT-${trip.folio}`],
    ["Unidad", truck?.numero_economico || truck?.placas || "—"],
    ["Ruta", `${trip.origen} / ${trip.destino}`],
    ["Operador", driver?.nombre ?? "—"],
    ["Vendedor(es)", trip.tipo_viaje === "foraneo" ? "FORÁNEO" : "LOCAL"],
    ["KM Recorridos", fmtNumber(f.km_recorridos, 2)],
    ["Cliente(s)", client?.razon_social ?? "—"],
    ["Carta(s) Porte", cartas.length > 0 ? cartas.join(", ") : "—"],
    ["Factura(s)", trip.num_factura?.trim() || "—"],
    ["Peso", peso > 0 ? `${fmtNumber(peso, 2)} kg` : "—"],
    ["SubTotal", fmtMXN(trip.tarifa)],
  ];
  const rightRows: Array<[string, string, boolean]> = [
    ["Flete", fmtMXN(f.ingreso), true],
    ["Com. Operador", fmtMXN(f.comision), false],
    ["Gastos", fmtMXN(f.costo_total), false],
    ["Total Gastos", fmtMXN(totalGastos), false],
    ["Utilidad Viaje", fmtMXN(f.utilidad), true],
    ["% Utilidad", `${fmtNumber(f.margen_pct, 2)} %`, false],
    ["Costo X KM", fmtMXN(f.costo_por_km), false],
    ["Utilidad X KM", fmtMXN(utilXKm), false],
  ];

  const gap = 6;
  const colWidth = (pageW - 2 * margin - gap) / 2;
  const col1X = margin;
  const col2X = margin + colWidth + gap;
  const rowH = 5.4;
  const padX = 2;

  const totalRows = Math.max(leftRows.length, rightRows.length);
  const blockHeight = totalRows * rowH + 4;
  ensureSpace(state, blockHeight + 4);

  const startY = state.y;

  doc.setDrawColor(225, 225, 230);
  doc.setLineWidth(0.2);
  doc.rect(col1X, startY, colWidth, totalRows * rowH + 2);
  doc.rect(col2X, startY, colWidth, totalRows * rowH + 2);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);

  let y1 = startY + 4;
  for (let i = 0; i < leftRows.length; i++) {
    if (i % 2 === 1) {
      doc.setFillColor(248, 249, 251);
      doc.rect(col1X + 0.1, y1 - 3.6, colWidth - 0.2, rowH, "F");
    }
    const [k, v] = leftRows[i];
    doc.setFont("helvetica", "bold");
    doc.setTextColor(60, 60, 60);
    doc.text(`${k} :`, col1X + padX, y1);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(20, 20, 20);
    const vw = doc.splitTextToSize(v, colWidth - padX - 32) as string[];
    doc.text(vw[0] ?? v, col1X + colWidth - padX, y1, { align: "right" });
    y1 += rowH;
  }

  let y2 = startY + 4;
  for (let i = 0; i < rightRows.length; i++) {
    if (i % 2 === 1) {
      doc.setFillColor(248, 249, 251);
      doc.rect(col2X + 0.1, y2 - 3.6, colWidth - 0.2, rowH, "F");
    }
    const [k, v, bold] = rightRows[i];
    doc.setFont("helvetica", "bold");
    doc.setTextColor(60, 60, 60);
    doc.text(`${k} :`, col2X + padX, y2);
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setTextColor(20, 20, 20);
    doc.text(v, col2X + colWidth - padX, y2, { align: "right" });
    y2 += rowH;
  }

  doc.setTextColor(0, 0, 0);
  state.y = startY + totalRows * rowH + 4;
};

const renderProvidersBreakdownTable: BlockRenderer = (state) => {
  if (state.data.kind !== "trip") return;
  const { trip } = state.data;
  const colors = setHeaderColors(state);
  const { doc, margin, pageW } = state;

  interface BreakdownRow {
    articulo: string;
    fecha: string;
    cantidad: string;
    importe: number;
    folio: string;
    detalle: string;
  }
  interface BreakdownGroup {
    proveedor: string;
    rows: BreakdownRow[];
    isFuel: boolean;
  }

  const fuel = trip.fuel ?? [];
  const expenses = trip.expenses ?? [];

  const fuelGroups = new Map<string, BreakdownGroup>();
  for (const f of fuel) {
    const prov = (f.estacion_nombre || f.ubicacion || "DIESEL").toUpperCase();
    if (!fuelGroups.has(prov)) {
      fuelGroups.set(prov, { proveedor: prov, rows: [], isFuel: true });
    }
    const importe = (f.litros || 0) * (f.precio_litro || 0);
    fuelGroups.get(prov)!.rows.push({
      articulo: "DIESEL",
      fecha: fmtDateShort(f.fecha),
      cantidad: fmtNumber(f.litros || 0, 2),
      importe,
      folio: (f.id || "").slice(0, 8).toUpperCase(),
      detalle: f.ubicacion || "",
    });
  }

  const expGroups = new Map<string, BreakdownGroup>();
  for (const e of expenses) {
    const prov = (e.categoria || "GASTOS").toUpperCase();
    if (!expGroups.has(prov)) {
      expGroups.set(prov, { proveedor: prov, rows: [], isFuel: false });
    }
    expGroups.get(prov)!.rows.push({
      articulo: e.categoria || "",
      fecha: fmtDateShort(e.fecha),
      cantidad: "1.00",
      importe: e.monto || 0,
      folio: (e.id || "").slice(0, 8).toUpperCase(),
      detalle: e.descripcion || "",
    });
  }

  const groups: BreakdownGroup[] = [
    ...Array.from(fuelGroups.values()),
    ...Array.from(expGroups.values()),
  ];

  if (groups.length === 0) {
    ensureSpace(state, 12);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(9);
    doc.setTextColor(120, 120, 120);
    doc.text("Sin diésel ni gastos registrados.", margin, state.y);
    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "normal");
    state.y += 7;
    return;
  }

  const km = (trip.km_final ?? 0) - (trip.km_inicial ?? 0);

  for (const g of groups) {
    ensureSpace(state, 24);

    doc.setFillColor(243, 244, 246);
    doc.rect(margin, state.y, pageW - margin * 2, 6, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(40, 40, 40);
    doc.text(g.proveedor, margin + 2, state.y + 4.2);
    doc.setTextColor(0, 0, 0);
    state.y += 6;

    autoTable(doc, {
      startY: state.y,
      head: [["Artículo", "Fecha", "Cantidad", "Importe", "Folio", "Detalle"]],
      body: g.rows.map((r) => [
        r.articulo,
        r.fecha,
        r.cantidad,
        fmtMXN(r.importe),
        r.folio,
        r.detalle,
      ]),
      styles: { fontSize: 8, cellPadding: 1.4, font: "helvetica" },
      headStyles: {
        fillColor: colors.fill,
        textColor: colors.text,
        fontSize: 8,
      },
      alternateRowStyles: { fillColor: [250, 250, 252] },
      margin: { left: margin, right: margin },
      columnStyles: {
        0: { cellWidth: 26 },
        1: { cellWidth: 22 },
        2: { halign: "right", cellWidth: 22 },
        3: { halign: "right", cellWidth: 26 },
        4: { cellWidth: 22 },
        5: { cellWidth: "auto" },
      },
    });
    state.y = ((doc as DocWithAutoTable).lastAutoTable?.finalY ?? state.y) + 1;

    const subtotal = g.rows.reduce((s, r) => s + r.importe, 0);
    const totalQty = g.rows.reduce(
      (s, r) => s + parseFloat(r.cantidad.replace(/,/g, "")),
      0,
    );

    doc.setDrawColor(220, 220, 220);
    doc.setLineWidth(0.2);
    doc.line(margin, state.y, pageW - margin, state.y);
    state.y += 1.5;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("Totales:", margin + 2, state.y + 3.6);
    doc.text(fmtMXN(subtotal), pageW - margin - 2, state.y + 3.6, { align: "right" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    if (g.isFuel && km > 0 && totalQty > 0) {
      const rendKmL = km / totalQty;
      doc.text(
        `${fmtNumber(totalQty, 2)} L · Rendimiento ${fmtNumber(rendKmL, 2)} km/L`,
        margin + 26,
        state.y + 3.6,
      );
    } else {
      doc.text(`${g.rows.length} conceptos`, margin + 26, state.y + 3.6);
    }
    state.y += 7;
  }
};

const renderTripTotalBox: BlockRenderer = (state) => {
  if (state.data.kind !== "trip") return;
  const f = computeTrip(state.data.trip, state.data.driver ?? undefined);
  const colors = setHeaderColors(state);
  ensureSpace(state, 14);
  const { doc, margin, pageW } = state;
  doc.setFillColor(colors.fill[0], colors.fill[1], colors.fill[2]);
  doc.rect(margin, state.y, pageW - margin * 2, 9, "F");
  doc.setTextColor(colors.text[0], colors.text[1], colors.text[2]);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("TOTAL:", margin + 3, state.y + 6);
  doc.text(
    fmtMXN(f.diesel_total + f.gastos_total),
    pageW - margin - 3,
    state.y + 6,
    { align: "right" },
  );
  doc.setTextColor(0, 0, 0);
  state.y += 13;
};

/** Renders «Página X de Y». Total Y is filled at the end of render via a placeholder. */
const renderPageCounter: BlockRenderer = (state, props) => {
  const align = props.align ?? "right";
  const { doc, margin, pageW } = state;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(110, 110, 110);
  const x = align === "right" ? pageW - margin : align === "center" ? pageW / 2 : margin;
  doc.text(`Página ${state.currentPage} de {{TOTAL_PAGES}}`, x, state.y, { align });
  doc.setTextColor(0, 0, 0);
  state.y += 4;
};

const renderKpisSummary: BlockRenderer = (state) => {
  if (state.data.kind !== "settlement") return;
  const { summary } = state.data;
  const { doc, margin } = state;
  ensureSpace(state, 16);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Viajes: ${summary.trips.length}`, margin, state.y);
  doc.text(`Ingresos: ${fmtMXN(summary.total_ingresos)}`, margin + 55, state.y);
  doc.text(`Km totales: ${fmtNumber(summary.total_km)}`, margin + 115, state.y);
  state.y += 6;
  doc.text(`Comisiones: ${fmtMXN(summary.total_comisiones)}`, margin, state.y);
  doc.text(`Neto a pagar: ${fmtMXN(summary.neto_pagar)}`, margin + 55, state.y);
  state.y += 8;
};

const renderProfitabilityKpis: BlockRenderer = (state) => {
  if (state.data.kind !== "trip") return;
  const f = computeTrip(state.data.trip, state.data.driver ?? undefined);
  const { doc, margin } = state;
  ensureSpace(state, 20);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Rentabilidad", margin, state.y);
  state.y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Ingreso: ${fmtMXN(f.ingreso)}`, margin, state.y);
  doc.text(`Diésel: ${fmtMXN(f.diesel_total)} (${fmtNumber(f.diesel_litros)} L)`, margin + 55, state.y);
  doc.text(`Gastos: ${fmtMXN(f.gastos_total)}`, margin + 130, state.y);
  state.y += 6;
  doc.text(`Comisión: ${fmtMXN(f.comision)}`, margin, state.y);
  doc.text(`Utilidad: ${fmtMXN(f.utilidad)}`, margin + 55, state.y);
  doc.text(`Margen: ${fmtNumber(f.margen_pct)}%`, margin + 130, state.y);
  state.y += 8;
};

const renderPerformanceKpis: BlockRenderer = (state) => {
  if (state.data.kind !== "trip") return;
  const f = computeTrip(state.data.trip, state.data.driver ?? undefined);
  if (f.km_recorridos <= 0) return;
  const { doc, margin } = state;
  ensureSpace(state, 20);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Desempeño", margin, state.y);
  state.y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Km recorridos: ${fmtNumber(f.km_recorridos)}`, margin, state.y);
  doc.text(`$/km (ingreso): ${fmtMXN(f.ingreso_por_km)}`, margin + 55, state.y);
  doc.text(`$/km (costo): ${fmtMXN(f.costo_por_km)}`, margin + 130, state.y);
  state.y += 6;
  doc.text(`Rendimiento: ${fmtNumber(f.rendimiento_real)} km/L`, margin, state.y);
  doc.text(`Costo diésel/km: ${fmtMXN(f.costo_diesel_por_km)}`, margin + 55, state.y);
  state.y += 8;
};

const renderTripsTable: BlockRenderer = (state) => {
  if (state.data.kind !== "settlement") return;
  const { summary, driver } = state.data;
  const colors = setHeaderColors(state);
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
  ensureSpace(state, 20);
  autoTable(state.doc, {
    startY: state.y,
    head,
    body: body.length > 0 ? body : [["—", "—", "—", "Sin viajes en el periodo", "", "", ""]],
    styles: { fontSize: 8, cellPadding: 1.5, font: "helvetica" },
    headStyles: { fillColor: colors.fill, textColor: colors.text },
    margin: { left: state.margin, right: state.margin },
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
  state.y = ((state.doc as DocWithAutoTable).lastAutoTable?.finalY ?? state.y) + 8;
};

const renderFuelTable: BlockRenderer = (state) => {
  if (state.data.kind !== "trip") return;
  const colors = setHeaderColors(state);
  const fuel = state.data.trip.fuel ?? [];
  ensureSpace(state, 20);
  state.doc.setFont("helvetica", "bold");
  state.doc.setFontSize(11);
  state.doc.text("Cargas de diésel", state.margin, state.y);
  state.y += 4;
  if (fuel.length === 0) {
    state.doc.setFont("helvetica", "normal");
    state.doc.setFontSize(9);
    state.doc.setTextColor(120, 120, 120);
    state.doc.text("Sin cargas registradas.", state.margin, state.y + 4);
    state.doc.setTextColor(0, 0, 0);
    state.y += 8;
    return;
  }
  autoTable(state.doc, {
    startY: state.y,
    head: [["Fecha", "Estación", "Tipo", "Litros", "$/L", "Total"]],
    body: fuel.map((f: FuelLoad) => [
      f.fecha ? fmtDate(f.fecha) : "—",
      f.estacion_nombre || f.ubicacion || "—",
      f.es_foraneo ? "Foráneo" : "Empresa",
      fmtNumber(f.litros),
      fmtMXN(f.precio_litro),
      fmtMXN(f.litros * f.precio_litro),
    ]),
    styles: { fontSize: 8, cellPadding: 1.5 },
    headStyles: { fillColor: colors.fill, textColor: colors.text },
    margin: { left: state.margin, right: state.margin },
    columnStyles: {
      3: { halign: "right" },
      4: { halign: "right" },
      5: { halign: "right" },
    },
  });
  state.y = ((state.doc as DocWithAutoTable).lastAutoTable?.finalY ?? state.y) + 8;
};

const renderExpensesTable: BlockRenderer = (state) => {
  if (state.data.kind !== "trip") return;
  const colors = setHeaderColors(state);
  const expenses = state.data.trip.expenses ?? [];
  ensureSpace(state, 20);
  state.doc.setFont("helvetica", "bold");
  state.doc.setFontSize(11);
  state.doc.text("Gastos", state.margin, state.y);
  state.y += 4;
  if (expenses.length === 0) {
    state.doc.setFont("helvetica", "normal");
    state.doc.setFontSize(9);
    state.doc.setTextColor(120, 120, 120);
    state.doc.text("Sin gastos registrados.", state.margin, state.y + 4);
    state.doc.setTextColor(0, 0, 0);
    state.y += 8;
    return;
  }
  autoTable(state.doc, {
    startY: state.y,
    head: [["Fecha", "Categoría", "Descripción", "Comprobado", "Monto"]],
    body: expenses.map((e: Expense) => [
      e.fecha ? fmtDate(e.fecha) : "—",
      e.categoria,
      e.descripcion || "—",
      e.comprobado ? "Sí" : "No",
      fmtMXN(e.monto),
    ]),
    styles: { fontSize: 8, cellPadding: 1.5 },
    headStyles: { fillColor: colors.fill, textColor: colors.text },
    margin: { left: state.margin, right: state.margin },
    columnStyles: { 4: { halign: "right" } },
  });
  state.y = ((state.doc as DocWithAutoTable).lastAutoTable?.finalY ?? state.y) + 8;
};

const renderCommissionBlock: BlockRenderer = (state) => {
  if (state.data.kind !== "trip") return;
  const { trip, driver } = state.data;
  const f = computeTrip(trip, driver ?? undefined);
  ensureSpace(state, 20);
  state.doc.setFont("helvetica", "bold");
  state.doc.setFontSize(11);
  state.doc.text("Comisión", state.margin, state.y);
  state.y += 6;
  state.doc.setFont("helvetica", "normal");
  state.doc.setFontSize(10);
  const tipo = driver?.comision_tipo === "porcentaje" ? "Porcentaje" : "Fijo";
  const valor = trip.tipo_viaje === "foraneo"
    ? driver?.comision_valor_foraneo ?? driver?.comision_valor ?? 0
    : driver?.comision_valor_local ?? driver?.comision_valor ?? 0;
  state.doc.text(`Esquema: ${tipo}`, state.margin, state.y);
  state.doc.text(
    `Valor: ${driver?.comision_tipo === "porcentaje" ? `${fmtNumber(valor)} %` : fmtMXN(valor)}`,
    state.margin + 55,
    state.y,
  );
  state.y += 6;
  state.doc.text(`Tarifa: ${fmtMXN(trip.tarifa)}`, state.margin, state.y);
  state.doc.text(`Comisión calculada: ${fmtMXN(f.comision)}`, state.margin + 55, state.y);
  if (typeof trip.comision_override === "number") {
    state.doc.text(`Override: ${fmtMXN(trip.comision_override)}`, state.margin + 130, state.y);
  }
  state.y += 8;
};

const renderViaticosSummary: BlockRenderer = (state) => {
  if (state.data.kind !== "settlement") return;
  const { summary } = state.data;
  ensureSpace(state, 36);
  state.doc.setFont("helvetica", "bold");
  state.doc.setFontSize(11);
  state.doc.text("Resumen de viáticos", state.margin, state.y);
  state.y += 7;
  state.doc.setFont("helvetica", "normal");
  state.doc.setFontSize(10);
  state.doc.text(`Entregados: ${fmtMXN(summary.viaticos_entregados)}`, state.margin, state.y);
  state.y += 6;
  state.doc.text(`Comprobados: ${fmtMXN(summary.viaticos_comprobados)}`, state.margin, state.y);
  state.y += 6;
  const saldoLabel = summary.saldo_viaticos >= 0 ? "A favor del operador" : "Saldo viáticos (no comprobado)";
  state.doc.text(`${saldoLabel}: ${fmtMXN(Math.abs(summary.saldo_viaticos))}`, state.margin, state.y);
  state.y += 6;
  state.doc.text(
    `Viáticos no comprobados (deducción): ${fmtMXN(Math.max(0, summary.viaticos_entregados - summary.viaticos_comprobados))}`,
    state.margin,
    state.y,
  );
  state.y += 6;
  if (summary.total_descuentos > 0) {
    state.doc.text(`Descuentos (periodo): −${fmtMXN(summary.total_descuentos)}`, state.margin, state.y);
    state.y += 6;
  }
  if (summary.total_anticipos > 0) {
    state.doc.text(`Anticipos (periodo): −${fmtMXN(summary.total_anticipos)}`, state.margin, state.y);
    state.y += 6;
  }
  state.y += 2;
};

const renderAdvancesTable: BlockRenderer = (state) => {
  if (state.data.kind !== "settlement") return;
  const advances = state.data.summary.advances ?? [];
  if (advances.length === 0) return;
  const colors = setHeaderColors(state);
  ensureSpace(state, 20);
  state.doc.setFont("helvetica", "bold");
  state.doc.setFontSize(11);
  state.doc.text("Anticipos pendientes", state.margin, state.y);
  state.y += 4;
  autoTable(state.doc, {
    startY: state.y,
    head: [["Fecha", "Descripción", "Monto", "En periodo"]],
    body: advances.map((a) => [fmtDate(a.fecha), a.descripcion, fmtMXN(a.monto), a.en_periodo === false ? "No" : "Sí"]),
    styles: { fontSize: 8, cellPadding: 1.5 },
    headStyles: { fillColor: colors.fill, textColor: colors.text },
    margin: { left: state.margin, right: state.margin },
  });
  state.y = ((state.doc as DocWithAutoTable).lastAutoTable?.finalY ?? state.y) + 8;
};

const renderDiscountsTable: BlockRenderer = (state) => {
  if (state.data.kind !== "settlement") return;
  const discounts = state.data.summary.discounts ?? [];
  if (discounts.length === 0) return;
  const colors = setHeaderColors(state);
  ensureSpace(state, 20);
  state.doc.setFont("helvetica", "bold");
  state.doc.setFontSize(11);
  state.doc.text("Descuentos pendientes", state.margin, state.y);
  state.y += 4;
  autoTable(state.doc, {
    startY: state.y,
    head: [["Tipo", "Fecha", "Descripción", "Monto", "En periodo"]],
    body: discounts.map((d) => [d.tipo, fmtDate(d.fecha), d.descripcion, fmtMXN(d.monto), d.en_periodo === false ? "No" : "Sí"]),
    styles: { fontSize: 8, cellPadding: 1.5 },
    headStyles: { fillColor: colors.fill, textColor: colors.text },
    margin: { left: state.margin, right: state.margin },
  });
  state.y = ((state.doc as DocWithAutoTable).lastAutoTable?.finalY ?? state.y) + 8;
};

const renderUbicacionesList: BlockRenderer = (state) => {
  if (state.data.kind !== "trip") return;
  const ubicaciones = state.data.trip.ubicaciones ?? [];
  if (ubicaciones.length === 0) return;
  const colors = setHeaderColors(state);
  ensureSpace(state, 20);
  state.doc.setFont("helvetica", "bold");
  state.doc.setFontSize(11);
  state.doc.text("Ubicaciones (carta porte)", state.margin, state.y);
  state.y += 4;
  autoTable(state.doc, {
    startY: state.y,
    head: [["Tipo", "Nombre/RFC", "Municipio", "Estado", "Fecha"]],
    body: ubicaciones.map((u) => [
      u.tipo,
      u.nombre || u.rfc || "—",
      u.municipio || "—",
      u.estado || "—",
      u.fecha_hora ? fmtDate(u.fecha_hora) : "—",
    ]),
    styles: { fontSize: 8, cellPadding: 1.5 },
    headStyles: { fillColor: colors.fill, textColor: colors.text },
    margin: { left: state.margin, right: state.margin },
  });
  state.y = ((state.doc as DocWithAutoTable).lastAutoTable?.finalY ?? state.y) + 8;
};

const renderMercanciasList: BlockRenderer = (state) => {
  if (state.data.kind !== "trip") return;
  const mercancias = state.data.trip.mercancias ?? [];
  if (mercancias.length === 0) return;
  const colors = setHeaderColors(state);
  ensureSpace(state, 20);
  state.doc.setFont("helvetica", "bold");
  state.doc.setFontSize(11);
  state.doc.text("Mercancías", state.margin, state.y);
  state.y += 4;
  autoTable(state.doc, {
    startY: state.y,
    head: [["Descripción", "Cantidad", "Unidad", "Peso (kg)"]],
    body: mercancias.map((m) => [
      m.descripcion,
      String(m.cantidad),
      m.unidad,
      fmtNumber(m.peso_kg),
    ]),
    styles: { fontSize: 8, cellPadding: 1.5 },
    headStyles: { fillColor: colors.fill, textColor: colors.text },
    margin: { left: state.margin, right: state.margin },
  });
  state.y = ((state.doc as DocWithAutoTable).lastAutoTable?.finalY ?? state.y) + 8;
};

const renderNetBox: BlockRenderer = (state) => {
  if (state.data.kind !== "settlement") return;
  const colors = setHeaderColors(state);
  ensureSpace(state, 24);
  state.doc.setFillColor(colors.fill[0], colors.fill[1], colors.fill[2]);
  state.doc.roundedRect(state.margin, state.y, state.pageW - state.margin * 2, 18, 2, 2, "F");
  state.doc.setTextColor(colors.text[0], colors.text[1], colors.text[2]);
  state.doc.setFontSize(9);
  state.doc.setFont("helvetica", "normal");
  state.doc.text("NETO A PAGAR", state.margin + 4, state.y + 7);
  state.doc.setFontSize(14);
  state.doc.setFont("helvetica", "bold");
  state.doc.text(fmtMXN(state.data.summary.neto_pagar), state.margin + 4, state.y + 14);
  state.doc.setTextColor(0, 0, 0);
  state.y += 20;
};

const renderFooterText: BlockRenderer = (state, props) => {
  const text = state.branding.pie_pagina.trim();
  if (!text) return;
  textBlock(state, state.doc.splitTextToSize(text, state.pageW - state.margin * 2) as string[], {
    size: 8,
    gray: true,
    align: props.align,
  });
};

const renderCustomText: BlockRenderer = (state, props) => {
  const text = (props.text ?? "").toString();
  if (!text.trim()) return;
  const sizeMap: Record<string, number> = { sm: 9, md: 10, lg: 12 };
  const size = sizeMap[props.size ?? "md"] ?? 10;
  const lines = state.doc.splitTextToSize(text, state.pageW - state.margin * 2) as string[];
  textBlock(state, lines, { size, align: props.align });
};

const renderSpacer: BlockRenderer = (state, props) => {
  const mm = Math.max(1, Math.min(60, Number(props.mm ?? 6)));
  state.y += mm;
};

const renderDivider: BlockRenderer = (state) => {
  ensureSpace(state, 4);
  state.doc.setDrawColor(200, 200, 200);
  state.doc.setLineWidth(0.2);
  state.doc.line(state.margin, state.y, state.pageW - state.margin, state.y);
  state.y += 3;
};

const BLOCK_RENDERERS: Record<BlockType, BlockRenderer> = {
  logo: renderLogo,
  title: renderTitle,
  tenant_name: renderTenantName,
  company_fiscal_block: renderCompanyFiscalBlock,
  period_label: renderPeriodLabel,
  settlement_meta: renderSettlementMeta,
  trip_header: renderTripHeader,
  trip_meta: renderTripMeta,
  trip_info_grid: renderTripInfoGrid,
  providers_breakdown_table: renderProvidersBreakdownTable,
  trip_total_box: renderTripTotalBox,
  generated_at: renderGeneratedAt,
  page_counter: renderPageCounter,
  kpis_summary: renderKpisSummary,
  profitability_kpis: renderProfitabilityKpis,
  performance_kpis: renderPerformanceKpis,
  trips_table: renderTripsTable,
  fuel_table: renderFuelTable,
  expenses_table: renderExpensesTable,
  commission_block: renderCommissionBlock,
  viaticos_summary: renderViaticosSummary,
  advances_table: renderAdvancesTable,
  discounts_table: renderDiscountsTable,
  ubicaciones_list: renderUbicacionesList,
  mercancias_list: renderMercanciasList,
  net_box: renderNetBox,
  footer_text: renderFooterText,
  custom_text: renderCustomText,
  spacer: renderSpacer,
  divider: renderDivider,
};

function renderBlocks(state: RenderState, blocks: BlockInstance[], zone: ZoneId, kind: TemplateKind): void {
  state.zone = zone;
  for (const block of blocks) {
    if (!block.enabled) continue;
    if (!isBlockType(block.id)) continue;
    const def = BLOCK_CATALOG[block.id];
    if (!def.kinds.includes(kind)) continue;
    if (!def.zones.includes(zone)) continue;
    const renderer = BLOCK_RENDERERS[block.id];
    if (!renderer) continue;
    renderer(state, block.props ?? {});
  }
}

/** Replace «{{TOTAL_PAGES}}» placeholders left by page_counter on every page. */
function fillPageTotals(doc: jsPDF): void {
  // jsPDF doesn't expose a clean rewrite API for already-drawn text; use the internal pages workaround.
  const total = doc.getNumberOfPages();
  const internal = doc as unknown as {
    internal: { pages: string[][] };
  };
  const pages = internal.internal?.pages;
  if (!Array.isArray(pages)) return;
  for (let i = 1; i <= total; i++) {
    const page = pages[i];
    if (!Array.isArray(page)) continue;
    for (let j = 0; j < page.length; j++) {
      if (typeof page[j] === "string" && page[j].includes("{{TOTAL_PAGES}}")) {
        page[j] = page[j].split("{{TOTAL_PAGES}}").join(String(total));
      }
    }
  }
}

export interface RenderOptions {
  template: PdfTemplate;
  data: RenderData;
  logoDataUrl?: string | null;
}

export function renderTemplatePdf(opts: RenderOptions): jsPDF {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const margin = 14;
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  const footerBlocks = opts.template.sections.footer.filter(
    (b) => b.enabled && isBlockType(b.id),
  );
  const footerReserve = footerBlocks.length > 0 ? 26 : 14;

  const state: RenderState = {
    doc,
    y: 16,
    margin,
    pageW,
    pageH,
    branding: opts.template.branding,
    logoDataUrl: opts.logoDataUrl ?? null,
    data: opts.data,
    zone: "header",
    rightColumnY: 0,
    footerReserve,
    currentPage: 1,
  };

  renderBlocks(state, opts.template.sections.header, "header", opts.data.kind);
  // Snap Y past anchored right-column content (logo + company block) before body.
  state.y = Math.max(state.y, state.rightColumnY) + 2;
  renderBlocks(state, opts.template.sections.body, "body", opts.data.kind);

  if (footerBlocks.length > 0) {
    const pageCount = doc.getNumberOfPages();
    for (let p = 1; p <= pageCount; p++) {
      doc.setPage(p);
      state.currentPage = p;
      state.y = pageH - footerReserve + 4;
      renderBlocks(state, footerBlocks, "footer", opts.data.kind);
    }
    fillPageTotals(doc);
  }

  return doc;
}

export function safeFileSegment(s: string): string {
  return s.replace(/[/\\?%*:|"<>]/g, "-").replace(/\s+/g, "_").slice(0, 64);
}
