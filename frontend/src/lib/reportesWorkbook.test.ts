import { Workbook, type Cell, type FillPattern } from "exceljs";
import { describe, expect, it } from "vitest";
import { buildWorkbookBuffer } from "@/lib/exportXlsx";
import {
  buildReportDownload,
  buildRouteBreakdownDownload,
  periodTitle,
} from "@/lib/reportesWorkbook";
import type { FuelSummaryRow, MaintenanceReportsSummary, ReportsOverview, ReportsTripRow } from "@/types/tlo";

function fillArgb(cell: Cell): string | undefined {
  const fill = cell.fill as FillPattern | undefined;
  return fill?.fgColor?.argb;
}

async function openSheet(bytes: Uint8Array, name: string) {
  const wb = new Workbook();
  await wb.xlsx.load(bytes as unknown as Parameters<Workbook["xlsx"]["load"]>[0]);
  const ws = wb.getWorksheet(name);
  expect(ws).toBeTruthy();
  return ws!;
}

function trip(partial: Partial<ReportsTripRow> & Pick<ReportsTripRow, "folio" | "utilidad" | "margen">): ReportsTripRow {
  return {
    trip_id: partial.folio,
    folio: partial.folio,
    fecha_salida: "2026-11-02",
    fecha_llegada: "2026-11-03",
    fecha_ref: "2026-11-02",
    origen: "Guadalajara",
    destino: "Monterrey",
    ruta: "GDL → MTY",
    razon_social: "Cliente Norte",
    operador: "Ana López",
    numero_economico: "T-01",
    ingreso: 1000,
    diesel_total: 200,
    gastos_total: 50,
    comision: 100,
    costo_total: 350,
    utilidad: partial.utilidad,
    margen: partial.margen,
    km: 100,
    ...partial,
  };
}

function overview(patch: Partial<ReportsOverview> = {}): ReportsOverview {
  const base: ReportsOverview = {
    periodo: { desde: "2026-11-01", hasta: "2026-11-30", criterio_fecha: "salida" },
    periodo_anterior: null,
    totales: {
      viajes: 2,
      ingreso: 1400,
      costo_total: 700,
      utilidad: 500,
      margen: 40,
      km: 200,
      viajes_negativos: 1,
      diesel_total: 400,
      comision_total: 180,
      utilidad_por_km: 2.5,
      gasto_mantenimiento: 90,
      costo_mnto_por_km: 0.45,
      utilidad_despues_operacion: 410,
    },
    variacion: { ingreso_pct: 12.5, costo_pct: null, utilidad_pct: -3, margen_pct: 1, viajes_pct: null, km_pct: null },
    by_time: [],
    by_truck: [],
    by_driver: [],
    by_client: [],
    by_tipo_viaje: [],
    by_route: [],
    by_expense_category: [],
    cost_breakdown: { diesel: 400, comisiones: 180, gastos: 120 },
    negative_trips: [],
    by_trip: [
      trip({ folio: "V-2", utilidad: -150, margen: -15, ingreso: 400 }),
      trip({ folio: "V-1", utilidad: 650, margen: 65 }),
    ],
    by_month: [],
    by_month_truck: [],
  };
  return {
    ...base,
    ...patch,
    totales: { ...base.totales, ...patch.totales },
  };
}

describe("periodTitle", () => {
  it("arma el título como el resumen semanal", () => {
    expect(periodTitle("VIAJES", "2026-11-01", "2026-11-30")).toBe("VIAJES DEL 1 DE NOVIEMBRE AL 30");
    expect(periodTitle("RESUMEN", "2026-12-25", "2027-01-05")).toBe(
      "RESUMEN DEL 25 DE DICIEMBRE DE 2026 AL 5 DE ENERO DE 2027",
    );
  });
});

