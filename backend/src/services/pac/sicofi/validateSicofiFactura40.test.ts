import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { validateSicofiFactura40 } from "./validateSicofiFactura40";
import type { TimbradoContext } from "../types";

function baseCtx(
  overrides: Partial<TimbradoContext> & {
    ubicaciones?: TimbradoContext["ubicaciones"];
  } = {},
): TimbradoContext {
  return {
    tipo: "traslado",
    trip: { tarifa: "0", tipo_viaje: "local" } as TimbradoContext["trip"],
    tenant: {
      pac_proveedor: "sicofi",
      pac_usuario: "user",
      pac_token_enc: "enc",
      rfc: "EMI010101AB1",
      razon_social: "Emisor",
      cp_fiscal: "44100",
    } as TimbradoContext["tenant"],
    cartaPorte: {} as TimbradoContext["cartaPorte"],
    ubicaciones: [
      { orden: 1, rfc: "AAA010101AAA", nombre: "Origen SA", cp: "44100" },
      { orden: 2, rfc: "BBB010101BBB", nombre: "Destino SA", cp: "45010", distancia_km: "10" },
    ] as TimbradoContext["ubicaciones"],
    mercancias: [
      {
        descripcion: "Carga",
        cantidad: "1",
        unidad: "H87",
        peso_kg: "100",
        clave_prod_serv: "50192100",
        material_peligroso: false,
      },
    ] as TimbradoContext["mercancias"],
    truck: {
      config_vehicular: "C2",
      perm_sct: "TPAF01",
      num_permiso_sct: "1",
      peso_bruto_vehicular: "1000",
      placas: "ABC",
      anio: 2020,
      aseguradora_resp_civil: "Seg",
      poliza_resp_civil: "Pol",
    } as TimbradoContext["truck"],
    driver: {
      rfc: "OPR010101OP1",
      nombre: "Operador",
      licencia_federal: "LIC1",
    } as TimbradoContext["driver"],
    client: {
      rfc: "CLI010101CL1",
      razon_social: "Cliente",
      regimen_fiscal: "601",
      cp: "44100",
    } as TimbradoContext["client"],
    ...overrides,
  };
}

describe("validateSicofiFactura40 ubicaciones simplificadas", () => {
  it("no exige colonia ni municipio", () => {
    const issues = validateSicofiFactura40(baseCtx());
    assert.equal(
      issues.some((i) => i.includes("colonia") || i.includes("municipio")),
      false,
    );
  });

  it("exige razón social y código postal por ubicación", () => {
    const issues = validateSicofiFactura40(
      baseCtx({
        ubicaciones: [
          { orden: 1, rfc: "AAA010101AAA", cp: "44100" },
          { orden: 2, rfc: "BBB010101BBB", cp: "", distancia_km: "10" },
        ] as TimbradoContext["ubicaciones"],
        client: {
          rfc: "CLI010101CL1",
          razon_social: "",
          regimen_fiscal: "601",
          cp: "44100",
        } as TimbradoContext["client"],
      }),
    );
    assert.ok(issues.some((i) => i.includes("falta razón social")));
    assert.ok(issues.some((i) => i.includes("falta código postal")));
  });
});
