import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { ParsedCfdi } from "./parseCfdiXml";
import { formatCantidadVisible, prepareCfdiForPdf, type CartaPortePdfSource } from "./prepareCfdiForPdf";

const TRIP = "ae8aa900-14f1-43f6-9cfc-423d34e87751";

function cfdi(partial?: {
  idOrigen?: string;
  idDestino?: string;
  unidad?: string;
  claveUnidad?: string;
  cantidadTransporta?: boolean;
}): ParsedCfdi {
  return {
    cartaPorte: {
      version: "3.1",
      regimenesAduaneros: [],
      ubicaciones: [
        { tipoUbicacion: "Origen", idUbicacion: partial?.idOrigen },
        { tipoUbicacion: "Destino", idUbicacion: partial?.idDestino },
      ],
      mercancias: [
        {
          descripcion: "Varillas de acero",
          cantidad: "1.0000",
          claveUnidad: partial?.claveUnidad ?? "H87",
          unidad: partial?.unidad ?? "H87",
          cantidadTransporta: partial?.cantidadTransporta
            ? [{ cantidad: "1", idOrigen: "OR000001", idDestino: "DE000001" }]
            : undefined,
        },
      ],
      figuras: [],
    },
  } as ParsedCfdi;
}

const source: CartaPortePdfSource = {
  tripId: TRIP,
  ubicaciones: [
    { orden: 1, tipo: "Origen", id_ubicacion_sat: "OR654321" },
    { orden: 2, tipo: "Destino", id_ubicacion_sat: "DE654321" },
  ],
  mercancias: [{ cantidad: "1.0000", cantidad_transportada: "1.0000" }],
};

describe("formatCantidadVisible", () => {
  it("quita ceros de más y conserva decimales reales", () => {
    assert.equal(formatCantidadVisible("1.0000"), "1");
    assert.equal(formatCantidadVisible("1.5000"), "1.5");
    assert.equal(formatCantidadVisible("15540"), "15540");
  });
});

describe("prepareCfdiForPdf", () => {
  it("rellena ID de ubicación y cantidad transporta desde el viaje cuando el XML no los trae", () => {
    const out = prepareCfdiForPdf(cfdi(), source);
    const cp = out.cartaPorte!;
    assert.equal(cp.ubicaciones[0].idUbicacion, "OR654321");
    assert.equal(cp.ubicaciones[1].idUbicacion, "DE654321");
    assert.deepEqual(cp.mercancias[0].cantidadTransporta, [
      { cantidad: "1.0000", idOrigen: "OR654321", idDestino: "DE654321" },
    ]);
  });

  it("conserva los identificadores que ya vienen en el XML", () => {
    const out = prepareCfdiForPdf(
      cfdi({ idOrigen: "OR111111", idDestino: "DE222222", cantidadTransporta: true, unidad: "Lote", claveUnidad: "XTL" }),
      source,
    );
    const cp = out.cartaPorte!;
    assert.equal(cp.ubicaciones[0].idUbicacion, "OR111111");
    assert.equal(cp.ubicaciones[1].idUbicacion, "DE222222");
    assert.equal(cp.mercancias[0].cantidadTransporta?.[0].idOrigen, "OR000001");
    assert.equal(cp.mercancias[0].unidad, "Lote");
  });

  it("deja Unidad vacía cuando solo repite la clave de catálogo", () => {
    const out = prepareCfdiForPdf(cfdi({ unidad: "H87", claveUnidad: "H87" }), source);
    assert.equal(out.cartaPorte!.mercancias[0].unidad, undefined);
  });

  it("genera el id SAT si el viaje no tiene uno válido guardado", () => {
    const out = prepareCfdiForPdf(cfdi(), {
      ...source,
      ubicaciones: [
        { orden: 1, tipo: "Origen", id_ubicacion_sat: null },
        { orden: 2, tipo: "Destino", id_ubicacion_sat: "ORAE8AA9" },
      ],
    });
    assert.match(out.cartaPorte!.ubicaciones[0].idUbicacion!, /^OR[0-9]{6}$/);
    assert.match(out.cartaPorte!.ubicaciones[1].idUbicacion!, /^DE[0-9]{6}$/);
  });
});
