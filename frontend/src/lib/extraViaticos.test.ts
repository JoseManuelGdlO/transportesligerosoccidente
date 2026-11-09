import { describe, expect, it } from "vitest";
import { applyExtraViaticosToTotals, sumExtraViaticos } from "@/lib/extraViaticos";

describe("sumExtraViaticos", () => {
  it("suma entregados y comprobados", () => {
    expect(
      sumExtraViaticos([
        { monto_entregado: 500, monto_comprobado: 200 },
        { monto_entregado: 300, monto_comprobado: 300 },
      ]),
    ).toEqual({ entregados: 800, comprobados: 500 });
  });
});

describe("applyExtraViaticosToTotals", () => {
  it("agrega extras a totales de viaje y recalcula saldo", () => {
    const out = applyExtraViaticosToTotals(
      { viaticos_entregados: 1000, viaticos_comprobados: 900 },
      [{ monto_entregado: 200, monto_comprobado: 50 }],
    );
    expect(out.viaticos_entregados).toBe(1200);
    expect(out.viaticos_comprobados).toBe(950);
    expect(out.saldo_viaticos).toBe(-250);
  });
});
