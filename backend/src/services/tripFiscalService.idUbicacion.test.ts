import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  defaultIdUbicacionSat,
  isValidIdUbicacionSat,
  resolveIdUbicacionSat,
} from "./tripFiscalService";

describe("IDUbicacion SAT", () => {
  const tripId = "ae8aa900-14f1-43f6-9cfc-423d34e87751";

  it("genera OR/DE + 6 dígitos", () => {
    const origen = defaultIdUbicacionSat("Origen", tripId, 1);
    const destino = defaultIdUbicacionSat("Destino", tripId, 2);
    assert.match(origen, /^OR[0-9]{6}$/);
    assert.match(destino, /^DE[0-9]{6}$/);
    assert.notEqual(origen, destino);
  });

  it("rechaza ids legacy con hex del UUID", () => {
    assert.equal(isValidIdUbicacionSat("ORAE8AA9"), false);
    assert.equal(isValidIdUbicacionSat("OR123456"), true);
  });

  it("regenera id almacenado inválido", () => {
    const resolved = resolveIdUbicacionSat("ORAE8AA9", "Origen", tripId, 1);
    assert.match(resolved, /^OR[0-9]{6}$/);
  });
});
