import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { algunaCartaTimbrada, cartaVisible } from "./cartaPorteSelection";

describe("cartaVisible", () => {
  it("prefiere el borrador más reciente aunque exista una timbrada", () => {
    const visible = cartaVisible([
      { id: "t", estatus: "timbrada" as const, updatedAt: "2026-11-01" },
      { id: "b", estatus: "borrador" as const, updatedAt: "2026-11-06" },
    ]);
    assert.equal(visible?.id, "b");
  });

  it("si no hay borrador, devuelve la timbrada más reciente", () => {
    const visible = cartaVisible([
      { id: "vieja", estatus: "timbrada" as const, updatedAt: "2026-11-01" },
      { id: "nueva", estatus: "timbrada" as const, updatedAt: "2026-11-06" },
    ]);
    assert.equal(visible?.id, "nueva");
  });

  it("devuelve null si no hay cartas", () => {
    assert.equal(cartaVisible([]), null);
  });
});

describe("algunaCartaTimbrada", () => {
  it("es true si cualquiera está timbrada", () => {
    assert.equal(algunaCartaTimbrada([{ estatus: "cancelada" }, { estatus: "timbrada" }]), true);
    assert.equal(algunaCartaTimbrada([{ estatus: "borrador" }]), false);
  });
});
