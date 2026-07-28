import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mapConceptos } from "./mapConceptos";
import type { Trip, Truck } from "../../../models";
import type { TripCfdiConcepto } from "../../../types/tripCfdiConcepto";

function fakeTrip(overrides: Partial<Trip> & { tarifa?: string | number; cfdi_conceptos?: TripCfdiConcepto[] | null } = {}) {
  return {
    folio: "T-100",
    origen: "GDL",
    destino: "MTY",
    tarifa: "1500",
    cfdi_conceptos: null,
    ...overrides,
  } as unknown as Trip;
}

function fakeTruck(overrides: Partial<Truck> = {}) {
  return {
    numero_economico: "ECO-1",
    placas: "ABC123",
    ...overrides,
  } as unknown as Truck;
}

describe("mapConceptos", () => {
  it("traslado: un concepto en $0", () => {
    const r = mapConceptos(fakeTrip(), fakeTruck(), "traslado", {});
    assert.equal(r.conceptos.length, 1);
    assert.equal(r.conceptos[0].ClaveProdServ, "78101800");
    assert.equal(r.conceptos[0].Importe, 0);
    assert.equal(r.subtotal, 0);
    assert.equal(r.moneda, "XXX");
  });

  it("ingreso fallback: un concepto 78101802 / E54 desde tarifa", () => {
    const r = mapConceptos(fakeTrip({ tarifa: "1500" }), fakeTruck(), "ingreso", {});
    assert.equal(r.conceptos.length, 1);
    const c = r.conceptos[0];
    assert.equal(c.ClaveProdServ, "78101802");
    assert.equal(c.ClaveUnidad, "E54");
    assert.equal(c.Unidad, "Viaje");
    assert.equal(c.Importe, 1500);
    assert.equal(r.subtotal, 1500);
    assert.equal(r.total, 1680); // 1500 + 240 - 60
    assert.match(c.Descripcion, /Flete de/);
    assert.match(c.Descripcion, /T-100/);
    assert.match(c.Descripcion, /ECO-1/);
  });

  it("ingreso con N conceptos almacenados: suma impuestos por línea", () => {
    const conceptos: TripCfdiConcepto[] = [
      {
        clave_prod_serv: "78101802",
        cantidad: 1,
        clave_unidad: "E54",
        unidad: "Viaje",
        descripcion: "Flete GDL-MTY",
        valor_unitario: 1000,
        objeto_imp: "02",
      },
      {
        clave_prod_serv: "78101802",
        cantidad: 1,
        clave_unidad: "E54",
        unidad: "Viaje",
        descripcion: "Reparto local",
        valor_unitario: 500,
        objeto_imp: "02",
      },
    ];
    const r = mapConceptos(fakeTrip({ cfdi_conceptos: conceptos, tarifa: "1500" }), fakeTruck(), "ingreso", {});
    assert.equal(r.conceptos.length, 2);
    assert.equal(r.conceptos[0].Descripcion, "Flete GDL-MTY");
    assert.equal(r.conceptos[0].Importe, 1000);
    assert.equal(r.conceptos[1].Descripcion, "Reparto local");
    assert.equal(r.conceptos[1].Importe, 500);
    assert.equal(r.subtotal, 1500);
    // línea1: 1000+160-40=1120; línea2: 500+80-20=560; total 1680
    assert.equal(r.total, 1680);
    assert.equal(r.conceptos[0].Traslados?.[0]?.Importe, 160);
    assert.equal(r.conceptos[1].Traslados?.[0]?.Importe, 80);
  });
});
