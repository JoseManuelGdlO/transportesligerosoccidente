import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyModalidadPersistencia,
  generaCxcAutomatica,
  llevaTarifa,
  permiteTimbrar,
} from "./modalidadCobro";

describe("generaCxcAutomatica", () => {
  it("solo efectivo crea saldo al guardar el viaje", () => {
    assert.equal(generaCxcAutomatica("factura"), false);
    assert.equal(generaCxcAutomatica("efectivo"), true);
    assert.equal(generaCxcAutomatica("sin_comision"), false);
    assert.equal(generaCxcAutomatica("sin_cobro"), false);
  });
});

describe("permiteTimbrar", () => {
  it("solo la modalidad con factura admite CFDI", () => {
    assert.equal(permiteTimbrar("factura"), true);
    assert.equal(permiteTimbrar("efectivo"), false);
    assert.equal(permiteTimbrar("sin_comision"), false);
    assert.equal(permiteTimbrar("sin_cobro"), false);
  });
});

describe("llevaTarifa", () => {
  it("solo factura y efectivo llevan tarifa", () => {
    assert.equal(llevaTarifa("factura"), true);
    assert.equal(llevaTarifa("efectivo"), true);
    assert.equal(llevaTarifa("sin_comision"), false);
    assert.equal(llevaTarifa("sin_cobro"), false);
  });
});

describe("applyModalidadPersistencia", () => {
  it("en sin cobro exige comisión manual y guarda tarifa 0", () => {
    const r = applyModalidadPersistencia({
      modalidad: "sin_cobro",
      tarifa: 8000,
      comision_override: 500,
    });
    assert.equal(r.error, undefined);
    assert.equal(r.tarifa, 0);
    assert.equal(r.comision_override, 500);
  });

  it("en sin cobro rechaza comisión vacía o no positiva", () => {
    const vacia = applyModalidadPersistencia({ modalidad: "sin_cobro", tarifa: 0 });
    assert.match(vacia.error ?? "", /comisión/i);
    const cero = applyModalidadPersistencia({
      modalidad: "sin_cobro",
      comision_override: 0,
    });
    assert.match(cero.error ?? "", /comisión/i);
  });

  it("en sin comisión fuerza tarifa 0 e ignora el override", () => {
    const r = applyModalidadPersistencia({
      modalidad: "sin_comision",
      tarifa: 2000,
      comision_override: 400,
    });
    assert.equal(r.error, undefined);
    assert.equal(r.tarifa, 0);
    assert.equal(r.comision_override, null);
  });

  it("fuera de factura rechaza número de factura", () => {
    const r = applyModalidadPersistencia({
      modalidad: "efectivo",
      tarifa: 1500,
      num_factura: "F-1",
    });
    assert.match(r.error ?? "", /factura/i);
  });

  it("en efectivo exige tarifa positiva; sin comisión no", () => {
    const efectivo = applyModalidadPersistencia({ modalidad: "efectivo", tarifa: 0 });
    assert.match(efectivo.error ?? "", /tarifa/i);
    const sinComision = applyModalidadPersistencia({ modalidad: "sin_comision", tarifa: -1 });
    assert.equal(sinComision.error, undefined);
    assert.equal(sinComision.tarifa, 0);
  });

  it("con factura deja tarifa, override y factura como vienen", () => {
    const r = applyModalidadPersistencia({
      modalidad: "factura",
      tarifa: 3000,
      comision_override: 100,
      num_factura: "F-9",
    });
    assert.equal(r.error, undefined);
    assert.equal(r.tarifa, 3000);
    assert.equal(r.comision_override, 100);
    assert.equal(r.num_factura, "F-9");
  });
});
