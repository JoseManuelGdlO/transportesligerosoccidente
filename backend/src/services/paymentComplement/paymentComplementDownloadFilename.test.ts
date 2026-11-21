import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { paymentComplementDownloadFilename } from "./paymentComplementService";

describe("paymentComplementDownloadFilename", () => {
  it("junta el folio del pago con la factura que cubre", () => {
    assert.equal(
      paymentComplementDownloadFilename("P", "8", ["CP-15"], "pdf"),
      "P-8_CP-15.pdf",
    );
    assert.equal(
      paymentComplementDownloadFilename("P", "8", ["CP-15"], "xml"),
      "P-8_CP-15.xml",
    );
  });

  it("lista cada factura una sola vez", () => {
    assert.equal(
      paymentComplementDownloadFilename("P", "8", ["CP-15", "CP-15", "A-22"], "xml"),
      "P-8_CP-15_A-22.xml",
    );
  });

  it("conserva el nombre anterior si no hay factura relacionada", () => {
    assert.equal(paymentComplementDownloadFilename("P", "8", [], "pdf"), "complemento-P-8.pdf");
  });
});
