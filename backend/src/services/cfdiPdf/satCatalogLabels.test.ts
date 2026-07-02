import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { catalogDescription, formatCatalogCode } from "./satCatalogLabels";

describe("satCatalogLabels", () => {
  it("devuelve solo la clave con codeOnly", () => {
    assert.equal(formatCatalogCode("99", "formaPago", { codeOnly: true }), "99");
    assert.equal(formatCatalogCode("PPD", "metodoPago", { codeOnly: true }), "PPD");
  });

  it("formatea clave con descripción", () => {
    assert.equal(formatCatalogCode("99", "formaPago"), "99 - Por definir");
    assert.equal(formatCatalogCode("624", "regimenFiscal"), "624 - Coordinados");
    assert.equal(formatCatalogCode("G03", "usoCfdi"), "G03 - Gastos en general");
    assert.equal(formatCatalogCode("PPD", "metodoPago"), "PPD - Pago en parcialidades o diferido");
  });

  it("devuelve em dash para clave vacía", () => {
    assert.equal(formatCatalogCode("", "formaPago"), "—");
    assert.equal(formatCatalogCode(null, "formaPago"), "—");
  });

  it("devuelve solo la clave si no hay descripción", () => {
    assert.equal(formatCatalogCode("ZZZ", "formaPago"), "ZZZ");
  });

  it("resuelve descripción sin clave", () => {
    assert.equal(catalogDescription("E54", "claveUnidad"), "Viaje");
    assert.equal(catalogDescription("UNKNOWN", "claveUnidad"), undefined);
  });
});
