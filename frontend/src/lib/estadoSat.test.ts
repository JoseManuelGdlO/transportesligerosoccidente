import { describe, expect, it } from "vitest";
import { estadoClaveSatIssue, isEstadoSatCode } from "@/lib/estadoSat";
import { validateClientForm } from "@/lib/validateClientForm";
import { validateClientUbicacionForm } from "@/lib/validateClientUbicacionForm";

describe("estadoClaveSatIssue", () => {
  it("acepta la clave SAT en cualquier capitalización", () => {
    expect(isEstadoSatCode("JAL")).toBe(true);
    expect(isEstadoSatCode("jal")).toBe(true);
    expect(estadoClaveSatIssue("JAL", "MEX")).toBeNull();
    expect(estadoClaveSatIssue("jal", "MEX")).toBeNull();
  });

  it("rechaza el nombre del estado y señala la clave", () => {
    expect(estadoClaveSatIssue("JALISCO", "MEX")).toBe(
      '"JALISCO" no es clave SAT. Jalisco corresponde a JAL. Selecciónala en el catálogo.',
    );
    expect(estadoClaveSatIssue("Estado de México", "")).toContain("MEX");
  });

  it("rechaza una clave inventada", () => {
    expect(estadoClaveSatIssue("XYZ", "MEX")).toBe(
      "Usa la clave SAT del estado (por ejemplo JAL), no el nombre.",
    );
  });

  it("permite vacío y estados de otro país", () => {
    expect(estadoClaveSatIssue("", "MEX")).toBeNull();
    expect(estadoClaveSatIssue(undefined, "MEX")).toBeNull();
    expect(estadoClaveSatIssue("California", "USA")).toBeNull();
  });
});

describe("validateClientUbicacionForm", () => {
  it("impide guardar JALISCO como estado", () => {
    const errors = validateClientUbicacionForm({
      nombre: "Planta",
      pais: "MEX",
      estado: "JALISCO",
    });
    expect(errors.estado).toContain("JAL");
    expect(errors.nombre).toBeUndefined();
  });
});

describe("validateClientForm", () => {
  const base = {
    razon_social: "Cliente",
    rfc: "XAXX010101000",
    contacto: "Ana",
    telefono: "3311111111",
  };

  it("impide guardar el nombre del estado en el domicilio fiscal", () => {
    const errors = validateClientForm({ ...base, pais: "MEX", estado: "Jalisco" });
    expect(errors.estado).toContain("JAL");
  });

  it("sigue exigiendo estado cuando el domicilio es obligatorio y viene vacío", () => {
    const errors = validateClientForm(
      { ...base, pais: "MEX", estado: "" },
      { requireDomicilio: true },
    );
    expect(errors.estado).toBe("El estado es obligatorio");
  });
});
