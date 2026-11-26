import { describe, expect, it } from "vitest";
import {
  aplicarParteEnFormulario,
  avisoParteDistinta,
  partesConOtroNombre,
} from "./cartaPorteReceptor";

const receptorB = { rfc: "BBB010101BBB", nombre: "Cliente B" };

describe("partesConOtroNombre", () => {
  it("avisa cuando origen y destino siguen a nombre del cliente anterior", () => {
    const distintas = partesConOtroNombre(
      [
        { rol: "origen", rfc: "AAA010101AAA", nombre: "Cliente A" },
        { rol: "destino", rfc: "AAA010101AAA", nombre: "Cliente A" },
      ],
      receptorB,
    );
    expect(distintas.map((p) => p.rol)).toEqual(["origen", "destino"]);
    expect(avisoParteDistinta(distintas, "Cliente B")).toBe(
      "El origen sigue a nombre de Cliente A (AAA010101AAA). El destino sigue a nombre de Cliente A (AAA010101AAA). El CFDI se cobra a Cliente B. Esas filas viajan en el mismo comprobante.",
    );
  });

  it("no avisa si el RFC y la razón social ya son los del receptor", () => {
    const distintas = partesConOtroNombre(
      [
        { rol: "origen", rfc: "bbb 010101 bbb", nombre: "cliente b" },
        { rol: "destino", rfc: "", nombre: "" },
      ],
      receptorB,
    );
    expect(distintas).toEqual([]);
    expect(avisoParteDistinta(distintas, "Cliente B")).toBe("");
  });

  it("avisa si el RFC coincide pero la razón social es otra", () => {
    const distintas = partesConOtroNombre(
      [{ rol: "origen", rfc: "BBB010101BBB", nombre: "Bodega Norte" }],
      receptorB,
    );
    expect(avisoParteDistinta(distintas, "Cliente B")).toContain("Bodega Norte");
  });
});

describe("aplicarParteEnFormulario", () => {
  it("escribe el nombre nuevo y suelta el catálogo", () => {
    const applied = aplicarParteEnFormulario(
      { rfc: "AAA010101AAA", nombre: "Cliente A", client_ubicacion_id: "ubi-a", calle: "Hidalgo" },
      { rfc: "BBB010101BBB", nombre: "Cliente B", client_ubicacion_id: null },
    );
    expect(applied.cambioIdentidad).toBe(true);
    expect(applied.form.rfc).toBe("BBB010101BBB");
    expect(applied.form.nombre).toBe("Cliente B");
    expect(applied.form.client_ubicacion_id).toBeUndefined();
    expect(applied.form.calle).toBe("Hidalgo");
  });

  it("no borra el RFC de pantalla si la fila guardada no trae RFC", () => {
    const applied = aplicarParteEnFormulario(
      { rfc: "BBB010101BBB", nombre: "Cliente B", client_ubicacion_id: "ubi-b" },
      { rfc: null, nombre: null, client_ubicacion_id: "ubi-b" },
    );
    expect(applied.cambioIdentidad).toBe(false);
    expect(applied.form.rfc).toBe("BBB010101BBB");
    expect(applied.form.nombre).toBe("Cliente B");
    expect(applied.form.client_ubicacion_id).toBe("ubi-b");
  });
});
