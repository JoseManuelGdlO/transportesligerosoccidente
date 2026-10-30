import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  FOLIO_CFDI_PISO,
  folioParaCarta,
  issueFolioTimbrable,
  parseFolioEntero,
  siguienteFolio,
} from "./folioCfdi";

describe("siguienteFolio", () => {
  it("sin folios usados empieza en el piso", () => {
    assert.equal(siguienteFolio(null), FOLIO_CFDI_PISO);
    assert.equal(siguienteFolio(undefined), 4634);
  });

  it("el máximo 4634 propone 4635", () => {
    assert.equal(siguienteFolio(4634), 4635);
  });

  it("un máximo menor al piso no baja la serie", () => {
    assert.equal(siguienteFolio(100), 4634);
  });

  it("el máximo 4700 propone 4701", () => {
    assert.equal(siguienteFolio(4700), 4701);
  });
});

describe("parseFolioEntero", () => {
  it("acepta el entero y rechaza texto o cero", () => {
    assert.equal(parseFolioEntero("4634"), 4634);
    assert.equal(parseFolioEntero(4635), 4635);
    assert.equal(parseFolioEntero("CP-3940"), null);
    assert.equal(parseFolioEntero("0"), null);
    assert.equal(parseFolioEntero("4634.5"), null);
  });
});

describe("folioParaCarta", () => {
  it("conserva el folio propio y si no hay, usa el siguiente", () => {
    assert.equal(folioParaCarta("4637", 4634), 4637);
    assert.equal(folioParaCarta(null, 4700), 4701);
    assert.equal(folioParaCarta("CP-1", 100), 4634);
  });
});

describe("issueFolioTimbrable", () => {
  it("exige un entero en o sobre el piso", () => {
    assert.equal(issueFolioTimbrable("4634"), null);
    assert.match(issueFolioTimbrable(null) ?? "", /4634/);
    assert.match(issueFolioTimbrable("100") ?? "", /4634/);
  });
});
