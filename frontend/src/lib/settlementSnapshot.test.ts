import { describe, expect, it } from "vitest";
import {
  applySettlementFlete,
  applyTripInclusions,
  fleteLiquidacionPayload,
  settlementFlete,
  snapshotToPdfSummary,
} from "@/lib/settlementSnapshot";
import type { Driver, SettlementSummaryApi, Trip } from "@/types/tlo";

const driver: Driver = {
  id: "driver-1",
  nombre: "Operador",
  telefono: "",
  licencia: "",
  fecha_ingreso: "2026-01-01",
  comision_tipo: "porcentaje",
  comision_valor: 10,
  comision_valor_local: 10,
  comision_valor_foraneo: 15,
  estatus: "activo",
};

const trip = (id: string, tarifa: number, included = true): Trip => ({
  id,
  folio: id,
  driver_id: driver.id,
  truck_id: "truck-1",
  client_id: "client-1",
  origen: "A",
  destino: "B",
  fecha_salida: "2026-06-01T12:00:00.000Z",
  tarifa,
  viaticos_entregados: 0,
  tipo_viaje: "local",
  km_inicial: 0,
  km_final: 0,
  statuses: [],
  fuel: [],
  expenses: [],
  included,
});

function snapshotWithTrips(
  trips: Trip[],
  extras: Partial<SettlementSummaryApi> = {},
): SettlementSummaryApi {
  return {
    driver,
    periodo: { inicio: "2026-06-01", fin: "2026-06-07" },
    total_ingresos: 6000,
    total_comisiones: 600,
    total_km: 0,
    viaticos_entregados: 0,
    viaticos_comprobados: 0,
    saldo_viaticos: 0,
    total_descuentos: 400,
    total_anticipos: 0,
    total_compensaciones: 0,
    total_cuenta_abonos: 0,
    neto_pagar: 200,
    neto_calculado: 200,
    pendiente_arrastrado: 0,
    advances: [],
    discounts: [{ id: "d1", tipo: "multa", monto: 400, fecha: "2026-06-03", descripcion: "Multa" }],
    compensations: [],
    trips,
    ...extras,
  };
}

describe("snapshotToPdfSummary", () => {
  it("recalcula pendiente_arrastrado al excluir viajes, no conserva el del snapshot", () => {
    // Snapshot guardado como si ambos viajes contaran: comisión 600 − descuento 400 = 200
    const snapshot = snapshotWithTrips(
      [trip("a", 1000, true), trip("b", 5000, false)],
      {
        pendiente_arrastrado: 0,
        neto_pagar: 200,
        neto_calculado: 200,
        pendiente_item_id: "stale-pending",
      },
    );

    const pdf = snapshotToPdfSummary(snapshot);

    // Solo el viaje incluido: comisión 100 − descuento 400 = -300
    expect(pdf.total_comisiones).toBe(100);
    expect(pdf.neto_pagar).toBe(-300);
    expect(pdf.neto_calculado).toBe(-300);
    expect(pdf.pendiente_arrastrado).toBe(300);
    expect(pdf.pendiente_item_id).toBe("stale-pending");
  });

  it("deja pendiente en cero si al excluir viajes el neto deja de ser negativo", () => {
    const snapshot = snapshotWithTrips(
      [trip("a", 5000, true), trip("b", 1000, false)],
      {
        total_ingresos: 6000,
        total_comisiones: 600,
        total_descuentos: 200,
        neto_pagar: 0,
        neto_calculado: -200,
        pendiente_arrastrado: 200,
        pendiente_item_id: "pending-1",
      },
    );

    const pdf = snapshotToPdfSummary(snapshot);

    // Solo viaje a: comisión 500 − descuento 200 = 300
    expect(pdf.total_comisiones).toBe(500);
    expect(pdf.neto_pagar).toBe(300);
    expect(pdf.neto_calculado).toBe(300);
    expect(pdf.pendiente_arrastrado).toBe(0);
    expect(pdf.pendiente_item_id).toBeUndefined();
  });

  it("no recalcula si no hay viajes excluidos", () => {
    const snapshot = snapshotWithTrips([trip("a", 1000, true)], {
      neto_pagar: 0,
      neto_calculado: -50,
      pendiente_arrastrado: 50,
      pendiente_item_id: "pending-1",
    });

    const pdf = snapshotToPdfSummary(snapshot);

    expect(pdf.neto_pagar).toBe(0);
    expect(pdf.neto_calculado).toBe(-50);
    expect(pdf.pendiente_arrastrado).toBe(50);
    expect(pdf.pendiente_item_id).toBe("pending-1");
  });

  it("conserva account_items para mostrar adeudos vigentes en el PDF", () => {
    const items = [
      {
        id: "paused",
        tipo: "incidencia",
        concepto: "Llanta",
        monto_original: 3000,
        cuota_liquidacion: 500,
        saldo: 3000,
        fecha: "2026-01-01",
        descuento_activo: false,
      },
    ];
    const snapshot = snapshotWithTrips([trip("a", 1000, true)], {
      account_items: items,
    });

    const pdf = snapshotToPdfSummary(snapshot);

    expect(pdf.account_items).toEqual(items);
  });
});

