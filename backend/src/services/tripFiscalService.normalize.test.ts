import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeFiscalUbicaciones } from "./tripFiscalService";

describe("normalizeFiscalUbicaciones", () => {
  it("conserva solo origen y destino final", () => {
    const ubicaciones = [
      { orden: 1, cp: "44100" },
      { orden: 2, cp: "45000" },
      { orden: 3, cp: "46000" },
    ];
    const fiscal = normalizeFiscalUbicaciones(ubicaciones);
    assert.equal(fiscal.length, 2);
    assert.equal(fiscal[0].orden, 1);
    assert.equal(fiscal[1].orden, 3);
    assert.equal(fiscal[1].cp, "46000");
  });

  it("devuelve un solo registro si solo hay origen", () => {
    const fiscal = normalizeFiscalUbicaciones([{ orden: 1, cp: "44100" }]);
    assert.equal(fiscal.length, 1);
  });
});
