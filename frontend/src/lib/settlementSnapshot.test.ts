import { describe, expect, it } from "vitest";
import { applyTripInclusions, snapshotToPdfSummary } from "@/lib/settlementSnapshot";
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
});
