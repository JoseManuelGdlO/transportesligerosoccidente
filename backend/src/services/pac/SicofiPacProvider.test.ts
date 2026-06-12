import assert from "node:assert/strict";
import { describe, it, mock, afterEach } from "node:test";
import { encryptSecret } from "../../utils/fiscalCrypto";
import { SicofiPacProvider } from "./SicofiPacProvider";
import { clearSicofiTokenCacheForTests } from "./sicofi/sicofiAuth";
import type { TimbradoContext } from "./types";

const fixtureXml = `<?xml version="1.0"?>
<cfdi:Comprobante Serie="A" Folio="99" xmlns:cfdi="http://www.sat.gob.mx/cfd/4">
<tfd:TimbreFiscalDigital UUID="AAA-BBB-CCC" FechaTimbrado="2026-06-10T12:00:00" />
</cfdi:Comprobante>`;

const minimalCtx = (): TimbradoContext =>
  ({
    tipo: "traslado",
    trip: { id: "t1", folio: "F1", origen: "A", destino: "B", tarifa: "0" },
    tenant: { cfdi_serie: "CP", cp_fiscal: "44100" },
    cartaPorte: { id_ccp: "x" },
    ubicaciones: [
      { orden: 1, tipo: "Origen", cp: "44100", estado: "JAL", colonia_clave: "1", municipio_clave: "2" },
      {
        orden: 2,
        tipo: "Destino",
        cp: "44100",
        estado: "JAL",
        distancia_km: "10",
        colonia_clave: "1",
        municipio_clave: "2",
      },
    ],
    mercancias: [
      {
        descripcion: "M",
        cantidad: "1",
        unidad: "H87",
        peso_kg: "1",
        clave_prod_serv: "50192100",
        material_peligroso: false,
      },
    ],
    truck: {
      placas: "X",
      anio: 2020,
      config_vehicular: "C2",
      perm_sct: "TPAF01",
      num_permiso_sct: "1",
      peso_bruto_vehicular: "1000",
      aseguradora_resp_civil: "GNP",
      poliza_resp_civil: "P1",
    },
    driver: { nombre: "Op", rfc: "XAXX010101000", licencia_federal: "L1" },
    client: { rfc: "CLI", razon_social: "C", cp: "44100", regimen_fiscal: "601" },
  }) as TimbradoContext;

function authResponse() {
  return new Response(JSON.stringify({ access_token: "jwt-test", expires_in: 3600 }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function facturaResponse() {
  return new Response(fixtureXml, { status: 200, headers: { "Content-Type": "application/xml" } });
}

describe("SicofiPacProvider", () => {
  afterEach(() => {
    mock.restoreAll();
    clearSicofiTokenCacheForTests();
  });

  it("timbrar éxito con fetch mock (auth + factura)", async () => {
    process.env.FISCAL_ENC_KEY = "test-key-for-unit-tests-only";
    const tenant = {
      pac_usuario: "user@test.com",
      pac_token_enc: encryptSecret("secret"),
      pac_proveedor: "sicofi",
      cfdi_serie: "CP",
      cp_fiscal: "44100",
    } as never;

    const calls: Array<{ url: string; init?: RequestInit }> = [];
    mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      calls.push({ url, init });
      if (url.includes("/auth/token")) return authResponse();
      return facturaResponse();
    });

    const provider = new SicofiPacProvider();
    const result = await provider.timbrar({ ...minimalCtx(), tenant });
    assert.equal(result.uuid, "AAA-BBB-CCC");
    assert.equal(result.serie, "A");
    assert.equal(result.folio, "99");
    assert.equal(calls.length, 2);
    assert.match(calls[0]!.url, /\/auth\/token$/);
    assert.match(calls[1]!.url, /Factura40$/);
    const facturaHeaders = calls[1]!.init?.headers as Record<string, string>;
    assert.equal(facturaHeaders.Authorization, "Bearer jwt-test");
  });

  it("reintenta tras 401 en Factura40", async () => {
    process.env.FISCAL_ENC_KEY = "test-key-for-unit-tests-only";
    const tenant = {
      pac_usuario: "user@test.com",
      pac_token_enc: encryptSecret("secret"),
      pac_proveedor: "sicofi",
      cfdi_serie: "CP",
      cp_fiscal: "44100",
    } as never;

    let facturaCalls = 0;
    mock.method(globalThis, "fetch", async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/auth/token")) return authResponse();
      facturaCalls += 1;
      if (facturaCalls === 1) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
      }
      return facturaResponse();
    });

    const provider = new SicofiPacProvider();
    const result = await provider.timbrar({ ...minimalCtx(), tenant });
    assert.equal(result.uuid, "AAA-BBB-CCC");
    assert.equal(facturaCalls, 2);
  });

  it("falla sin credenciales", async () => {
    const provider = new SicofiPacProvider();
    await assert.rejects(
      () => provider.timbrar({ ...minimalCtx(), tenant: {} as never }),
      /Credenciales Sicofi/,
    );
  });
});
