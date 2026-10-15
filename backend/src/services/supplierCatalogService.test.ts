import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseSupplierRfc } from "./supplierCatalogService";

describe("parseSupplierRfc", () => {
  it("exige RFC en alta y lo normaliza", () => {
    assert.equal(parseSupplierRfc("xaXX010101000", true), "XAXX010101000");
    assert.throws(() => parseSupplierRfc("  ", true), /obligatorio/);
    assert.throws(() => parseSupplierRfc("NO-ES-RFC", true), /formato SAT/);
  });

  it("en edición permite vacío y rechaza formato inválido", () => {
    assert.equal(parseSupplierRfc("", false), null);
    assert.equal(parseSupplierRfc(null, false), null);
    assert.throws(() => parseSupplierRfc("ABC", false), /formato SAT/);
  });
});
