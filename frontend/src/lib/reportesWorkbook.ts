import type { TableColumn, WorkbookSheet } from "@/lib/exportXlsx";
import type {
  ExpenseCategory,
  FuelSummaryRow,
  MaintenanceReportsSummary,
  MaintenanceType,
  ReportsCriterioFecha,
  ReportsOverview,
  ReportsTripRow,
} from "@/types/tlo";

export type ReportTab =
  | "resumen"
  | "viajes"
  | "negativos"
  | "camion"
  | "mensual"
  | "operador"
  | "cliente"
  | "rutas"
  | "gastos"
  | "combustible"
  | "mantenimientos";

export type RouteTripSort = "margen" | "utilidad" | "utilidad_km";

export type ReportDownload =
  | { filename: string; sheets: WorkbookSheet[] }
  | { error: string };

type Range = { desde: string; hasta: string };
type Row = Record<string, string | number | null>;

const MESES = [
  "ENERO",
  "FEBRERO",
  "MARZO",
  "ABRIL",
  "MAYO",
  "JUNIO",
  "JULIO",
  "AGOSTO",
  "SEPTIEMBRE",
  "OCTUBRE",
  "NOVIEMBRE",
  "DICIEMBRE",
];

const EXPENSE_LABELS: Record<ExpenseCategory, string> = {
  casetas: "Casetas",
  refacciones: "Refacciones",
  hospedaje: "Hospedaje",
  comidas: "Comidas",
  otros: "Otros",
};

const MAINTENANCE_TIPO_LABEL: Record<MaintenanceType, string> = {
  preventivo: "Preventivo",
  menor: "Menor",
  intermedio: "Intermedio",
  mayor: "Mayor",
  correctivo: "Correctivo",
};

export function routeKey(row: { ruta: string; origen: string; destino: string }): string {
  return row.ruta || `${row.origen} → ${row.destino}`;
}

export function tripUtilidadPorKm(t: { utilidad: number; km: number }): number {
  return t.km > 0 ? t.utilidad / t.km : 0;
}

export function sortRouteTrips<T extends { utilidad: number; km: number; margen: number; folio: string }>(
  trips: readonly T[],
  criterion: RouteTripSort,
): T[] {
  const score = (t: T) => {
    if (criterion === "utilidad") return t.utilidad;
    if (criterion === "utilidad_km") return tripUtilidadPorKm(t);
    return t.margen;
  };
  return [...trips].sort((a, b) => score(b) - score(a) || a.folio.localeCompare(b.folio));
}

function splitDate(iso: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim().slice(0, 10));
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

/** Título del resumen semanal, con el nombre del reporte: "VIAJES DEL 1 DE NOVIEMBRE AL 30". */
export function periodTitle(prefix: string, desde: string, hasta: string): string {
  const start = splitDate(desde);
  const end = splitDate(hasta);
  if (!start || !end) return `${prefix} DEL ${desde} AL ${hasta}`;
  const left = `${start.day} DE ${MESES[start.month - 1]}`;
  const sameMonth = start.month === end.month && start.year === end.year;
  const right = sameMonth ? String(end.day) : `${end.day} DE ${MESES[end.month - 1]}`;
  const yearFrom = start.year !== end.year ? ` DE ${start.year}` : "";
  const yearTo = start.year !== end.year ? ` DE ${end.year}` : "";
  return `${prefix} DEL ${left}${yearFrom} AL ${right}${yearTo}`;
}

function formatIso(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  if (!y || !m || !d || y.length !== 4) return iso;
  return `${d}/${m}/${y}`;
}

function formatMonth(mes: string): string {
  const [y, m] = mes.split("-");
  const name = MESES[Number(m) - 1];
  if (!y || !name) return mes;
  return `${name} ${y}`;
}

function criterioLabel(criterio: ReportsCriterioFecha): string {
  return criterio === "llegada" ? "Viajes por fecha de llegada" : "Viajes por fecha de salida";
}

function subtitle(range: Range, extra?: string): string {
  const period = `Periodo: ${formatIso(range.desde)} – ${formatIso(range.hasta)}`;
  return extra ? `${period} · ${extra}` : period;
}

