import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { identityChanged } from "./clientUbicacionCatalog";
import type { UbicacionIdentityRow } from "./clientUbicacionIdentity";

const base: UbicacionIdentityRow = {
  client_id: "cli-1",
  calle: "Hidalgo",
  numero_exterior: "10",
  numero_interior: null,
  colonia: "Centro",
  colonia_clave: "0001",
  localidad: "Ocotlán",
  localidad_clave: "001",
  cp: "47829",
  nombre: "Bodega",
  rfc: "XAXX010101000",
  razon_social: "Acme SA",
};

describe("identityChanged", () => {
  it("changing only nombre is not an identity change", () => {
    assert.equal(identityChanged(base, { ...base, nombre: "Oficina" }), false);
  });

  it("changing calle is an identity change", () => {
    assert.equal(identityChanged(base, { ...base, calle: "Morelos" }), true);
  });

  it("trims before comparing cp", () => {
    assert.equal(identityChanged(base, { ...base, cp: "47829 " }), false);
  });

  it("treats null and empty string as the same", () => {
    assert.equal(
      identityChanged({ ...base, numero_interior: null }, { ...base, numero_interior: "" }),
      false,
    );
  });
});
