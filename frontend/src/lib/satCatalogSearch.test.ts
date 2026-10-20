import { describe, expect, it } from "vitest";
import { satCatalogSearchTerm } from "@/lib/satCatalogSearch";
import { normalizeTripUbicacion } from "@/lib/tloApi";

describe("satCatalogSearchTerm", () => {
  it("al abrir el catálogo no reutiliza la clave ya elegida", () => {
    expect(satCatalogSearchTerm("", "0910")).toBe("");
    expect(satCatalogSearchTerm("  agua ", "0910")).toBe("agua");
  });
});

describe("normalizeTripUbicacion", () => {
  it("conserva las claves SAT de colonia, municipio y localidad", () => {
    const ubicacion = normalizeTripUbicacion({
      id: "u1",
      tipo: "Destino",
      colonia: "Agua Blanca Industrial",
      colonia_clave: "0910",
      municipio: "Zapopan",
      municipio_clave: "120",
      localidad: "Zapopan",
      localidad_clave: "10",
      cp: "45235",
    });
    expect(ubicacion.colonia_clave).toBe("0910");
    expect(ubicacion.municipio_clave).toBe("120");
    expect(ubicacion.localidad_clave).toBe("10");
  });
});
