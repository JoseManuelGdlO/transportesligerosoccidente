import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { TaxComponent } from "./taxComponent";
import { buildDraftLines, ComplementError, type DraftSource } from "./buildDraftLines";

const invoiceTaxes: TaxComponent[] = [
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

function source(overrides: Partial<DraftSource> = {}): DraftSource {
  return {
    documentId: "doc-1",
    clientId: "client-1",
    cartaPorteId: "cp-1",
    uuid: "uuid-1",
    serie: "I",
    folio: "15",
    moneda: "MXN",
    totalXml: 11200,
    montoOriginal: 11200,
    abonosInternos: 0,
    insolutoPrevio: null,
    parcialidadPrevia: 0,
    fechaComprobante: "2026-05-01",
    taxes: invoiceTaxes,
    previousTaxes: [],
    monto: 5600,
    ...overrides,
  };
}

const baseInput = {
  fechaPago: "2026-10-15",
  today: "2026-10-15",
  monedaP: "MXN",
  tipoCambioP: 1,
  formaPagoP: "03",
  modo: "nuevo" as const,
};

describe("buildDraftLines", () => {
  it("arma la primera parcialidad de 5600 sobre 11200", () => {
    const [line] = buildDraftLines({ ...baseInput, docs: [source()] });

    assert.equal(line.numParcialidad, 1);
    assert.equal(line.impSaldoAnt, 11200);
    assert.equal(line.impPagado, 5600);
    assert.equal(line.impSaldoInsoluto, 5600);
    assert.equal(line.objetoImpDr, "02");
    assert.equal(line.totalTraslados, 800);
    const iva = line.taxes.find((t) => t.tipo === "traslado");
    assert.equal(iva?.importe, 800);
    assert.equal(iva?.base, 5000);
  });

  it("usa el residuo de impuestos en la segunda parcialidad que liquida", () => {
    const [first] = buildDraftLines({ ...baseInput, docs: [source()] });

    const [second] = buildDraftLines({
      ...baseInput,
      docs: [
        source({
          insolutoPrevio: 5600,
          parcialidadPrevia: 1,
          previousTaxes: first.taxes,
          monto: 5600,
          abonosInternos: 5600,
        }),
      ],
    });

    assert.equal(second.numParcialidad, 2);
    assert.equal(second.impSaldoAnt, 5600);
    assert.equal(second.impPagado, 5600);
    assert.equal(second.impSaldoInsoluto, 0);
    const iva = second.taxes.find((t) => t.tipo === "traslado");
    const ret = second.taxes.find((t) => t.tipo === "retencion");
    assert.equal(iva?.base, 5000);
    assert.equal(iva?.importe, 800);
    assert.equal(ret?.base, 5000);
    assert.equal(ret?.importe, 200);
    assert.equal(second.totalTraslados, 800);
    assert.equal(second.totalRetenidos, 200);
  });

  it("rechaza un monto mayor al saldo interno", () => {
    assert.throws(
      () =>
        buildDraftLines({
          ...baseInput,
          docs: [source({ monto: 11201 })],
        }),
      (err: unknown) => {
        assert.ok(err instanceof ComplementError);
        assert.equal(err.status, 400);
        assert.match(err.message, /saldo/i);
        return true;
      },
    );
  });

  it("rechaza formaPagoP 99", () => {
    assert.throws(
      () =>
        buildDraftLines({
          ...baseInput,
          formaPagoP: "99",
          docs: [source()],
        }),
      (err: unknown) => {
        assert.ok(err instanceof ComplementError);
        assert.equal(err.status, 400);
        return true;
      },
    );
  });

  it("rechaza fechaPago anterior al comprobante", () => {
    assert.throws(
      () =>
        buildDraftLines({
          ...baseInput,
          fechaPago: "2026-04-01",
          docs: [source()],
        }),
      (err: unknown) => {
        assert.ok(err instanceof ComplementError);
        assert.equal(err.status, 400);
        return true;
      },
    );
  });

  it("rechaza documentos de distinto clientId", () => {
    assert.throws(
      () =>
        buildDraftLines({
          ...baseInput,
          docs: [source(), source({ documentId: "doc-2", clientId: "client-2" })],
        }),
      (err: unknown) => {
        assert.ok(err instanceof ComplementError);
        assert.equal(err.status, 400);
        return true;
      },
    );
  });

  it("en modo existente arma la línea aunque el saldo interno sea 0", () => {
    const [line] = buildDraftLines({
      ...baseInput,
      modo: "existente",
      docs: [source({ abonosInternos: 11200, monto: 5600, insolutoPrevio: null, parcialidadPrevia: 0 })],
    });

    assert.equal(line.numParcialidad, 1);
    assert.equal(line.impSaldoAnt, 11200);
    assert.equal(line.impPagado, 5600);
    assert.equal(line.impSaldoInsoluto, 5600);
    assert.equal(line.totalTraslados, 800);
  });
});
