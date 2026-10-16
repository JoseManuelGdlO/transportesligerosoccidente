import { describe, expect, it } from "vitest";
import {
  correoComplementoBody,
  montoCobroDefault,
  pendingComplementIdFromError,
} from "./paymentComplement";

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

describe("correoComplementoBody", () => {
  it("no manda correo si el switch está apagado", () => {
    expect(correoComplementoBody(false, "cliente@empresa.com", "Hola")).toEqual({
      ok: true,
      fields: {},
    });
  });

  it("manda correo recortado y mensaje cuando el switch está encendido", () => {
    expect(correoComplementoBody(true, "  cliente@empresa.com  ", "  Adjunto el complemento.  ")).toEqual({
      ok: true,
      fields: { email: "cliente@empresa.com", email_mensaje: "Adjunto el complemento." },
    });
  });

  it("omite el mensaje vacío", () => {
    expect(correoComplementoBody(true, "cliente@empresa.com", "   ")).toEqual({
      ok: true,
      fields: { email: "cliente@empresa.com" },
    });
  });

  it("rechaza un correo inválido", () => {
    expect(correoComplementoBody(true, "no-es-correo", "Hola")).toEqual({
      ok: false,
      error: "El correo no es válido",
    });
  });
});
