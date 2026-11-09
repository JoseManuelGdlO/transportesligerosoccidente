import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyExtraViaticosToTotals, sumExtraViaticos } from "./extraViaticos";

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