describe("applyTripInclusions", () => {
  it("actualiza pendiente_arrastrado junto con el neto al excluir un viaje", () => {
    const summary = snapshotWithTrips([trip("a", 1000), trip("b", 5000)]);

    const next = applyTripInclusions(summary, driver, { a: true, b: false });

    expect(next.total_comisiones).toBe(100);
    expect(next.neto_pagar).toBe(-300);
    expect(next.neto_calculado).toBe(-300);
    expect(next.pendiente_arrastrado).toBe(300);
  });

  it("no usa el flete de liquidación para ingresos ni comisión", () => {
    const withFlete = trip("a", 1000);
    withFlete.flete_liquidacion = 9000;
    const summary = snapshotWithTrips([withFlete]);

    const next = applyTripInclusions(summary, driver, { a: true });

    expect(next.trips[0]?.tarifa).toBe(1000);
    expect(next.trips[0]?.flete_liquidacion).toBe(9000);
    expect(next.total_ingresos).toBe(1000);
    expect(next.total_comisiones).toBe(100);
  });
});

describe("flete de liquidación", () => {
  it("usa el monto de la liquidación y, si no hay, la tarifa del viaje", () => {
    expect(settlementFlete(trip("a", 1000))).toBe(1000);
    const adjusted = trip("a", 1000);
    adjusted.flete_liquidacion = 750;
    expect(settlementFlete(adjusted)).toBe(750);
    adjusted.flete_liquidacion = null;
    expect(settlementFlete(adjusted)).toBe(1000);
  });

  it("estampa el monto en la liquidación sin cambiar tarifa ni totales", () => {
    const summary = snapshotWithTrips([trip("a", 1000), trip("b", 5000)]);

    const next = applySettlementFlete(summary, { a: 750, b: null });

    expect(next.trips.find((t) => t.id === "a")?.tarifa).toBe(1000);
    expect(next.trips.find((t) => t.id === "a")?.flete_liquidacion).toBe(750);
    expect(next.trips.find((t) => t.id === "b")?.flete_liquidacion).toBeUndefined();
    expect(next.total_ingresos).toBe(summary.total_ingresos);
    expect(next.total_comisiones).toBe(summary.total_comisiones);
    expect(settlementFlete(next.trips.find((t) => t.id === "a")!)).toBe(750);
    expect(settlementFlete(next.trips.find((t) => t.id === "b")!)).toBe(5000);
  });

  it("arma el payload solo con montos de liquidación, sin la tarifa", () => {
    const kept = trip("a", 1000);
    kept.flete_liquidacion = 800;
    const cleared = trip("b", 5000);
    cleared.flete_liquidacion = 4000;

    const payload = fleteLiquidacionPayload([kept, cleared, trip("c", 200)], { b: null, c: 50 });

    expect(payload).toEqual([
      { id: "a", monto: 800 },
      { id: "c", monto: 50 },
    ]);
  });
});
