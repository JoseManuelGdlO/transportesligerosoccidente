import { describe, expect, it } from "vitest";
import { condicionesPagoDesdeDias } from "./condicionesPago";

describe("condicionesPagoDesdeDias", () => {
  it("arma el texto con el plazo del cliente", () => {
    expect(condicionesPagoDesdeDias(30)).toBe("CREDITO 30 DIAS");
    expect(condicionesPagoDesdeDias(0)).toBe("CONTADO");
    expect(condicionesPagoDesdeDias(null)).toBe("");
    expect(condicionesPagoDesdeDias(undefined)).toBe("");
  });
});
