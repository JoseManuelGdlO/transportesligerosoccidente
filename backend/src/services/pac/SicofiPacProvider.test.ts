import assert from "node:assert/strict";
import { describe, it, mock, afterEach } from "node:test";
import { encryptSecret } from "../../utils/fiscalCrypto";
import { SicofiPacProvider } from "./SicofiPacProvider";
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
        clave_prod_serv: "78101800",
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

describe("SicofiPacProvider", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("timbrar éxito con fetch mock", async () => {
    process.env.FISCAL_ENC_KEY = "test-key-for-unit-tests-only";
    const tenant = {
      pac_usuario: "user@test.com",
      pac_token_enc: encryptSecret("secret"),
      pac_proveedor: "sicofi",
      cfdi_serie: "CP",
      cp_fiscal: "44100",
    } as never;

    mock.method(globalThis, "fetch", async () =>
      new Response(fixtureXml, { status: 200, headers: { "Content-Type": "application/xml" } }),
    );

    const provider = new SicofiPacProvider();
    const result = await provider.timbrar({ ...minimalCtx(), tenant });
    assert.equal(result.uuid, "AAA-BBB-CCC");
    assert.equal(result.serie, "A");
    assert.equal(result.folio, "99");
  });

  it("falla sin credenciales", async () => {
    const provider = new SicofiPacProvider();
    await assert.rejects(
      () => provider.timbrar({ ...minimalCtx(), tenant: {} as never }),
      /Credenciales Sicofi/,
    );
  });
});
