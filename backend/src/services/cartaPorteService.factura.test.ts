import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { needsFacturaFromSicofi } from "./cartaPorteService";

describe("needsFacturaFromSicofi", () => {
  it("pide folio cuando está vacío o solo espacios", () => {
    assert.equal(needsFacturaFromSicofi(null), true);
    assert.equal(needsFacturaFromSicofi(undefined), true);
    assert.equal(needsFacturaFromSicofi(""), true);
    assert.equal(needsFacturaFromSicofi("   "), true);
  });

  it("pide folio cuando no es puramente numérico", () => {
    assert.equal(needsFacturaFromSicofi("PEND-1"), true);
    assert.equal(needsFacturaFromSicofi("CP-3940"), true);
    assert.equal(needsFacturaFromSicofi("F-8826"), true);
    assert.equal(needsFacturaFromSicofi("3940a"), true);
  });

  it("conserva un número de factura ya numérico", () => {
    assert.equal(needsFacturaFromSicofi("3940"), false);
    assert.equal(needsFacturaFromSicofi("1"), false);
    assert.equal(needsFacturaFromSicofi(" 8826 "), false);
  });
});
