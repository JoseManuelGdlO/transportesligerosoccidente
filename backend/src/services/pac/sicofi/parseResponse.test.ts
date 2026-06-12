import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseSicofiResponse, parseTimbradoXml } from "./parseResponse";

const fixtureXml = readFileSync(
  path.join(
    process.cwd(),
    "uploads/e0000000-0000-4000-8000-000000000001/cartas-porte/test.xml",
  ),
  "utf8",
);

describe("parseTimbradoXml", () => {
  it("extrae UUID, serie y folio del XML timbrado", () => {
    const meta = parseTimbradoXml(fixtureXml);
    assert.equal(meta.uuid, "4434994F-CB2B-48B8-B6B0-8D9087DC7BE0");
    assert.equal(meta.serie, "CP");
    assert.equal(meta.folio, "105");
    assert.ok(meta.fechaTimbrado);
  });
});

describe("parseSicofiResponse", () => {
  it("parsea XML crudo", () => {
    const result = parseSicofiResponse(fixtureXml);
    assert.equal(result.uuid, "4434994F-CB2B-48B8-B6B0-8D9087DC7BE0");
    assert.ok(result.xmlTimbrado.includes("cfdi:Comprobante"));
  });
});
