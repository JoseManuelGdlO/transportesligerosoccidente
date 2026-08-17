import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  conceptosFromLegacy,
  maintenanceCxpProjection,
  maintenancePatchFromAccount,
  parseConceptosJson,
  sumConceptos,
  summarizeConceptos,
  validateConceptos,
} from "./documentConcepto";

describe("documentConcepto", () => {
  it("parsea JSON y strings", () => {
    assert.deepEqual(
      parseConceptosJson([{ descripcion: "Lona", precio: 250 }]),
      [{ descripcion: "Lona", precio: 250 }],
    );
    assert.deepEqual(
      parseConceptosJson(JSON.stringify([{ descripcion: "Lona", precio: 250 }])),
      [{ descripcion: "Lona", precio: 250 }],
    );
    assert.deepEqual(parseConceptosJson(null), []);
  });

  it("valida decimal no negativo y descripción", () => {
    assert.throws(() => validateConceptos([]), /al menos un concepto/);
    assert.throws(
      () => validateConceptos([{ descripcion: "", precio: 10 }]),
      /falta descripción/,
    );
    assert.throws(
      () => validateConceptos([{ descripcion: "X", precio: -1 }]),
      /no puede ser negativo/,
    );
    assert.deepEqual(validateConceptos([{ descripcion: "X", precio: 10.5 }]), [
      { descripcion: "X", precio: 10.5 },
    ]);
    assert.deepEqual(validateConceptos([{ descripcion: "X", precio: 10.555 }]), [
      { descripcion: "X", precio: 10.56 },
    ]);
  });

  it("suma y resume conceptos", () => {
    const conceptos = [
      { descripcion: "Transmisión", precio: 2500.25 },
      { descripcion: "Lona", precio: 250.5 },
    ];
    assert.equal(sumConceptos(conceptos), 2750.75);
    assert.equal(summarizeConceptos(conceptos), "Transmisión; Lona");
  });

  it("proyecta CXP con folio real o sintético", () => {
    const withFolio = maintenanceCxpProjection({
      id: "abcdefgh-1234",
      tipo: "preventivo",
      num_factura: "A-99",
      conceptos: [
        { descripcion: "Transmisión", precio: 2500 },
        { descripcion: "Lona", precio: 250 },
      ],
    });
    assert.equal(withFolio.folio, "A-99");
    assert.equal(withFolio.monto, 2750);
    assert.match(withFolio.concepto, /Transmisión; Lona/);

    const syntheticFolio = maintenanceCxpProjection({
      id: "abcdefgh-1234",
      tipo: "menor",
      conceptos: [{ descripcion: "Cambio de aceite", precio: 400 }],
    });
    assert.equal(syntheticFolio.folio, "MANT-ABCDEFGH");
    assert.deepEqual(syntheticFolio.conceptos, [
      { descripcion: "Cambio de aceite", precio: 400 },
    ]);
  });

  it("sincroniza inverso folio, conceptos y total", () => {
    const fromLines = maintenancePatchFromAccount({
      folio: "F-1",
      conceptos: [
        { descripcion: "Transmisión", precio: 2500 },
        { descripcion: "Eléctrica", precio: 1500 },
      ],
    });
    assert.equal(fromLines.num_factura, "F-1");
    assert.equal(fromLines.costo, 4000);
    assert.equal(fromLines.descripcion, "Transmisión; Eléctrica");

    const fromLegacy = maintenancePatchFromAccount({
      folio: "F-2",
      concepto: "Mantenimiento preventivo: Aceite",
      monto_original: 900,
    });
    assert.equal(fromLegacy.num_factura, "F-2");
    assert.equal(fromLegacy.descripcion, "Aceite");
    assert.deepEqual(fromLegacy.conceptos, conceptosFromLegacy("Aceite", 900));
  });
});
