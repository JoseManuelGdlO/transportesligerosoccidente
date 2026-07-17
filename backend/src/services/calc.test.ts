import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeNetoPagar, computeSettlementTotals, viaticosAFavor, viaticosNoComprobado } from "./calc";
import type { Trip } from "../models/Trip";

const driver = {
  id: "driver-1",
  comision_tipo: "porcentaje",
  comision_valor: "10",
  comision_valor_local: "10",
  comision_valor_foraneo: "15",
} as never;

const tripWithExpenses = (
  viaticos_entregados: number,
  monto_comprobado: number,
): Trip & { fuel: []; expenses: { tipo: string; monto: number; monto_comprobado: number }[] } =>
  ({
    id: "trip-1",
    driver_id: "driver-1",
    tarifa: 1000,
    viaticos_entregados,
    tipo_viaje: "local",
    km_inicial: 0,
    km_final: 100,
    fuel: [],
    expenses: [
      {
        tipo: "gasto",
        monto: monto_comprobado,
        monto_comprobado,
      },
    ],
  }) as never;

describe("computeNetoPagar", () => {
  it("suma saldo_viaticos positivo al neto", () => {
    assert.equal(
      computeNetoPagar({ total_comisiones: 5000, saldo_viaticos: 200 }),
      5200,
    );
  });

  it("resta saldo_viaticos negativo del neto", () => {
    assert.equal(
      computeNetoPagar({ total_comisiones: 5000, saldo_viaticos: -200 }),
      4800,
    );
  });
});

describe("viaticos helpers", () => {
  it("viaticosAFavor solo devuelve saldo positivo", () => {
    assert.equal(viaticosAFavor(200), 200);
    assert.equal(viaticosAFavor(-200), 0);
  });

  it("viaticosNoComprobado solo devuelve déficit", () => {
    assert.equal(viaticosNoComprobado(-200), 200);
    assert.equal(viaticosNoComprobado(200), 0);
  });
});

describe("computeSettlementTotals viaticos", () => {
  it("suma saldo a favor cuando comprobó más viáticos de los entregados", () => {
    const totals = computeSettlementTotals(driver, [tripWithExpenses(500, 700)]);

    assert.equal(totals.viaticos_entregados, 500);
    assert.equal(totals.viaticos_comprobados, 700);
    assert.equal(totals.saldo_viaticos, 200);
    assert.equal(totals.total_comisiones, 100);
    assert.equal(totals.neto_pagar, 300);
  });

  it("resta viáticos no comprobados cuando comprobó menos de lo entregado", () => {
    const totals = computeSettlementTotals(driver, [tripWithExpenses(500, 300)]);

    assert.equal(totals.saldo_viaticos, -200);
    assert.equal(totals.total_comisiones, 100);
    assert.equal(totals.neto_pagar, -100);
  });

  it("descuenta automáticamente 500 cuando entregó 3000 y comprobó 2500", () => {
    const totals = computeSettlementTotals(driver, [tripWithExpenses(3000, 2500)]);

    assert.equal(totals.viaticos_entregados, 3000);
    assert.equal(totals.viaticos_comprobados, 2500);
    assert.equal(totals.saldo_viaticos, -500);
    assert.equal(viaticosNoComprobado(totals.saldo_viaticos), 500);
    assert.equal(totals.total_comisiones, 100);
    assert.equal(totals.neto_pagar, -400);
  });
});
