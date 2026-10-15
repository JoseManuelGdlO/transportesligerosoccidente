import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { TaxComponent } from "./taxComponent";
import { aggregatePagoImpuestos, prorateDocumentTaxes } from "./proratePaymentTaxes";

const original: TaxComponent[] = [
  {
    tipo: "traslado",
    impuesto: "002",
    tipoFactor: "Tasa",
    tasaOCuota: 0.16,
    base: 10000,
    importe: 1600,
  },
  {
    tipo: "retencion",
    impuesto: "002",
    tipoFactor: "Tasa",
    tasaOCuota: 0.04,
    base: 10000,
    importe: 400,
  },
];

describe("prorateDocumentTaxes", () => {
  it("prorratea la mitad exacta de la factura 11200", () => {
    const result = prorateDocumentTaxes({
      impPagado: 5600,
      totalXml: 11200,
      impSaldoInsoluto: 5600,
      original,
      previous: [],
    });

    assert.equal(result.objetoImp, "02");
    assert.equal(result.totalTraslados, 800);
    assert.equal(result.totalRetenidos, 200);
    const iva = result.taxes.find((t) => t.tipo === "traslado");
    const ret = result.taxes.find((t) => t.tipo === "retencion");
    assert.equal(iva?.base, 5000);
    assert.equal(iva?.importe, 800);
    assert.equal(ret?.base, 5000);
    assert.equal(ret?.importe, 200);
  });

  it("usa el residuo cuando el insoluto queda en 0", () => {
    const first = prorateDocumentTaxes({
      impPagado: 5600,
      totalXml: 11200,
      impSaldoInsoluto: 5600,
      original,
      previous: [],
    });

    const second = prorateDocumentTaxes({
      impPagado: 5600,
      totalXml: 11200,
      impSaldoInsoluto: 0,
      original,
      previous: first.taxes,
    });

    const iva = second.taxes.find((t) => t.tipo === "traslado");
    const ret = second.taxes.find((t) => t.tipo === "retencion");
    assert.equal(iva?.base, 5000);
    assert.equal(iva?.importe, 800);
    assert.equal(ret?.base, 5000);
    assert.equal(ret?.importe, 200);
    assert.equal(second.objetoImp, "02");
    assert.equal(second.totalTraslados, 800);
    assert.equal(second.totalRetenidos, 200);
  });
});

describe("aggregatePagoImpuestos", () => {
  it("agrupa dos traslados 0.16 y deja retencionesP null", () => {
    const a: TaxComponent[] = [
      {
        tipo: "traslado",
        impuesto: "002",
        tipoFactor: "Tasa",
        tasaOCuota: 0.16,
        base: 5000,
        importe: 800,
      },
    ];
    const b: TaxComponent[] = [
      {
        tipo: "traslado",
        impuesto: "002",
        tipoFactor: "Tasa",
        tasaOCuota: 0.16,
        base: 2000,
        importe: 320,
      },
    ];

    const result = aggregatePagoImpuestos([a, b], 1);

    assert.equal(result.trasladosP.length, 1);
    assert.equal(result.trasladosP[0].BaseP, 7000);
    assert.equal(result.trasladosP[0].ImporteP, 1120);
    assert.equal(result.trasladosP[0].ImpuestoP, "002");
    assert.equal(result.trasladosP[0].TipoFactorP, "Tasa");
    assert.equal(result.trasladosP[0].TasaOCuotaP, 0.16);
    assert.equal(result.retencionesP, null);
    assert.equal(result.totales.TotalTrasladosBaseIVA16, 7000);
    assert.equal(result.totales.TotalTrasladosImpuestoIVA16, 1120);
    assert.equal(result.totales.TotalRetencionesIVA, 0);
  });

  it("multiplica el tipo de cambio por la retención ya redondeada", () => {
    const line = (importe: number): TaxComponent => ({
      tipo: "retencion",
      impuesto: "002",
      tipoFactor: "Tasa",
      tasaOCuota: 0.04,
      base: 1,
      importe,
    });

    const result = aggregatePagoImpuestos([[line(0.01)], [line(0.06)]], 1.5);

    assert.equal(result.retencionesP?.[0].ImporteP, 0.07);
    assert.equal(result.totales.TotalRetencionesIVA, 0.11);
  });
});
