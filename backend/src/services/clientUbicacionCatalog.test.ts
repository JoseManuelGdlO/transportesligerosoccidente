import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { identityChanged, widenTipo } from "./clientUbicacionCatalog";
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

  it("ignores case-only differences on calle", () => {
    assert.equal(identityChanged(base, { ...base, calle: "HIDALGO" }), false);
    assert.equal(identityChanged({ ...base, calle: " hidalgo " }, { ...base, calle: "HIDALGO" }), false);
  });

  it("still detects a real calle change regardless of case", () => {
    assert.equal(identityChanged({ ...base, calle: "HIDALGO" }, { ...base, calle: "MORELOS" }), true);
  });

  it("keeps other identity fields case-sensitive", () => {
    assert.equal(identityChanged(base, { ...base, colonia: "CENTRO" }), true);
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

describe("widenTipo", () => {
  it("Origen + Destino becomes Ambos in either order", () => {
    assert.equal(widenTipo("Origen", "Destino"), "Ambos");
    assert.equal(widenTipo("Destino", "Origen"), "Ambos");
  });

  it("keeps Ambos when either side is Ambos", () => {
    assert.equal(widenTipo("Ambos", "Origen"), "Ambos");
    assert.equal(widenTipo("Ambos", "Destino"), "Ambos");
    assert.equal(widenTipo("Origen", "Ambos"), "Ambos");
    assert.equal(widenTipo("Destino", "Ambos"), "Ambos");
    assert.equal(widenTipo("Ambos", "Ambos"), "Ambos");
  });

  it("keeps the same tipo when both match", () => {
    assert.equal(widenTipo("Origen", "Origen"), "Origen");
    assert.equal(widenTipo("Destino", "Destino"), "Destino");
  });

  it("falls back to whichever side is present", () => {
    assert.equal(widenTipo("Origen", undefined), "Origen");
    assert.equal(widenTipo(null, "Destino"), "Destino");
    assert.equal(widenTipo(null, null), "Ambos");
  });
});
