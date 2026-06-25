import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  parseSatColoniasRows,
  parseSatLocalidadesRows,
  parseSatMunicipiosRows,
} from "./satUbicacionesImport";

describe("satUbicacionesImport", () => {
  it("parsea municipios con encabezado SAT", () => {
    const rows = [
      ["Catálogo de municipios."],
      ["Fecha inicio de vigencia", "Fecha fin de vigencia", "Versión", "Revisión"],
      [45490, "", 1, 0],
      [],
      ["c_Municipio", "c_Estado", "Descripción", "Fecha inicio vigencia", "Fecha fin vigencia"],
      ["003", "BCN", "Tecate", 45490, ""],
      ["001", "AGU", "Aguascalientes", 45490, ""],
      ["", "BCN", "Sin clave", 45490, ""],
    ];
    const parsed = parseSatMunicipiosRows(rows);
    assert.equal(parsed.items.length, 2);
    assert.equal(parsed.items[0]?.clave, "003");
    assert.equal(parsed.items[0]?.estado, "BCN");
    assert.equal(parsed.items[0]?.descripcion, "Tecate");
    assert.equal(parsed.items[0]?.fecha_inicio_vigencia, "2024-07-17");
  });

  it("parsea localidades con encabezado SAT", () => {
    const rows = [
      ["Catálogo de localidades."],
      ["Fecha inicio de vigencia", "Fecha fin de vigencia", "Versión", "Revisión"],
      [45490, "", 1, 0],
      [],
      ["c_Localidad", "c_Estado", "Descripción", "Fecha inicio vigencia", "Fecha fin vigencia"],
      ["03", "BCN", "Tecate", 45490, ""],
    ];
    const parsed = parseSatLocalidadesRows(rows);
    assert.equal(parsed.items.length, 1);
    assert.equal(parsed.items[0]?.clave, "03");
    assert.equal(parsed.items[0]?.estado, "BCN");
  });

  it("parsea colonias con CP de 5 dígitos", () => {
    const rows = [
      ["Catálogo de colonias."],
      ["Fecha inicio de vigencia", "Fecha fin de vigencia", "Versión", "Revisión"],
      [45490, "", 1, 0],
      [],
      ["c_Colonia", "c_CodigoPostal", "Nombre del asentamiento"],
      ["2123", "21482", "Maclovio Herrera"],
      ["2123", "invalid", "Ignorada"],
    ];
    const parsed = parseSatColoniasRows(rows);
    assert.equal(parsed.items.length, 1);
    assert.deepEqual(parsed.items[0], {
      clave: "2123",
      codigo_postal: "21482",
      nombre: "Maclovio Herrera",
      fecha_inicio_vigencia: null,
      fecha_fin_vigencia: null,
    });
  });
});
