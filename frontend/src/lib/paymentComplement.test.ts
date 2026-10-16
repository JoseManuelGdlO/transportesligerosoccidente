import { describe, expect, it } from "vitest";
import { montoCobroDefault } from "./paymentComplement";

describe("montoCobroDefault", () => {
  it("toma el menor entre saldo interno y saldo SAT", () => {
    expect(montoCobroDefault(600, 1000)).toBe(600);
    expect(montoCobroDefault(1000, 400)).toBe(400);
  });
});