describe("buildReportDownload", () => {
  it("rechaza la exportación si todavía no hay datos", () => {
    const result = buildReportDownload({
      tab: "resumen",
      range: { desde: "2026-11-01", hasta: "2026-11-30" },
      criterio: "salida",
      overview: null,
      maintenance: null,
      fuel: [],
    });
    expect(result).toEqual({ error: "No hay datos para exportar" });
  });

  it("pinta título, moneda, negativo y totales del periodo", async () => {
    const built = buildReportDownload({
      tab: "viajes",
      range: { desde: "2026-11-01", hasta: "2026-11-30" },
      criterio: "salida",
      overview: overview(),
      maintenance: null,
      fuel: [],
    });
    expect("error" in built).toBe(false);
    if ("error" in built) return;

    expect(built.filename).toBe("viajes_2026-11-01_2026-11-30.xlsx");
    const ws = await openSheet(await buildWorkbookBuffer(built.sheets), "Viajes");
    const title = ws.getCell("A1");
    expect(title.value).toBe("VIAJES DEL 1 DE NOVIEMBRE AL 30");
    expect(title.font?.bold).toBe(true);
    expect(title.font?.color?.argb).toBe("FFFFFFFF");
    expect(fillArgb(title)).toBe("FF4A4A4A");
    expect(title.isMerged).toBe(true);

    expect(ws.getCell("A2").value).toBe("Periodo: 01/11/2026 – 30/11/2026 · 2 viajes · Viajes por fecha de salida");
    expect(ws.getCell("A2").font?.italic).toBe(true);
    expect(ws.getCell("A3").value).toBe("FOLIO");
    expect(ws.getCell("A3").font?.color?.argb).toBe("FFFFFFFF");
    expect(fillArgb(ws.getCell("A3"))).toBe("FF4A4A4A");
    expect(ws.getCell("K3").value).toBe("INGRESO");
    expect(ws.getCell("A4").value).toBe("V-2");
    expect(ws.getCell("B4").value).toBe("02/11/2026");

    const ingreso = ws.getCell("K4");
    expect(ingreso.value).toBe(400);
    expect(ingreso.numFmt).toBe('"$"#,##0.00;[Red]-"$"#,##0.00;"-"');

    const utilidad = ws.getCell("P4");
    expect(utilidad.value).toBe(-150);
    expect(utilidad.font?.color?.argb).toBe("FFB91C1C");

    expect(ws.getCell("A6").value).toBe("TOTALES");
    expect(fillArgb(ws.getCell("A6"))).toBe("FFF2F2F2");
    expect(ws.getCell("K6").value).toBe(1400);
    expect(ws.getCell("Q6").value).toBe(40);
    const view = ws.views[0];
    expect(view?.state).toBe("frozen");
    expect(view && "ySplit" in view ? view.ySplit : undefined).toBe(3);
  });

  it("no suma el rendimiento de combustible", async () => {
    const fuel: FuelSummaryRow[] = [
      {
        truck_id: "t1",
        numero_economico: "T-01",
        placas: "ABC",
        viajes: 2,
        km_recorridos: 100,
        litros: 40,
        rendimiento: 2.5,
        litros_local: 10,
        litros_foraneo: 30,
        rendimiento_local: 3,
        rendimiento_foraneo: 2,
        cargas: [],
      },
    ];
    const built = buildReportDownload({
      tab: "combustible",
      range: { desde: "2026-11-01", hasta: "2026-11-30" },
      criterio: "salida",
      overview: overview(),
      maintenance: null,
      fuel,
    });
    if ("error" in built) throw new Error(built.error);
    const ws = await openSheet(await buildWorkbookBuffer(built.sheets), "Combustible");
    expect(ws.getCell("E5").value).toBe(40);
    expect(ws.getCell("F5").value).toBeNull();
    expect(built.sheets.map((sheet) => sheet.name)).toEqual(["Combustible", "Cargas"]);
  });

  it("separa el mantenimiento en hojas con el costo en moneda", async () => {
    const maintenance: MaintenanceReportsSummary = {
      periodo: { desde: "2026-11-01", hasta: "2026-11-30" },
      totales: { registros: 1, costo: 800 },
      by_truck: [{ truck_id: "t1", numero_economico: "T-01", placas: "ABC", registros: 1, costo: 800 }],
      by_supplier: [{ supplier_id: null, nombre: "Taller, Centro", registros: 1, costo: 800 }],
      by_time: [],
      timeline: [
        {
          id: "m1",
          fecha: "2026-11-04",
          truck_id: "t1",
          numero_economico: "T-01",
          placas: "ABC",
          supplier_id: null,
          proveedor: "Taller, Centro",
          tipo: "correctivo",
          costo: 800,
          descripcion: "Falla de clutch",
          km_odometro: 12000,
        },
      ],
    };
    const built = buildReportDownload({
      tab: "mantenimientos",
      range: { desde: "2026-11-01", hasta: "2026-11-30" },
      criterio: "salida",
      overview: null,
      maintenance,
      fuel: [],
    });
    if ("error" in built) throw new Error(built.error);
    const bytes = await buildWorkbookBuffer(built.sheets);
    const kpis = await openSheet(bytes, "KPIs");
    expect(kpis.getCell("A1").value).toBe("MANTENIMIENTO DEL 1 DE NOVIEMBRE AL 30");
    expect(kpis.getCell("B4").value).toBe(1);
    expect(kpis.getCell("B5").numFmt).toBe('"$"#,##0.00;[Red]-"$"#,##0.00;"-"');
    const timeline = await openSheet(bytes, "Timeline");
    expect(timeline.getCell("D4").value).toBe("Correctivo");
    expect(timeline.getCell("C4").value).toBe("Taller, Centro");
    expect(timeline.getCell("E5").value).toBeNull();
    expect(timeline.getCell("F5").value).toBe(800);
  });
});

describe("buildRouteBreakdownDownload", () => {
  it("ordena los viajes de la ruta y calcula el margen del total", async () => {
    const low = trip({ folio: "B", utilidad: 100, margen: 10, ingreso: 1000, km: 50 });
    const high = trip({ folio: "A", utilidad: 900, margen: 90, ingreso: 1000, km: 80 });
    const data = overview({
      by_trip: [low, high],
      by_route: [
        {
          ruta: "GDL → MTY",
          origen: "Guadalajara",
          destino: "Monterrey",
          viajes: 2,
          ingreso: 2000,
          utilidad: 1000,
          km: 130,
          margen: 50,
        },
      ],
    });
    const built = buildRouteBreakdownDownload({ desde: "2026-11-01", hasta: "2026-11-30" }, data, "margen");
    if ("error" in built) throw new Error(built.error);
    const ws = await openSheet(await buildWorkbookBuffer(built.sheets), "Desglose de rutas");
    expect(ws.getCell("D4").value).toBe("A");
    expect(ws.getCell("D5").value).toBe("B");
    expect(ws.getCell("M6").value).toBe(1000);
    expect(ws.getCell("N6").value).toBe(50);
  });
});
