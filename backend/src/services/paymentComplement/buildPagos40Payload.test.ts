import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { DraftLine } from "./buildDraftLines";
import type { TaxComponent } from "./taxComponent";
import { buildPagos40Payload } from "./buildPagos40Payload";

const traslado = (base: number, importe: number): TaxComponent => ({
  tipo: "traslado",
  impuesto: "002",
  tipoFactor: "Tasa",
  tasaOCuota: 0.16,
  base,
  importe,
});

function line(overrides: Partial<DraftLine> = {}): DraftLine {
  return {
    documentId: "doc-1",
    cartaPorteId: "cp-1",
    uuid: "uuid-linea-1",
    serie: "A",
    folio: "10",
    monedaDr: "USD",
    equivalenciaDr: 1,
    numParcialidad: 1,
    impSaldoAnt: 100,
    impPagado: 100,
    impSaldoInsoluto: 0,
    objetoImpDr: "02",
    taxes: [traslado(86.21, 13.79)],
    totalTraslados: 13.79,
    totalRetenidos: 0,
    ...overrides,
  };
}

const lineas: DraftLine[] = [
  line(),
  line({
    documentId: "doc-2",
    cartaPorteId: "cp-2",
    uuid: "uuid-linea-2",
    folio: "11",
    impSaldoAnt: 50,
    impPagado: 50,
    taxes: [traslado(43.1, 6.9)],
    totalTraslados: 6.9,
  }),
];

function input(lineasPago: DraftLine[] = lineas) {
  return {
    serie: "P",
    folio: 12,
    fechaCfdi: "2026-10-15T15:04:05",
    lugarExpedicion: "44100",
    formaPagoP: "03",
    fechaPago: "2026-10-15T12:00:00",
    monedaP: "USD",
    tipoCambioP: 1,
    numOperacion: "SPEI-123",
    receptor: {
      rfc: "XAXX010101000",
      razonSocial: "Cliente Demo",
      domicilioFiscal: "44100",
      regimenFiscal: "601",
    },
    lineas: lineasPago,
  };
}

const BANK_FIELDS = [
  "RfcEmisorCtaOrd",
  "CtaOrdenante",
  "TipoCadPago",
  "CertPago",
  "CadPago",
  "SelloPago",
  "NomBancoOrdExt",
  "RfcEmisorCtaBen",
  "CtaBeneficiario",
  "FechaPagoManual",
] as const;

describe("buildPagos40Payload", () => {
  it("arma el JSON Pagos40 de dos documentos USD", () => {
    const payload = buildPagos40Payload(input());
    const datos = payload.DatosCFDI as Record<string, unknown>;
    const receptor = payload.ReceptorCFDI as Record<string, unknown>;
    const pagos = payload.Pagos as {
      CFDIPagos40: Array<Record<string, unknown>>;
      Totales: Record<string, unknown>;
    };
    const pago = pagos.CFDIPagos40[0];
    const doctos = pago.DoctoRelacionado as Array<Record<string, unknown>>;
    const impuestos = pago.Impuestos as { TrasladosP40: Array<{ BaseP: number }> };

    assert.equal(datos.TipodeComprobante, "P");
    assert.equal(datos.Moneda, "XXX");
    assert.equal(datos.Subtotal, 0);
    assert.equal(datos.Total, 0);
    assert.equal(datos.MetodoPago, "PUE");
    assert.equal(datos.FormadePago, "03");
    assert.equal(datos.Serie, "P");
    assert.equal(datos.Folio, 12);
    assert.equal(receptor.UsoCfdi, "CP01");
    assert.equal(payload.ConceptosCFD, null);
    assert.equal(pagos.CFDIPagos40.length, 1);
    assert.equal(pago.Monto, 150);
    assert.equal(doctos.length, 2);
    assert.equal(doctos[0].IdDocumento, lineas[0].uuid);
    assert.equal(pagos.Totales.MontoTotalPagos, 150);
    assert.equal(impuestos.TrasladosP40[0].BaseP, 129.31);

    assert.equal(payload.CFDIRelacion40, null);
    assert.equal(payload.Addenda, null);
    assert.equal("Usuario" in payload, false);
    assert.equal("Contrasena" in payload, false);
    for (const field of BANK_FIELDS) {
      assert.equal(pago[field], "");
    }
  });

  it("deja ImpuestosDR en null cuando objetoImpDr es 01", () => {
    const sinImpuesto = line({
      uuid: "uuid-sin-impuesto",
      objetoImpDr: "01",
      taxes: [],
      totalTraslados: 0,
      totalRetenidos: 0,
      impPagado: 20,
      impSaldoAnt: 20,
    });
    const payload = buildPagos40Payload(input([sinImpuesto]));
    const pagos = payload.Pagos as { CFDIPagos40: Array<Record<string, unknown>> };
    const doctos = pagos.CFDIPagos40[0].DoctoRelacionado as Array<Record<string, unknown>>;

    assert.equal(doctos[0].ImpuestosDR, null);
    assert.equal(doctos[0].ObjetoImpDR, "01");
  });
});
