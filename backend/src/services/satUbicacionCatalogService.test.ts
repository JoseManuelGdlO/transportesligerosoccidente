import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { catalogTextIncludes, foldCatalogText } from "./satUbicacionCatalogService";

describe("búsqueda de catálogo SAT sin acentos", () => {
  it("iguala JOSE con José", () => {
    assert.equal(foldCatalogText("San José del Castillo"), "san jose del castillo");
    assert.equal(catalogTextIncludes("San José del Castillo", "SAN JOSE DEL CASTILLO"), true);
    assert.equal(catalogTextIncludes("San José del Castillo", "jose"), true);
  });

  it("no marca coincidencia si el texto no contiene el término", () => {
    assert.equal(catalogTextIncludes("El Salto", "SAN JOSE DEL CASTILLO"), false);
  });
});
