import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cartaPorteDownloadFilename } from "./cartaPorteService";

describe("cartaPorteDownloadFilename", () => {
  it("junta el folio del viaje con la serie y el folio de la factura", () => {
    const cp = { serie: "CP", folio_cfdi: "15", uuid: "uuid-1" };
    const trip = { id: "trip-1", folio: "TLO12-4" };
    assert.equal(cartaPorteDownloadFilename(cp, trip, "pdf"), "TLO12-4_CP-15.pdf");
    assert.equal(cartaPorteDownloadFilename(cp, trip, "xml"), "TLO12-4_CP-15.xml");
  });

  it("deja solo la factura si el viaje no tiene folio", () => {
    assert.equal(
      cartaPorteDownloadFilename({ serie: "CP", folio_cfdi: "15" }, { id: "trip-1", folio: "  " }, "pdf"),
      "CP-15.pdf",
    );
  });

  it("usa el folio del viaje cuando la carta aún no tiene serie", () => {
    assert.equal(
      cartaPorteDownloadFilename({ serie: null, folio_cfdi: null }, { id: "trip-1", folio: "TLO/1" }, "xml"),
      "TLO_1-carta-porte.xml",
    );
  });
});
