import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeTripInvoiceTaxes } from "./invoiceTaxes";

describe("computeTripInvoiceTaxes", () => {
  it("calcula IVA 16% y retención 4% por defecto", () => {
    const t = computeTripInvoiceTaxes(250);
    assert.equal(t.subtotal, 250);
    assert.equal(t.iva, 40);
    assert.equal(t.retencion, 10);
    assert.equal(t.total, 280);
    assert.equal(t.traslados.length, 1);
    assert.equal(t.retenciones.length, 1);
  });

  it("respeta tasas personalizadas", () => {
    const t = computeTripInvoiceTaxes(100, { ivaTasa: 0.08, retencionTasa: 0.02 });
    assert.equal(t.iva, 8);
    assert.equal(t.retencion, 2);
    assert.equal(t.total, 106);
  });

  it("exento sin impuestos", () => {
    const t = computeTripInvoiceTaxes(500, { exento: true });
    assert.equal(t.iva, 0);
    assert.equal(t.retencion, 0);
    assert.equal(t.total, 500);
    assert.equal(t.traslados.length, 0);
  });
});
