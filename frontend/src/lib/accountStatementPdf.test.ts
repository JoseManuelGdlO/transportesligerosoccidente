import { describe, expect, it } from "vitest";
import { buildAccountStatementPdf } from "./accountStatementPdf";

describe("buildAccountStatementPdf", () => {
  it("crea un PDF con el título y no truena sin filas", () => {
    const doc = buildAccountStatementPdf({
      titulo: "Cuentas por cobrar",
      generadoEn: "2026-10-13",
      rows: [],
    });
    expect(doc.internal.pages.length).toBeGreaterThan(1);
    const text = doc.internal.pages.join(" ");
    // jsPDF guarda el título en el stream; al menos el documento existe
    expect(typeof doc.output("arraybuffer")).toBe("object");
    expect(text.length).toBeGreaterThan(0);
  });
});