function fileName(prefix: string, range: Range): string {
  return `${prefix}_${range.desde}_${range.hasta}.xlsx`;
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function sumOf(rows: readonly Row[], key: string): number {
  return rows.reduce((acc, row) => acc + (typeof row[key] === "number" ? row[key] : 0), 0);
}

function tipoLabel(tipo: string): string {
  return tipo === "foraneo" ? "Foráneo" : "Local";
}

function table(input: {
  name: string;
  title: string;
  range: Range;
  extra?: string;
  columns: TableColumn[];
  rows: Row[];
  totals?: Extract<WorkbookSheet, { type: "table" }>["totals"];
}): Extract<WorkbookSheet, { type: "table" }> {
  return {
    type: "table",
    name: input.name,
    title: periodTitle(input.title, input.range.desde, input.range.hasta),
    subtitle: subtitle(input.range, input.extra),
    columns: input.columns,
    rows: input.rows,
    totals: input.totals,
  };
}

function tripColumns(withDiesel: boolean): TableColumn[] {
  const money = (key: string, header: string) => ({ key, header, kind: "money" as const, width: 16 });
  const base = [
    { key: "folio", header: "FOLIO", kind: "text" as const, width: 16 },
    { key: "fecha", header: "FECHA", kind: "text" as const, width: 14 },
    ...(withDiesel ? [{ key: "fecha_salida", header: "FECHA SALIDA", kind: "text" as const, width: 16 }] : []),
    ...(withDiesel ? [{ key: "fecha_llegada", header: "FECHA LLEGADA", kind: "text" as const, width: 16 }] : []),
    { key: "ruta", header: "RUTA", kind: "text" as const, width: 28 },
    { key: "origen", header: "ORIGEN", kind: "text" as const, width: 18 },
    { key: "destino", header: "DESTINO", kind: "text" as const, width: 18 },
    { key: "cliente", header: "CLIENTE", kind: "text" as const, width: 28 },
    { key: "operador", header: "OPERADOR", kind: "text" as const, width: 26 },
    { key: "unidad", header: "UNIDAD", kind: "text" as const, width: 14 },
    money("ingreso", "INGRESO"),
    ...(withDiesel ? [money("diesel", "DIESEL"), money("gastos", "GASTOS"), money("comision", "COMISIÓN")] : []),
    money("costo", "COSTO TOTAL"),
    money("utilidad", "UTILIDAD"),
    { key: "margen", header: "MARGEN %", kind: "percent" as const, width: 12, total: "none" as const },
    { key: "km", header: "KM", kind: "number" as const, width: 12 },
  ];
  return base;
}

function tripRow(t: {
  folio: string;
  fecha_ref?: string;
  fecha_salida: string;
  fecha_llegada?: string | null;
  ruta: string;
  origen: string;
  destino: string;
  razon_social: string | null;
  operador: string;
  numero_economico: string;
  ingreso: number;
  diesel_total?: number;
  gastos_total?: number;
  comision?: number;
  costo_total: number;
  utilidad: number;
  margen: number;
  km: number;
}, withDiesel: boolean): Row {
  const row: Row = {
    folio: t.folio,
    fecha: formatIso(t.fecha_ref || t.fecha_salida),
    ruta: t.ruta,
    origen: t.origen,
    destino: t.destino,
    cliente: t.razon_social ?? "",
    operador: t.operador,
    unidad: t.numero_economico,
    ingreso: t.ingreso,
    costo: t.costo_total,
    utilidad: t.utilidad,
    margen: t.margen,
    km: t.km,
  };
  if (withDiesel) {
    row.fecha_salida = formatIso(t.fecha_salida);
    row.fecha_llegada = t.fecha_llegada ? formatIso(t.fecha_llegada) : "";
    row.diesel = t.diesel_total ?? 0;
    row.gastos = t.gastos_total ?? 0;
    row.comision = t.comision ?? 0;
  }
  return row;
}

function monthColumns(withUnit: boolean): TableColumn[] {
  return [
    { key: "mes", header: "MES", kind: "text" as const, width: 18 },
    ...(withUnit ? [{ key: "unidad", header: "NO. ECONÓMICO", kind: "text" as const, width: 16 }] : []),
    { key: "viajes", header: "VIAJES", kind: "integer" as const, width: 12 },
    { key: "km", header: "KM", kind: "number" as const, width: 12 },
    { key: "ingreso", header: "FACTURACIÓN", kind: "money" as const, width: 16 },
    { key: "utilidad", header: "UTILIDAD", kind: "money" as const, width: 16 },
    { key: "gasto_mantenimiento", header: "GASTO MNTO", kind: "money" as const, width: 16 },
    { key: "utilidad_despues_operacion", header: "UTILIDAD POST-OP", kind: "money" as const, width: 18 },
    { key: "utilidad_por_km", header: "UTILIDAD/KM", kind: "money" as const, width: 14, total: "none" as const },
    { key: "costo_mnto_por_km", header: "COSTO MNTO/KM", kind: "money" as const, width: 16, total: "none" as const },
  ];
}

function monthRow(r: {
  mes: string;
  numero_economico?: string;
  viajes: number;
  km: number;
  ingreso: number;
  utilidad: number;
  gasto_mantenimiento: number;
  utilidad_despues_operacion: number;
  utilidad_por_km: number;
  costo_mnto_por_km: number;
}): Row {
  return {
    mes: formatMonth(r.mes),
    unidad: r.numero_economico ?? "",
    viajes: r.viajes,
    km: r.km,
    ingreso: r.ingreso,
    utilidad: r.utilidad,
    gasto_mantenimiento: r.gasto_mantenimiento,
    utilidad_despues_operacion: r.utilidad_despues_operacion,
    utilidad_por_km: r.utilidad_por_km,
    costo_mnto_por_km: r.costo_mnto_por_km,
  };
}

export function buildReportDownload(input: {
  tab: ReportTab;
  range: Range;
  criterio: ReportsCriterioFecha;
  overview: ReportsOverview | null;
  maintenance: MaintenanceReportsSummary | null;
  fuel: FuelSummaryRow[];
}): ReportDownload {
  const { tab, range, criterio, overview, maintenance, fuel } = input;
  if (tab === "mantenimientos") {
    if (!maintenance) return { error: "No hay datos para exportar" };
    return { filename: fileName("reportes", range), sheets: maintenanceSheets(range, maintenance) };
  }
  if (!overview) return { error: "No hay datos para exportar" };
  const extra = criterioLabel(criterio);

  if (tab === "viajes") return { filename: fileName("viajes", range), sheets: [viajesSheet(range, overview, extra)] };
  if (tab === "negativos") return { filename: fileName("reportes", range), sheets: [negativosSheet(range, overview, extra)] };
  if (tab === "camion") return { filename: fileName("reportes", range), sheets: [camionSheet(range, overview, extra)] };
  if (tab === "mensual") return { filename: fileName("reportes", range), sheets: mensualSheets(range, overview, extra) };
  if (tab === "operador") return { filename: fileName("reportes", range), sheets: [operadorSheet(range, overview, extra)] };
  if (tab === "cliente") return { filename: fileName("reportes", range), sheets: [clienteSheet(range, overview, extra)] };
  if (tab === "rutas") return { filename: fileName("reportes", range), sheets: [rutasSheet(range, overview, extra)] };
  if (tab === "gastos") return { filename: fileName("reportes", range), sheets: [gastosSheet(range, overview, extra)] };
  if (tab === "combustible") return { filename: fileName("reportes", range), sheets: fuelSheets(range, fuel) };
  return { filename: fileName("reportes", range), sheets: resumenSheets(range, overview, extra) };
}

export function buildRouteBreakdownDownload(
  range: Range,
  overview: ReportsOverview,
  sort: RouteTripSort,
): ReportDownload {
  const tripsByRoute = new Map<string, ReportsTripRow[]>();
  for (const trip of overview.by_trip ?? []) {
    const key = routeKey(trip);
    const list = tripsByRoute.get(key);
    if (list) list.push(trip);
    else tripsByRoute.set(key, [trip]);
  }

  const rows: Row[] = [];
  for (const route of overview.by_route) {
    const key = routeKey(route);
    const trips = sortRouteTrips(tripsByRoute.get(key) ?? [], sort);
    for (const trip of trips) {
      rows.push({
        ruta: key,
        origen: route.origen || trip.origen,
        destino: route.destino || trip.destino,
        folio: trip.folio,
        fecha: formatIso(trip.fecha_ref),
        cliente: trip.razon_social ?? "",
        operador: trip.operador,
        unidad: trip.numero_economico,
        ingreso: trip.ingreso,
        diesel: trip.diesel_total,
        gastos: trip.gastos_total,
        comision: trip.comision,
        utilidad: trip.utilidad,
        margen: trip.margen,
        km: trip.km,
        utilidad_km: trip.km > 0 ? tripUtilidadPorKm(trip) : null,
      });
    }
  }

  const ingreso = sumOf(rows, "ingreso");
  const utilidad = sumOf(rows, "utilidad");
  return {
    filename: fileName("rutas_desglose", range),
    sheets: [
      table({
        name: "Desglose de rutas",
        title: "DESGLOSE DE RUTAS",
        range,
        extra: `${rows.length} viajes`,
        columns: [
          { key: "ruta", header: "RUTA", kind: "text", width: 28 },
          { key: "origen", header: "ORIGEN", kind: "text", width: 18 },
          { key: "destino", header: "DESTINO", kind: "text", width: 18 },
          { key: "folio", header: "FOLIO", kind: "text", width: 16 },
          { key: "fecha", header: "FECHA", kind: "text", width: 14 },
          { key: "cliente", header: "CLIENTE", kind: "text", width: 28 },
          { key: "operador", header: "OPERADOR", kind: "text", width: 26 },
          { key: "unidad", header: "UNIDAD", kind: "text", width: 14 },
          { key: "ingreso", header: "INGRESO", kind: "money" },
          { key: "diesel", header: "DIESEL", kind: "money" },
          { key: "gastos", header: "GASTOS", kind: "money" },
          { key: "comision", header: "COMISIÓN", kind: "money" },
          { key: "utilidad", header: "UTILIDAD", kind: "money" },
          { key: "margen", header: "MARGEN %", kind: "percent", total: "margen" },
          { key: "km", header: "KM", kind: "number" },
          { key: "utilidad_km", header: "UTILIDAD/KM", kind: "money", total: "none" },
        ],
        rows,
        totals: {
          label: "TOTALES",
          values: {
            ingreso: round2(ingreso),
            diesel: round2(sumOf(rows, "diesel")),
            gastos: round2(sumOf(rows, "gastos")),
            comision: round2(sumOf(rows, "comision")),
            utilidad: round2(utilidad),
            margen: ingreso > 0 ? round2((utilidad / ingreso) * 100) : 0,
            km: round2(sumOf(rows, "km")),
          },
        },
      }),
    ],
  };
}

function resumenSheets(range: Range, overview: ReportsOverview, extra: string): WorkbookSheet[] {
  const { totales, variacion } = overview;
  const kpis: Extract<WorkbookSheet, { type: "pairs" }> = {
    type: "pairs",
    name: "KPIs",
    title: periodTitle("RESUMEN", range.desde, range.hasta),
    subtitle: subtitle(range, extra),
    rows: [
      { label: "Viajes", value: totales.viajes, kind: "integer" },
      { label: "Ingresos", value: totales.ingreso, kind: "money" },
      { label: "Costos", value: totales.costo_total, kind: "money" },
      { label: "Utilidad", value: totales.utilidad, kind: "money" },
      { label: "Utilidad/km", value: totales.utilidad_por_km, kind: "money" },
      { label: "Gasto mantenimiento", value: totales.gasto_mantenimiento, kind: "money" },
      { label: "Costo mnto/km", value: totales.costo_mnto_por_km, kind: "money" },
      { label: "Utilidad post-operación", value: totales.utilidad_despues_operacion, kind: "money" },
      { label: "Margen %", value: totales.margen, kind: "percent" },
      { label: "Km", value: totales.km, kind: "number" },
      { label: "Viajes negativos", value: totales.viajes_negativos, kind: "integer" },
      ...(variacion
        ? [
            { label: "Variación ingreso %", value: variacion.ingreso_pct, kind: "percent" as const },
            { label: "Variación utilidad %", value: variacion.utilidad_pct, kind: "percent" as const },
            { label: "Variación margen %", value: variacion.margen_pct, kind: "percent" as const },
          ]
        : []),
    ],
  };

  const tipos = overview.by_tipo_viaje.map((row) => ({
    tipo: tipoLabel(row.tipo_viaje),
    viajes: row.viajes,
    ingreso: row.ingreso,
    utilidad: row.utilidad,
    margen: row.margen,
    km: row.km,
  }));
  const tipoIngreso = tipos.reduce((acc, row) => acc + row.ingreso, 0);
  const tipoUtilidad = tipos.reduce((acc, row) => acc + row.utilidad, 0);

  const costos: Row[] = [
    { concepto: "Diesel", monto: overview.cost_breakdown.diesel },
    { concepto: "Comisiones", monto: overview.cost_breakdown.comisiones },
    { concepto: "Gastos", monto: overview.cost_breakdown.gastos },
    { concepto: "Mantenimiento", monto: totales.gasto_mantenimiento },
  ];

  return [
    kpis,
    table({
      name: "Por tipo de viaje",
      title: "POR TIPO DE VIAJE",
      range,
      extra,
      columns: [
        { key: "tipo", header: "TIPO", kind: "text", width: 16 },
        { key: "viajes", header: "VIAJES", kind: "integer" },
        { key: "ingreso", header: "INGRESO", kind: "money" },
        { key: "utilidad", header: "UTILIDAD", kind: "money" },
        { key: "margen", header: "MARGEN %", kind: "percent", total: "margen" },
        { key: "km", header: "KM", kind: "number" },
      ],
      rows: tipos,
      totals: {
        label: "TOTALES",
        values: {
          viajes: tipos.reduce((acc, row) => acc + row.viajes, 0),
          ingreso: round2(tipoIngreso),
          utilidad: round2(tipoUtilidad),
          margen: tipoIngreso > 0 ? round2((tipoUtilidad / tipoIngreso) * 100) : 0,
          km: round2(tipos.reduce((acc, row) => acc + row.km, 0)),
        },
      },
    }),
    table({
      name: "Desglose de costos",
      title: "DESGLOSE DE COSTOS",
      range,
      extra,
      columns: [
        { key: "concepto", header: "CONCEPTO", kind: "text", width: 22 },
        { key: "monto", header: "MONTO", kind: "money" },
      ],
      rows: costos,
      totals: true,
    }),
    table({
      name: "Por mes",
      title: "POR MES",
      range,
      extra,
      columns: [
        { key: "mes", header: "MES", kind: "text", width: 18 },
        { key: "ingreso", header: "FACTURACIÓN", kind: "money" },
        { key: "utilidad", header: "UTILIDAD", kind: "money" },
        { key: "gasto_mantenimiento", header: "GASTO MNTO", kind: "money" },
        { key: "utilidad_despues_operacion", header: "UTILIDAD POST-OP", kind: "money", width: 18 },
      ],
      rows: (overview.by_month ?? []).map((row) => ({
        mes: formatMonth(row.mes),
        ingreso: row.ingreso,
        utilidad: row.utilidad,
        gasto_mantenimiento: row.gasto_mantenimiento,
        utilidad_despues_operacion: row.utilidad_despues_operacion,
      })),
      totals: true,
    }),
  ];
}

function viajesSheet(range: Range, overview: ReportsOverview, extra: string) {
  const { totales, cost_breakdown } = overview;
  const rows = (overview.by_trip ?? []).map((trip) => tripRow(trip, true));
  return table({
    name: "Viajes",
    title: "VIAJES",
    range,
    extra: `${totales.viajes} viajes · ${extra}`,
    columns: tripColumns(true),
    rows,
    totals: {
      label: "TOTALES",
      values: {
        ingreso: totales.ingreso,
        diesel: totales.diesel_total,
        gastos: cost_breakdown.gastos,
        comision: totales.comision_total,
        costo: totales.costo_total,
        utilidad: totales.utilidad,
        margen: totales.margen,
        km: totales.km,
      },
    },
  });
}

function negativosSheet(range: Range, overview: ReportsOverview, extra: string) {
  const rows = (overview.negative_trips ?? []).map((trip) => tripRow({ ...trip, fecha_ref: trip.fecha_salida }, false));
  const ingreso = sumOf(rows, "ingreso");
  const utilidad = sumOf(rows, "utilidad");
  return table({
    name: "Viajes negativos",
    title: "VIAJES NEGATIVOS",
    range,
    extra: `${rows.length} viajes · ${extra}`,
    columns: tripColumns(false),
    rows,
    totals: {
      label: "TOTALES",
      values: {
        ingreso: round2(ingreso),
        costo: round2(sumOf(rows, "costo")),
        utilidad: round2(utilidad),
        margen: ingreso > 0 ? round2((utilidad / ingreso) * 100) : 0,
        km: round2(sumOf(rows, "km")),
      },
    },
  });
}

function camionSheet(range: Range, overview: ReportsOverview, extra: string) {
  const rows = overview.by_truck
    .filter((row) => row.viajes > 0 || row.gasto_mantenimiento > 0)
    .map((row) => ({
      numero_economico: row.numero_economico,
      marca: row.marca,
      viajes: row.viajes,
      km: row.km,
      ingreso: row.ingreso,
      diesel_total: row.diesel_total,
      utilidad: row.utilidad,
      utilidad_por_km: row.utilidad_por_km,
      gasto_mantenimiento: row.gasto_mantenimiento,
      costo_mnto_por_km: row.costo_mnto_por_km,
      utilidad_despues_operacion: row.utilidad_despues_operacion,
      margen: row.margen,
      costo_por_km: row.costo_por_km,
      ingreso_por_km: row.ingreso_por_km,
    }));
  return table({
    name: "Por unidad",
    title: "POR UNIDAD",
    range,
    extra,
    columns: [
      { key: "numero_economico", header: "NO. ECONÓMICO", kind: "text", width: 16 },
      { key: "marca", header: "MARCA", kind: "text", width: 16 },
      { key: "viajes", header: "VIAJES", kind: "integer" },
      { key: "km", header: "KM", kind: "number" },
      { key: "ingreso", header: "INGRESO", kind: "money" },
      { key: "diesel_total", header: "DIESEL", kind: "money" },
      { key: "utilidad", header: "UTILIDAD", kind: "money" },
      { key: "utilidad_por_km", header: "UTILIDAD/KM", kind: "money", total: "none" },
      { key: "gasto_mantenimiento", header: "GASTO MNTO", kind: "money" },
      { key: "costo_mnto_por_km", header: "COSTO MNTO/KM", kind: "money", total: "none" },
      { key: "utilidad_despues_operacion", header: "UTILIDAD POST-OP", kind: "money", width: 18 },
      { key: "margen", header: "MARGEN %", kind: "percent", total: "margen" },
      { key: "costo_por_km", header: "COSTO/KM", kind: "money", total: "none" },
      { key: "ingreso_por_km", header: "INGRESO/KM", kind: "money", total: "none" },
    ],
    rows,
    totals: true,
  });
}

function mensualSheets(range: Range, overview: ReportsOverview, extra: string): WorkbookSheet[] {
  return [
    table({
      name: "Por mes",
      title: "POR MES",
      range,
      extra,
      columns: monthColumns(false),
      rows: (overview.by_month ?? []).map((row) => monthRow(row)),
      totals: true,
    }),
    table({
      name: "Por unidad y mes",
      title: "POR UNIDAD Y MES",
      range,
      extra,
      columns: monthColumns(true),
      rows: (overview.by_month_truck ?? []).map((row) => monthRow(row)),
      totals: true,
    }),
  ];
}

function operadorSheet(range: Range, overview: ReportsOverview, extra: string) {
  return table({
    name: "Por operador",
    title: "POR OPERADOR",
    range,
    extra,
    columns: [
      { key: "nombre", header: "OPERADOR", kind: "text", width: 28 },
      { key: "viajes", header: "VIAJES", kind: "integer" },
      { key: "km", header: "KM", kind: "number" },
      { key: "ingreso", header: "INGRESO", kind: "money" },
      { key: "comision", header: "COMISIONES", kind: "money" },
      { key: "utilidad", header: "UTILIDAD", kind: "money" },
      { key: "margen", header: "MARGEN %", kind: "percent", total: "margen" },
    ],
    rows: overview.by_driver
      .filter((row) => row.viajes > 0)
      .map((row) => ({
        nombre: row.nombre,
        viajes: row.viajes,
        km: row.km,
        ingreso: row.ingreso,
        comision: row.comision,
        utilidad: row.utilidad,
        margen: row.margen,
      })),
    totals: true,
  });
}

function clienteSheet(range: Range, overview: ReportsOverview, extra: string) {
  return table({
    name: "Por cliente",
    title: "POR CLIENTE",
    range,
    extra,
    columns: [
      { key: "razon_social", header: "CLIENTE", kind: "text", width: 32 },
      { key: "viajes", header: "VIAJES", kind: "integer" },
      { key: "km", header: "KM", kind: "number" },
      { key: "ingreso", header: "INGRESO", kind: "money" },
      { key: "utilidad", header: "UTILIDAD", kind: "money" },
      { key: "margen", header: "MARGEN %", kind: "percent", total: "margen" },
    ],
    rows: overview.by_client
      .filter((row) => row.viajes > 0)
      .map((row) => ({
        razon_social: row.razon_social,
        viajes: row.viajes,
        km: row.km,
        ingreso: row.ingreso,
        utilidad: row.utilidad,
        margen: row.margen,
      })),
    totals: true,
  });
}

function rutasSheet(range: Range, overview: ReportsOverview, extra: string) {
  return table({
    name: "Rutas",
    title: "RUTAS",
    range,
    extra,
    columns: [
      { key: "ruta", header: "RUTA", kind: "text", width: 28 },
      { key: "origen", header: "ORIGEN", kind: "text", width: 18 },
      { key: "destino", header: "DESTINO", kind: "text", width: 18 },
      { key: "viajes", header: "VIAJES", kind: "integer" },
      { key: "km", header: "KM", kind: "number" },
      { key: "ingreso", header: "INGRESO", kind: "money" },
      { key: "utilidad", header: "UTILIDAD", kind: "money" },
      { key: "margen", header: "MARGEN %", kind: "percent", total: "margen" },
    ],
    rows: overview.by_route.map((row) => ({
      ruta: row.ruta,
      origen: row.origen,
      destino: row.destino,
      viajes: row.viajes,
      km: row.km,
      ingreso: row.ingreso,
      utilidad: row.utilidad,
      margen: row.margen,
    })),
    totals: true,
  });
}

function gastosSheet(range: Range, overview: ReportsOverview, extra: string) {
  return table({
    name: "Gastos",
    title: "GASTOS",
    range,
    extra,
    columns: [
      { key: "categoria", header: "CATEGORÍA", kind: "text", width: 18 },
      { key: "monto", header: "MONTO", kind: "money" },
      { key: "pct", header: "% DEL TOTAL", kind: "percent", total: "sum" },
    ],
    rows: overview.by_expense_category
      .filter((row) => row.monto > 0)
      .map((row) => ({
        categoria: EXPENSE_LABELS[row.categoria] ?? row.categoria,
        monto: row.monto,
        pct: row.pct,
      })),
    totals: true,
  });
}

function fuelSheets(range: Range, fuel: FuelSummaryRow[]): WorkbookSheet[] {
  const units = fuel.filter((row) => row.viajes > 0 || row.litros > 0);
  const cargas: Row[] = [];
  for (const unit of units) {
    for (const carga of unit.cargas ?? []) {
      cargas.push({
        unidad: unit.numero_economico,
        placas: unit.placas,
        folio: carga.folio ?? "",
        fecha: formatIso(carga.fecha),
        ubicacion: carga.ubicacion,
        tipo: carga.tipo === "foraneo" ? "Foráneo" : "Local",
        litros: carga.litros,
        km: carga.km,
        rendimiento: carga.rendimiento,
      });
    }
  }
  return [
    table({
      name: "Combustible",
      title: "COMBUSTIBLE",
      range,
      columns: [
        { key: "unidad", header: "UNIDAD", kind: "text", width: 14 },
        { key: "placas", header: "PLACAS", kind: "text", width: 14 },
        { key: "viajes", header: "VIAJES", kind: "integer" },
        { key: "km", header: "KM", kind: "number" },
        { key: "litros", header: "LITROS", kind: "number" },
        { key: "rendimiento", header: "RENDIMIENTO KM/L", kind: "number", width: 18, total: "none" },
        { key: "litros_local", header: "LITROS LOCAL", kind: "number", width: 14 },
        { key: "rendimiento_local", header: "REND. LOCAL KM/L", kind: "number", width: 18, total: "none" },
        { key: "litros_foraneo", header: "LITROS FORÁNEO", kind: "number", width: 16 },
        { key: "rendimiento_foraneo", header: "REND. FORÁNEO KM/L", kind: "number", width: 20, total: "none" },
      ],
      rows: units.map((row) => ({
        unidad: row.numero_economico,
        placas: row.placas,
        viajes: row.viajes,
        km: row.km_recorridos,
        litros: row.litros,
        rendimiento: row.rendimiento,
        litros_local: row.litros_local,
        rendimiento_local: row.rendimiento_local,
        litros_foraneo: row.litros_foraneo,
        rendimiento_foraneo: row.rendimiento_foraneo,
      })),
      totals: true,
    }),
    table({
      name: "Cargas",
      title: "CARGAS DE COMBUSTIBLE",
      range,
      columns: [
        { key: "unidad", header: "UNIDAD", kind: "text", width: 14 },
        { key: "placas", header: "PLACAS", kind: "text", width: 14 },
        { key: "folio", header: "FOLIO", kind: "text", width: 16 },
        { key: "fecha", header: "FECHA", kind: "text", width: 14 },
        { key: "ubicacion", header: "UBICACIÓN", kind: "text", width: 28 },
        { key: "tipo", header: "TIPO", kind: "text", width: 12 },
        { key: "litros", header: "LITROS", kind: "number" },
        { key: "km", header: "KM", kind: "number" },
        { key: "rendimiento", header: "RENDIMIENTO KM/L", kind: "number", width: 18, total: "none" },
      ],
      rows: cargas,
      totals: true,
    }),
  ];
}

function maintenanceSheets(range: Range, summary: MaintenanceReportsSummary): WorkbookSheet[] {
  return [
    {
      type: "pairs",
      name: "KPIs",
      title: periodTitle("MANTENIMIENTO", range.desde, range.hasta),
      subtitle: subtitle(range),
      rows: [
        { label: "Registros", value: summary.totales.registros, kind: "integer" },
        { label: "Costo total", value: summary.totales.costo, kind: "money" },
        { label: "Unidades", value: summary.by_truck.length, kind: "integer" },
        { label: "Proveedores", value: summary.by_supplier.length, kind: "integer" },
      ],
    },
    table({
      name: "Por unidad",
      title: "MANTENIMIENTO POR UNIDAD",
      range,
      columns: [
        { key: "unidad", header: "UNIDAD", kind: "text", width: 16 },
        { key: "placas", header: "PLACAS", kind: "text", width: 14 },
        { key: "registros", header: "REGISTROS", kind: "integer" },
        { key: "costo", header: "COSTO", kind: "money" },
      ],
      rows: summary.by_truck.map((row) => ({
        unidad: row.numero_economico,
        placas: row.placas,
        registros: row.registros,
        costo: row.costo,
      })),
      totals: true,
    }),
    table({
      name: "Por proveedor",
      title: "MANTENIMIENTO POR PROVEEDOR",
      range,
      columns: [
        { key: "proveedor", header: "PROVEEDOR", kind: "text", width: 32 },
        { key: "visitas", header: "VISITAS", kind: "integer" },
        { key: "costo", header: "COSTO", kind: "money" },
      ],
      rows: summary.by_supplier.map((row) => ({
        proveedor: row.nombre,
        visitas: row.registros,
        costo: row.costo,
      })),
      totals: true,
    }),
    table({
      name: "Timeline",
      title: "TIMELINE DE MANTENIMIENTO",
      range,
      columns: [
        { key: "fecha", header: "FECHA", kind: "text", width: 14 },
        { key: "unidad", header: "UNIDAD", kind: "text", width: 14 },
        { key: "proveedor", header: "PROVEEDOR", kind: "text", width: 28 },
        { key: "tipo", header: "TIPO", kind: "text", width: 14 },
        { key: "km", header: "KM", kind: "number", total: "none" },
        { key: "costo", header: "COSTO", kind: "money" },
        { key: "descripcion", header: "DESCRIPCIÓN", kind: "text", width: 40 },
      ],
      rows: summary.timeline.map((row) => ({
        fecha: formatIso(row.fecha),
        unidad: row.numero_economico,
        proveedor: row.proveedor,
        tipo: MAINTENANCE_TIPO_LABEL[row.tipo] ?? row.tipo,
        km: row.km_odometro,
        costo: row.costo,
        descripcion: row.descripcion,
      })),
      totals: true,
    }),
  ];
}
