import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyExtraViaticosToTotals, resolveSnapshotNetoCarryover, sumExtraViaticos } from "./extraViaticos";

describe("sumExtraViaticos", () => {
  it("suma entregados y comprobados", () => {
    assert.deepEqual(
      sumExtraViaticos([
        { monto_entregado: 500, monto_comprobado: 200 },
        { monto_entregado: 300, monto_comprobado: 300 },
      ]),
      { entregados: 800, comprobados: 500 },
    );
  });
});

describe("applyExtraViaticosToTotals", () => {
  it("agrega extras a totales de viaje y recalcula saldo", () => {
    const out = applyExtraViaticosToTotals(
      { viaticos_entregados: 1000, viaticos_comprobados: 900 },
      [{ monto_entregado: 200, monto_comprobado: 50 }],
    );
    assert.equal(out.viaticos_entregados, 1200);
    assert.equal(out.viaticos_comprobados, 950);
    assert.equal(out.saldo_viaticos, -250);
  });
});

describe("resolveSnapshotNetoCarryover", () => {
  it("sin pendiente y neto >= 0 actualiza neto_pagar", () => {
    assert.deepEqual(resolveSnapshotNetoCarryover(0, 250), { ok: true, neto_pagar: 250, pendiente_arrastrado: 0 });
  });
  it("con pendiente y mismo neto negativo conserva el arrastre", () => {
    assert.deepEqual(resolveSnapshotNetoCarryover(400, -400), { ok: true, neto_pagar: 0, pendiente_arrastrado: 400 });
  });
  it("con pendiente y neto positivo es conflicto", () => {
    assert.equal(resolveSnapshotNetoCarryover(400, 50).ok, false);
  });
  it("sin pendiente y neto negativo es conflicto", () => {
    assert.equal(resolveSnapshotNetoCarryover(0, -1).ok, false);
  });
  it("con pendiente y neto negativo de otro monto es conflicto", () => {
    assert.equal(resolveSnapshotNetoCarryover(400, -100).ok, false);
  });
});
