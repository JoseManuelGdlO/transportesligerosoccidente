import { describe, expect, it } from "vitest";
import { groupCatalogUbicaciones, sublocationLabel } from "./groupClientUbicaciones";
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
  it("agrupa por CP y lista cada colonia y calle", () => {
    const groups = groupCatalogUbicaciones([
      u({ id: "1", nombre: "HIDALGO 10", colonia: "Centro", calle: "Hidalgo", numero_exterior: "10" }),
      u({ id: "2", nombre: "MORELOS 5", colonia: "Centro", calle: "Morelos", numero_exterior: "5" }),
      u({ id: "3", nombre: "HIDALGO 10", colonia: "La Piedrera", calle: "Hidalgo", numero_exterior: "10" }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].header).toBe("47829 - CLIENTE ACEROS HH");
    expect(groups[0].items.map((item) => item.label)).toEqual([
      "colonia Centro, Hidalgo 10",
      "colonia Centro, Morelos 5",
      "colonia La Piedrera, Hidalgo 10",
    ]);
  });

  it("pone la calle en el encabezado cuando todas coinciden", () => {
    const groups = groupCatalogUbicaciones([
      u({ id: "1", nombre: "JALISCO", colonia: "Centro", calle: "AV. JALISCO", numero_exterior: "10" }),
      u({ id: "2", nombre: "JALISCO", colonia: "La Piedrera", calle: "Avenida Jalisco", numero_exterior: "10" }),
    ]);
    expect(groups[0].header).toBe("AVENIDA JALISCO 47829 - CLIENTE ACEROS HH");
    expect(groups[0].items.map((item) => item.label)).toEqual([
      "colonia Centro, AV. JALISCO 10",
      "colonia La Piedrera, Avenida Jalisco 10",
    ]);
  });

  it("no muestra calle en el encabezado si alguna fila no tiene calle", () => {
    const groups = groupCatalogUbicaciones([
      u({ id: "1", nombre: "JALISCO", calle: "AV. JALISCO", numero_exterior: "10" }),
      u({ id: "2", nombre: "SIN CALLE" }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].header).toBe("47829 - CLIENTE ACEROS HH");
  });

  it("excluye el número final de la calle compartida", () => {
    const groups = groupCatalogUbicaciones([u({ id: "1", nombre: "LOMAS", calle: "LAS LOMAS 1395", numero_exterior: "" })]);
    expect(groups[0].header).toBe("LAS LOMAS 47829 - CLIENTE ACEROS HH");
  });

  it("no reescribe una letra C suelta como CALLE", () => {
    const groups = groupCatalogUbicaciones([u({ id: "1", nombre: "LOTE", calle: "LOTE 19 C", numero_exterior: "" })]);
    expect(groups[0].header).toContain("LOTE 19 C");
    expect(groups[0].header).not.toContain("CALLE");
  });

  it("unifica BLVD y BULEVAR en un solo grupo", () => {
    const groups = groupCatalogUbicaciones([
      u({ id: "1", nombre: "HIDALGO", calle: "BLVD. HIDALGO", numero_exterior: "10" }),
      u({ id: "2", nombre: "HIDALGO", calle: "BULEVAR HIDALGO", numero_exterior: "10" }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].header.startsWith("BOULEVARD HIDALGO")).toBe(true);
  });

  it("agrega la localidad a la sububicación", () => {
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
