import { describe, expect, it } from "vitest";
import { weekRowCountsInPayroll } from "@/lib/weekSettlement";

describe("weekRowCountsInPayroll", () => {
  it("incluye abiertas, preliquidaciones y cerradas en el pago de la semana", () => {
    expect(weekRowCountsInPayroll("abierta")).toBe(true);
    expect(weekRowCountsInPayroll("preliquidacion")).toBe(true);
    expect(weekRowCountsInPayroll("cerrada")).toBe(true);
  });

  it("respeta quitar a un operador del pago", () => {
    expect(weekRowCountsInPayroll("abierta", false)).toBe(false);
    expect(weekRowCountsInPayroll("cerrada", true)).toBe(true);
  });

  it("no suma al pago de esta semana si los viajes ya se liquidaron en otra", () => {
    expect(weekRowCountsInPayroll("abierta", undefined, true)).toBe(false);
    expect(weekRowCountsInPayroll("abierta", true, true)).toBe(true);
  });
});
