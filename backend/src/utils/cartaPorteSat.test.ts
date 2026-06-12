import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_BIENES_TRANSP_CP,
  bienesTranspCpIssue,
  configVehicularIssue,
  isValidBienesTranspCpClave,
  isValidConfigVehicular,
  isValidPermSct,
  normalizePermSct,
  permSctIssue,
} from "./cartaPorteSat";

describe("cartaPorteSat", () => {
  it("rechaza claves CFDI de transporte en BienesTransp", () => {
    assert.equal(isValidBienesTranspCpClave("78101800"), false);
    assert.equal(isValidBienesTranspCpClave("78101801"), false);
  });

  it("acepta claves típicas de c_ClaveProdServCP", () => {
    assert.equal(isValidBienesTranspCpClave(DEFAULT_BIENES_TRANSP_CP), true);
    assert.equal(isValidBienesTranspCpClave("50202201"), true);
  });

  it("genera mensaje claro para 78101800", () => {
    const issue = bienesTranspCpIssue('Mercancía "X"', "78101800");
    assert.match(issue ?? "", /c_ClaveProdServCP/);
  });

  it("normaliza TPAFO1 a TPAF01", () => {
    assert.equal(normalizePermSct("TPAFO1"), "TPAF01");
    assert.equal(isValidPermSct("TPAFO1"), true);
    assert.equal(permSctIssue("Camión", "TPAFO1"), null);
  });

  it("rechaza config vehicular numérica", () => {
    assert.equal(isValidConfigVehicular("14500"), false);
    assert.match(configVehicularIssue("Camión", "14500") ?? "", /c_ConfigAutotransporte/);
    assert.equal(isValidConfigVehicular("C2"), true);
  });
});
