import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  materialPeligrosoCoherenceIssue,
  mapMaterialPeligrosoSicofi,
  materialPeligrosoUiMode,
  resolveMaterialPeligrosoBoolean,
} from "./cartaPorteSat";
import {
  findHeaderRowIndex,
  normalizeMaterialPeligroso,
  parseSatClavesProductosRows,
} from "./satClavesProductosImport";

describe("cartaPorteSat material peligroso", () => {
  it("mapea modos de UI", () => {
    assert.equal(materialPeligrosoUiMode("0"), "hidden");
    assert.equal(materialPeligrosoUiMode("1"), "forced_yes");
    assert.equal(materialPeligrosoUiMode("0,1"), "optional");
  });

  it("resuelve booleano según catálogo", () => {
    assert.equal(resolveMaterialPeligrosoBoolean("0", true), false);
    assert.equal(resolveMaterialPeligrosoBoolean("1", false), true);
    assert.equal(resolveMaterialPeligrosoBoolean("0,1", true), true);
    assert.equal(resolveMaterialPeligrosoBoolean("0,1", undefined), false);
  });

  it("detecta incoherencias", () => {
    assert.match(materialPeligrosoCoherenceIssue('Mercancía "X"', "0", true) ?? "", /no admite/);
    assert.match(materialPeligrosoCoherenceIssue('Mercancía "X"', "1", false) ?? "", /exige/);
    assert.equal(materialPeligrosoCoherenceIssue('Mercancía "X"', "0,1", false), null);
  });

  it("mapea material peligroso para Sicofi", () => {
    assert.equal(mapMaterialPeligrosoSicofi("0", true), undefined);
    assert.equal(mapMaterialPeligrosoSicofi("1", false), "Sí");
    assert.equal(mapMaterialPeligrosoSicofi("0,1", true), "Sí");
    assert.equal(mapMaterialPeligrosoSicofi("0,1", false), "No");
  });
});

describe("satClavesProductosImport", () => {
  it("parsea filas con encabezado SAT", () => {
    const rows = [
      ["Catálogo"],
      ["Versión", "Revisión"],
      [1, "0"],
      [],
      ["c_ClaveProdServ", "Descripción", "Palabras similares", "Material Peligroso", "FechaInicioVigencia", "FechaFinVigencia"],
      ["50192100", "Botanas", "Dulces", "0", 45490, ""],
      ["12131500", "Explosivos", "", "1", 45490, ""],
      ["01010101", "No existe", "Fondos", "0,1", 45490, ""],
      ["invalid", "X", "", "0", 45490, ""],
    ];
    assert.equal(findHeaderRowIndex(rows), 4);
    const parsed = parseSatClavesProductosRows(rows);
    assert.equal(parsed.items.length, 3);
    assert.equal(parsed.items[0]?.clave, "50192100");
    assert.equal(parsed.items[1]?.material_peligroso, "1");
    assert.equal(parsed.items[2]?.material_peligroso, "0,1");
    assert.equal(normalizeMaterialPeligroso("0,1"), "0,1");
    assert.equal(normalizeMaterialPeligroso("x"), null);
  });
});
