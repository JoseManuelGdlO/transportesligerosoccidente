import { describe, expect, it } from "vitest";
import { montoCobroDefault, pendingComplementIdFromError } from "./paymentComplement";

describe("montoCobroDefault", () => {
  it("toma el menor entre saldo interno y saldo SAT", () => {
    expect(montoCobroDefault(600, 1000)).toBe(600);
    expect(montoCobroDefault(1000, 400)).toBe(400);
  });
});

describe("pendingComplementIdFromError", () => {
  it("lee el id del complemento que bloquea otro cobro", () => {
    const id = "3b7c1c2e-4f5a-4b6c-8d9e-0a1b2c3d4e5f";
    expect(
      pendingComplementIdFromError(
        `Hay un complemento pendiente (${id}). Reintentalo o descartalo.`,
      ),
    ).toBe(id);
    expect(pendingComplementIdFromError("El monto excede el saldo interno")).toBeNull();
  });
});
