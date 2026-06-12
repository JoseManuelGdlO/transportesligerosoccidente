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
      rfc: "EMI010101AB1",
      razon_social: "Emisor Transporte SA",
      cfdi_serie: "CP",
      cp_fiscal: "44100",
      metodo_pago_default: "PPD",
      forma_pago_default: "99",
      uso_cfdi_default: "G03",
      regimen_fiscal: "601",
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
        clave_prod_serv: "50192100",
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
    assert.equal(payload.DatosCFDI40.TipoCambio, undefined);
    assert.equal(payload.ReceptorCFDI40.UsoCfdi, "S01");
    assert.equal(payload.ReceptorCFDI40.RFC, "EMI010101AB1");
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
    assert.equal(payload.DatosCFDI40.TipoCambio, undefined);
    assert.equal(payload.ReceptorCFDI40.UsoCfdi, "G03");
    assert.equal(payload.ConceptosCFDI40.Conceptos[0].ClaveProdServ, "78101801");
  });

  it("incluye TipoCambio solo en ingreso con moneda extranjera", () => {
    const payload = buildFactura40Payload(
      baseCtx({
        tipo: "ingreso",
        opts: { moneda: "USD", tipoCambio: 17.5 },
      }),
    );
    assert.equal(payload.DatosCFDI40.Moneda, "USD");
    assert.equal(payload.DatosCFDI40.TipoCambio, 17.5);
  });

  it("normaliza permiso SCT TPAFO1 en CartaPorte31", () => {
    const payload = buildFactura40Payload(
      baseCtx({
        truck: { ...baseCtx().truck, perm_sct: "TPAFO1" } as TimbradoContext["truck"],
      }),
    );
    const autotransporte = (
      payload.CartaPorte31 as {
        MercanciasCartaPorte30?: { Autotransporte30?: { permsct?: string } };
      }
    ).MercanciasCartaPorte30?.Autotransporte30;
    assert.equal(autotransporte?.permsct, "TPAF01");
  });

  it("incluye CantidadTransporta en mercancías Carta Porte", () => {
    const payload = buildFactura40Payload(baseCtx());
    const merc = (
      payload.CartaPorte31 as {
        MercanciasCartaPorte30?: { Mercancia30?: Array<{ CantidadTransporta?: unknown[] }> };
      }
    ).MercanciasCartaPorte30?.Mercancia30?.[0];
    assert.ok(merc?.CantidadTransporta?.length);
    const ct = merc?.CantidadTransporta?.[0] as { IDOrigen?: string; IDDestino?: string };
    assert.ok(ct.IDOrigen?.startsWith("OR"));
    assert.ok(ct.IDDestino?.startsWith("DE"));
  });

  it("ingreso con Carta Porte no incluye InformacionGlobal", () => {
    const payload = buildFactura40Payload(baseCtx({ tipo: "ingreso" }));
    assert.equal(payload.InformacionGlobal, null);
  });

  it("ingreso a público en general sin Carta Porte incluye InformacionGlobal", () => {
    const payload = buildFactura40Payload(
      baseCtx({
        tipo: "ingreso",
        tenant: { ...baseCtx().tenant, cp_fiscal: "45640" } as TimbradoContext["tenant"],
        ubicaciones: [],
        mercancias: [],
        client: {
          rfc: "XAXX010101000",
          razon_social: "PUBLICO EN GENERAL",
          cp: "44100",
          regimen_fiscal: "601",
        } as TimbradoContext["client"],
      }),
    );
    assert.ok(payload.InformacionGlobal);
    assert.equal(payload.InformacionGlobal?.Año, String(new Date().getFullYear()));
    assert.equal(payload.ReceptorCFDI40.DomicilioFiscalReceptor, "45640");
    assert.equal(payload.ReceptorCFDI40.RegimenFiscalReceptor, "616");
    assert.equal(payload.DatosCFDI40.Serie, "A");
  });
});
