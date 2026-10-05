import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classifyPacError, formatPacErrorMessage } from "./sicofiErrors";

describe("formatPacErrorMessage", () => {
  it("marca códigos CFDI como SAT y quita el prefijo Error", () => {
    const msg = formatPacErrorMessage(
      "Error: CFDI40158 - La clave del campo RegimenFiscalR debe corresponder con el tipo de persona (física o moral).",
    );
    assert.equal(
      msg,
      "SAT: CFDI40158 - La clave del campo RegimenFiscalR debe corresponder con el tipo de persona (física o moral).",
    );
    assert.equal(classifyPacError(msg).origin, "sat");
  });

  it("marca códigos de Carta Porte como SAT", () => {
    assert.match(formatPacErrorMessage("CP131 - falta CantidadTransporta"), /^SAT: CP131/);
  });

  it("marca fallos de autenticación como Sicofi", () => {
    assert.equal(formatPacErrorMessage("Sicofi auth respondió 401"), "Sicofi: auth respondió 401");
  });

  it("marca timeouts de Sicofi", () => {
    assert.equal(
      formatPacErrorMessage("Timeout al conectar con Sicofi"),
      "Sicofi: Timeout al conectar con Sicofi",
    );
  });

  it("es idempotente si el mensaje ya trae prefijo", () => {
    const once = formatPacErrorMessage("Error: CFDI40106 - CSD");
    assert.equal(formatPacErrorMessage(once), once);
  });

  it("deja igual un error que no es del PAC ni del SAT", () => {
    assert.equal(formatPacErrorMessage("Datos incompletos para timbrar"), "Datos incompletos para timbrar");
  });
});
