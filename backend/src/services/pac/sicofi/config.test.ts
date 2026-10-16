import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveSicofiPagos40Url } from "./config";

describe("resolveSicofiPagos40Url", () => {
  it("cuelga Pagos40 de la base del tenant", () => {
    assert.equal(
      resolveSicofiPagos40Url({ pac_url: "https://demo.sicofi.com.mx/DFWSR/api" }),
      "https://demo.sicofi.com.mx/DFWSR/api/Comprobante40/Pagos40",
    );
  });
});
