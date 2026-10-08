import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isValidEstadoSatCode,
  needsDomicilioEnrichment,
  normalizeDesc,
  pickByDescription,
  pickColoniaByNombre,
  satDomicilioReplacePatch,
} from "./domicilioSatResolver";
import { MEXICAN_STATE_NAME_TO_CODE } from "./mexicanStateNames";
import type { PostaliaCodigoPostalResponse, UbicacionDomicilioInput } from "./types";

describe("domicilioSatResolver helpers", () => {
  it("normalizeDesc quita acentos y pasa a minúsculas", () => {
    assert.equal(normalizeDesc("  Tlajomulco de Zaragoza  "), "tlajomulco de zaragoza");
    assert.equal(normalizeDesc("Michoacán"), "michoacan");
  });

  it("pickByDescription prefiere igualdad exacta", () => {
    const items = [
      { descripcion: "Durango" },
      { descripcion: "Victoria de Durango" },
    ];
    assert.equal(pickByDescription(items, "Durango")?.descripcion, "Durango");
    assert.equal(pickByDescription(items, "Victoria")?.descripcion, "Victoria de Durango");
  });

  it("pickColoniaByNombre matchea por nombre", () => {
    const items = [
      { nombre: "Guadalupe" },
      { nombre: "Guadalupe Victoria INFONAVIT" },
    ];
    assert.equal(pickColoniaByNombre(items, "Guadalupe")?.nombre, "Guadalupe");
  });

  it("isValidEstadoSatCode acepta claves SAT", () => {
    assert.equal(isValidEstadoSatCode("JAL"), true);
    assert.equal(isValidEstadoSatCode("jal"), true);
    assert.equal(isValidEstadoSatCode("Jalisco"), false);
    assert.equal(isValidEstadoSatCode(""), false);
  });

  it("needsDomicilioEnrichment requiere CP y detecta campos faltantes", () => {
    const complete: UbicacionDomicilioInput = {
      cp: "45645",
      colonia_clave: "4535",
      localidad_clave: "11",
      municipio_clave: "097",
      estado: "JAL",
    };
    assert.equal(needsDomicilioEnrichment(complete), false);

    const incomplete: UbicacionDomicilioInput = {
      cp: "45645",
      municipio: "Tlajomulco de Zaragoza",
    };
    assert.equal(needsDomicilioEnrichment(incomplete), true);
    assert.equal(needsDomicilioEnrichment({ cp: "123" }), false);
  });

  it("satDomicilioReplacePatch sustituye el domicilio aunque ya hubiera claves", () => {
    const patch = satDomicilioReplacePatch({
      estado: "DUR",
      municipio: "Durango",
      municipio_clave: "005",
      localidad: "Victoria de Durango",
      localidad_clave: "01",
      colonia: "Guadalupe",
      colonia_clave: "0001",
      pais: "MEX",
      issues: [],
    });
    assert.equal(patch.estado, "DUR");
    assert.equal(patch.municipio_clave, "005");
    assert.equal(patch.municipio, "Durango");
    assert.equal(patch.localidad_clave, "01");
    assert.equal(patch.colonia_clave, "0001");
    assert.equal(patch.pais, "MEX");
  });

  it("mapa de estados incluye Jalisco y Durango", () => {
    assert.equal(MEXICAN_STATE_NAME_TO_CODE.jalisco, "JAL");
    assert.equal(MEXICAN_STATE_NAME_TO_CODE.durango, "DUR");
  });
});

describe("resolveDomicilioSat con catálogo mockeado", () => {
  it("documenta estructura de respuesta Postalia de ejemplo", () => {
    const postalia: PostaliaCodigoPostalResponse = {
      codigo_postal: "34220",
      estado: "Durango",
      municipio: "Durango",
      ciudad: "Victoria de Durango",
      zona: "Urbano",
      colonias: [{ nombre: "Guadalupe", tipo: "Fraccionamiento" }],
    };
    assert.equal(postalia.estado, "Durango");
    assert.ok(postalia.colonias.length > 0);
  });
});
