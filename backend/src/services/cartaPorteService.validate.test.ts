import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { validateCartaPorteData } from "./cartaPorteService";
import type { TripUbicacion } from "../models";

describe("validateCartaPorteData distancia", () => {
  const baseTrip = { id: "t1" } as never;
  const baseTenant = {
    rfc: "EMI010101AB1",
    razon_social: "Emisor",
    regimen_fiscal: "601",
    cp_fiscal: "44100",
    csd_cer_path: "/a.cer",
    csd_key_path: "/a.key",
  } as never;
  const client = {
    rfc: "CLI010101CL1",
    razon_social: "Cliente SA",
  } as never;

  it("acepta distancia_km como string DECIMAL de Sequelize", () => {
    const ubicaciones = [
      { orden: 1, cp: "44100", rfc: "A", nombre: "Origen" },
      { orden: 2, cp: "45010", rfc: "B", nombre: "Destino", distancia_km: "5.00" },
    ] as TripUbicacion[];
    const issues = validateCartaPorteData(
      baseTrip,
      baseTenant,
      ubicaciones,
      [{ id: "m1" } as never],
      { config_vehicular: "C2", perm_sct: "TPAF01", num_permiso_sct: "1", peso_bruto_vehicular: 1, aseguradora_resp_civil: "S", poliza_resp_civil: "P" } as never,
      { nombre: "Op", rfc: "OPR010101OP1", licencia_federal: "L1" } as never,
      client,
    );
    assert.equal(
      issues.some((i) => i.includes("distancia")),
      false,
      issues.join("; "),
    );
  });
});
