import { describe, expect, it } from "vitest";
import {
  filledConceptos,
  parsePrecioInput,
  sumConceptos,
  validateConceptos,
} from "./documentConceptos";

describe("documentConceptos", () => {
  it("rechaza precio negativo y acepta decimal", () => {
    expect(validateConceptos([{ descripcion: "Lona", precio: -1 }])).toMatch(/negativo/);
    expect(validateConceptos([{ descripcion: "Lona", precio: 10.5 }])).toBeNull();
    expect(validateConceptos([{ descripcion: "Lona", precio: 250 }])).toBeNull();
  });

  it("exige al menos un concepto con descripción", () => {
    expect(validateConceptos([{ descripcion: "", precio: 0 }])).toMatch(/al menos un concepto/);
  });

  it("normaliza precio a money (2 decimales) no negativo y suma", () => {
    expect(parsePrecioInput("-12.9")).toBe(0);
    expect(parsePrecioInput("1500.859")).toBe(1500.86);
    const lineas = filledConceptos([
      { descripcion: " Transmisión ", precio: 2500.25 },
      { descripcion: "", precio: 0 },
      { descripcion: "Lona", precio: 250.5 },
    ]);
    expect(lineas).toEqual([
      { descripcion: "Transmisión", precio: 2500.25 },
      { descripcion: "Lona", precio: 250.5 },
    ]);
    expect(sumConceptos(lineas)).toBe(2750.75);
  });
});
