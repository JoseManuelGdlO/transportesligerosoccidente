import { describe, expect, it } from "vitest";
import {
  parseModalidadCobro,
  permiteTimbrar,
  tipoDoctoSaldos,
} from "./modalidadCobro";

describe("parseModalidadCobro", () => {
  it("cae a factura si el valor no existe o no es válido", () => {
    expect(parseModalidadCobro(undefined)).toBe("factura");
    expect(parseModalidadCobro("otro")).toBe("factura");
    expect(parseModalidadCobro("efectivo")).toBe("efectivo");
  });
});

describe("permiteTimbrar", () => {
  it("solo admite factura", () => {
    expect(permiteTimbrar("factura")).toBe(true);
    expect(permiteTimbrar("efectivo")).toBe(false);
    expect(permiteTimbrar("sin_comision")).toBe(false);
    expect(permiteTimbrar("sin_cobro")).toBe(false);
  });
});

describe("tipoDoctoSaldos", () => {
  it("usa etiquetas WinAnsi para el PDF", () => {
    expect(tipoDoctoSaldos("factura")).toBe("FACTURA");
    expect(tipoDoctoSaldos("efectivo")).toBe("EFECTIVO");
    expect(tipoDoctoSaldos("sin_comision")).toBe("SIN COMISION");
    expect(tipoDoctoSaldos(undefined)).toBe("FACTURA");
  });
});
