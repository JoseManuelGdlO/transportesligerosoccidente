import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildFactura40Payload } from "./buildFactura40Payload";
import type { TimbradoContext } from "../types";

function baseCtx(overrides: Partial<TimbradoContext> = {}): TimbradoContext {
  return {
    tipo: "traslado",
    trip: {
      id: "trip-1",
      folio: "V-100",
      origen: "Guadalajara",
      destino: "Zapopan",
      tarifa: "1500.00",
      tipo_viaje: "local",
    } as TimbradoContext["trip"],
    tenant: {
      cfdi_serie: "CP",
      cp_fiscal: "44100",
      metodo_pago_default: "PPD",
      forma_pago_default: "99",
      uso_cfdi_default: "G03",
    } as TimbradoContext["tenant"],
    cartaPorte: { id_ccp: "abc-123", folio_cfdi: null } as TimbradoContext["cartaPorte"],
    ubicaciones: [
      {
        orden: 1,
        tipo: "Origen",
        cp: "44100",
        estado: "JAL",
        colonia_clave: "0001",
        municipio_clave: "039",
      },
      {
        orden: 2,
        tipo: "Destino",
        cp: "45010",
        estado: "JAL",
        distancia_km: "12.5",
        colonia_clave: "0002",
        municipio_clave: "120",
      },
    ] as TimbradoContext["ubicaciones"],
    mercancias: [
      {
        descripcion: "Carga",
        cantidad: "1",
        unidad: "H87",
        peso_kg: "500",
        clave_prod_serv: "78101800",
        material_peligroso: false,
      },
    ] as TimbradoContext["mercancias"],
    truck: {
      numero_economico: "T-01",
      placas: "ABC123",
      anio: 2020,
      config_vehicular: "C2",
      perm_sct: "TPAF01",
      num_permiso_sct: "123",
      peso_bruto_vehicular: "3500",
      aseguradora_resp_civil: "GNP",
      poliza_resp_civil: "POL1",
    } as TimbradoContext["truck"],
    driver: {
      nombre: "Juan Pérez",
      rfc: "XAXX010101000",
      licencia_federal: "LF123",
      tipo_figura: "01",
    } as TimbradoContext["driver"],
    client: {
      rfc: "CLI010101AAA",
      razon_social: "Cliente SA",
      cp: "44100",
      regimen_fiscal: "601",
    } as TimbradoContext["client"],
    ...overrides,
  };
}

describe("buildFactura40Payload", () => {
  it("genera traslado tipo T con totales 0 y moneda XXX", () => {
    const payload = buildFactura40Payload(baseCtx());
    assert.equal(payload.DatosCFDI40.TipodeComprobante, "T");
    assert.equal(payload.DatosCFDI40.Subtotal, 0);
    assert.equal(payload.DatosCFDI40.Total, 0);
    assert.equal(payload.DatosCFDI40.Moneda, "XXX");
    assert.equal(payload.ReceptorCFDI40.UsoCfdi, "S01");
    assert.ok(payload.CartaPorte31);
    const idCcp = (payload.CartaPorte31 as { IdCCP?: string }).IdCCP;
    assert.equal(idCcp, "CCCabc-123");
  });

  it("genera ingreso tipo FA con impuestos", () => {
    const payload = buildFactura40Payload(baseCtx({ tipo: "ingreso" }));
    assert.equal(payload.DatosCFDI40.TipodeComprobante, "FA");
    assert.equal(payload.DatosCFDI40.Subtotal, 1500);
    assert.equal(payload.DatosCFDI40.Total, 1680);
    assert.equal(payload.DatosCFDI40.Moneda, "MXN");
    assert.equal(payload.ReceptorCFDI40.UsoCfdi, "G03");
    assert.equal(payload.ConceptosCFDI40.Conceptos[0].ClaveProdServ, "78101801");
  });
});
