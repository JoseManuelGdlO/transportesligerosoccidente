import { describe, expect, it } from "vitest";
import { catalogUbicacionOptions, sublocationLabel } from "./groupClientUbicaciones";
import type { ClientUbicacion } from "@/types/tlo";

function u(partial: Partial<ClientUbicacion> & Pick<ClientUbicacion, "id" | "nombre">): ClientUbicacion {
  return {
    client_id: "cli-1",
    tipo: "Ambos",
    client_razon_social: "CLIENTE ACEROS HH",
    cp: "47829",
    ...partial,
  };
}

describe("selector de ubicaciones", () => {
  it("lista una opción por ubicación y no anida colonias del mismo CP", () => {
    const options = catalogUbicacionOptions([
      u({ id: "1", nombre: "HIDALGO 10", colonia: "Centro", calle: "Hidalgo", numero_exterior: "10" }),
      u({ id: "2", nombre: "MORELOS 5", colonia: "Centro", calle: "Morelos", numero_exterior: "5" }),
    ]);
    expect(options.map((item) => item.label)).toEqual([
      "HIDALGO 47829 - CLIENTE ACEROS HH",
      "MORELOS 47829 - CLIENTE ACEROS HH",
    ]);
    expect(options.every((item) => !item.label.toLowerCase().includes("colonia"))).toBe(true);
  });

  it("deja el mismo CP de otro cliente como otra opción", () => {
    const options = catalogUbicacionOptions([
      u({ id: "1", nombre: "PLANTA", calle: "Hidalgo", numero_exterior: "10" }),
      u({
        id: "2",
        nombre: "BODEGA",
        client_id: "cli-2",
        client_razon_social: "RECALL",
        calle: "Hidalgo",
        numero_exterior: "10",
      }),
    ]);
    expect(options.map((item) => item.label)).toEqual([
      "HIDALGO 47829 - CLIENTE ACEROS HH",
      "HIDALGO 47829 - RECALL",
    ]);
  });

  it("normaliza la calle en la etiqueta", () => {
    const options = catalogUbicacionOptions([
      u({ id: "1", nombre: "JALISCO", calle: "AV. JALISCO", numero_exterior: "10" }),
    ]);
    expect(options[0].label).toBe("AVENIDA JALISCO 47829 - CLIENTE ACEROS HH");
  });

  it("omite la calle cuando no hay", () => {
    const options = catalogUbicacionOptions([u({ id: "2", nombre: "SIN CALLE", calle: "" })]);
    expect(options[0].label).toBe("47829 - CLIENTE ACEROS HH");
  });

  it("excluye el número final pegado a la calle", () => {
    const options = catalogUbicacionOptions([
      u({ id: "1", nombre: "LOMAS", calle: "LAS LOMAS 1395", numero_exterior: "" }),
    ]);
    expect(options[0].label).toBe("LAS LOMAS 47829 - CLIENTE ACEROS HH");
  });

  it("no reescribe una letra C suelta como CALLE", () => {
    const options = catalogUbicacionOptions([u({ id: "1", nombre: "LOTE", calle: "LOTE 19 C", numero_exterior: "" })]);
    expect(options[0].label).toContain("LOTE 19 C");
    expect(options[0].label).not.toContain("CALLE");
  });

  it("unifica BLVD y BULEVAR en la etiqueta", () => {
    const options = catalogUbicacionOptions([
      u({ id: "1", nombre: "HIDALGO", calle: "BLVD. HIDALGO", numero_exterior: "10" }),
      u({ id: "2", nombre: "HIDALGO", calle: "BULEVAR HIDALGO", numero_exterior: "10" }),
    ]);
    expect(options.every((item) => item.label.startsWith("BOULEVARD HIDALGO"))).toBe(true);
  });

  it("describe el domicilio en la ficha del cliente", () => {
    expect(
      sublocationLabel({
        nombre: "HIDALGO",
        colonia: "Centro",
        calle: "Hidalgo",
        numero_exterior: "10",
        localidad: "Ocotlán",
      }),
    ).toBe("colonia Centro, Hidalgo 10, Ocotlán");
  });
});
