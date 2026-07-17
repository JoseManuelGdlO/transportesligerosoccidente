import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { validateSicofiFactura40 } from "./validateSicofiFactura40";
import type { TimbradoContext } from "../types";

function ubicacionCompleta(orden: number, cp: string, distancia_km?: string) {
  return {
    orden,
    rfc: orden === 1 ? "AAA010101AAA" : "BBB010101BBB",
    nombre: orden === 1 ? "Origen SA" : "Destino SA",
    cp,
    estado: "JAL",
    municipio_clave: "097",
    municipio: "Tlajomulco de Zaragoza",
    localidad_clave: "11",
    localidad: "Tlajomulco de Zaragoza",
    colonia_clave: "4535",
    colonia: "Arbolada Bosques de Santa Anita",
    ...(distancia_km ? { distancia_km } : {}),
  };
}

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
      ubicacionCompleta(1, "45645"),
      ubicacionCompleta(2, "45010", "10"),
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

describe("validateSicofiFactura40 ubicaciones", () => {
  it("exige colonia, municipio y estado cuando el domicilio está completo en claves", async () => {
    const issues = await validateSicofiFactura40(baseCtx());
    assert.equal(
      issues.some((i) => i.includes("colonia") || i.includes("municipio") || i.includes("estado")),
      false,
    );
  });

  it("exige razón social, código postal y domicilio SAT", async () => {
    const issues = await validateSicofiFactura40(
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
    assert.ok(issues.some((i) => i.includes("falta estado")));
    assert.ok(issues.some((i) => i.includes("falta municipio")));
    assert.ok(issues.some((i) => i.includes("falta colonia")));
  });
});
