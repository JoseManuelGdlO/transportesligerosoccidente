import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildByMonth, withMaintenanceTotals } from "./reportsController";
import type { Truck } from "../models";

describe("withMaintenanceTotals", () => {
  const base = {
    viajes: 2,
    ingreso: 10000,
    costo_total: 4000,
    utilidad: 6000,
    margen: 60,
    km: 1000,
    viajes_negativos: 0,
    diesel_total: 2000,
    comision_total: 500,
  };

  it("calcula utilidad/km, mnto/km y utilidad post-operación", () => {
    const t = withMaintenanceTotals(base, 1500);
    assert.equal(t.utilidad_por_km, 6);
    assert.equal(t.gasto_mantenimiento, 1500);
    assert.equal(t.costo_mnto_por_km, 1.5);
    assert.equal(t.utilidad_despues_operacion, 4500);
  });

  it("evita división por cero cuando km = 0", () => {
    const t = withMaintenanceTotals({ ...base, km: 0, utilidad: 100 }, 50);
    assert.equal(t.utilidad_por_km, 0);
    assert.equal(t.costo_mnto_por_km, 0);
    assert.equal(t.utilidad_despues_operacion, 50);
  });
});

describe("buildByMonth", () => {
  const trucks = [
    { id: "truck-1", numero_economico: "TLO-01", marca: "Kenworth", modelo: "T680" },
  ] as Truck[];

  function fin(overrides: Partial<{ ingreso: number; utilidad: number; km_recorridos: number }> = {}) {
    return {
      ingreso: 1000,
      utilidad: 400,
      km_recorridos: 100,
      costo_total: 600,
      diesel_total: 300,
      comision: 100,
      gastos_total: 200,
      margen_pct: 40,
      ...overrides,
    };
  }

  it("agrupa facturación y resta mantenimiento por mes", () => {
    const enriched = [
      {
        trip: {
          truck_id: "truck-1",
          fecha_salida: new Date("2026-01-10T12:00:00Z"),
          fecha_llegada: new Date("2026-01-11T12:00:00Z"),
        } as never,
        fin: fin({ ingreso: 5000, utilidad: 2000, km_recorridos: 200 }),
      },
      {
        trip: {
          truck_id: "truck-1",
          fecha_salida: new Date("2026-02-05T12:00:00Z"),
          fecha_llegada: new Date("2026-02-06T12:00:00Z"),
        } as never,
        fin: fin({ ingreso: 3000, utilidad: 1000, km_recorridos: 150 }),
      },
    ];
    const mnto = new Map<string, number>([
      ["2026-01|||truck-1", 500],
      ["2026-02|||truck-1", 200],
    ]);

    const { by_month, by_month_truck } = buildByMonth(
      enriched,
      mnto,
      trucks,
      "2026-01-01",
      "2026-02-28",
      "salida",
    );

    assert.equal(by_month.length, 2);
    const ene = by_month.find((r) => r.mes === "2026-01")!;
    const feb = by_month.find((r) => r.mes === "2026-02")!;
    assert.equal(ene.ingreso, 5000);
    assert.equal(ene.gasto_mantenimiento, 500);
    assert.equal(ene.utilidad_despues_operacion, 1500);
    assert.equal(feb.ingreso, 3000);
    assert.equal(feb.utilidad_despues_operacion, 800);

    const eneTruck = by_month_truck.find((r) => r.mes === "2026-01" && r.truck_id === "truck-1")!;
    assert.equal(eneTruck.ingreso, 5000);
    assert.equal(eneTruck.costo_mnto_por_km, 2.5);
  });

  it("incluye mes con solo mantenimiento y km=0", () => {
    const mnto = new Map<string, number>([["2026-03|||truck-1", 800]]);
    const { by_month, by_month_truck } = buildByMonth(
      [],
      mnto,
      trucks,
      "2026-03-01",
      "2026-03-31",
      "salida",
    );
    assert.equal(by_month.length, 1);
    assert.equal(by_month[0].gasto_mantenimiento, 800);
    assert.equal(by_month[0].utilidad_despues_operacion, -800);
    assert.equal(by_month[0].costo_mnto_por_km, 0);
    assert.equal(by_month_truck[0].gasto_mantenimiento, 800);
  });
});
