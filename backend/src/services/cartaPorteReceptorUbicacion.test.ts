import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { relabelUbicacionAlCambiarReceptor } from "./cartaPorteReceptorUbicacion";

const clienteA = { rfc: "AAA010101AAA", nombre: "Cliente A" };
const clienteB = { rfc: "BBB010101BBB", nombre: "Cliente B" };

describe("relabelUbicacionAlCambiarReceptor", () => {
  it("pasa RFC y razón social al cliente nuevo y suelta el catálogo", () => {
    const next = relabelUbicacionAlCambiarReceptor(
      {
        rfc: "aaa 010101 aaa",
        nombre: "Cliente A",
        client_ubicacion_id: "ubi-a",
      },
      clienteA,
      clienteB,
    );
    assert.equal(next.changed, true);
    assert.equal(next.rfc, "BBB010101BBB");
    assert.equal(next.nombre, "Cliente B");
    assert.equal(next.client_ubicacion_id, null);
  });

  it("no toca un remitente con otro RFC", () => {
    const next = relabelUbicacionAlCambiarReceptor(
      { rfc: "CCC010101CCC", nombre: "Bodega Norte", client_ubicacion_id: "ubi-c" },
      clienteA,
      clienteB,
    );
    assert.equal(next.changed, false);
    assert.equal(next.rfc, "CCC010101CCC");
    assert.equal(next.nombre, "Bodega Norte");
    assert.equal(next.client_ubicacion_id, "ubi-c");
  });

  it("si no hay RFC y el nombre es el del cliente anterior, lo reescribe", () => {
    const next = relabelUbicacionAlCambiarReceptor(
      { rfc: "  ", nombre: "cliente   a", client_ubicacion_id: null },
      clienteA,
      clienteB,
    );
    assert.equal(next.changed, true);
    assert.equal(next.rfc, "BBB010101BBB");
    assert.equal(next.nombre, "Cliente B");
  });

  it("si no hay RFC y el nombre es de otro, lo deja", () => {
    const next = relabelUbicacionAlCambiarReceptor(
      { rfc: "", nombre: "Bodega Norte", client_ubicacion_id: "ubi-c" },
      clienteA,
      clienteB,
    );
    assert.equal(next.changed, false);
    assert.equal(next.nombre, "Bodega Norte");
    assert.equal(next.client_ubicacion_id, "ubi-c");
  });

  it("no reescribe si el cliente nuevo no tiene RFC ni razón social", () => {
    const next = relabelUbicacionAlCambiarReceptor(
      { rfc: "AAA010101AAA", nombre: "Cliente A", client_ubicacion_id: null },
      clienteA,
      { rfc: " ", nombre: " " },
    );
    assert.equal(next.changed, false);
    assert.equal(next.rfc, "AAA010101AAA");
    assert.equal(next.nombre, "Cliente A");
  });
});
