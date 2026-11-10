import { PDFDocument, StandardFonts } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { mergeDocumentsToPdf, normalizeMergeMime, safeDownloadName } from "./mergeDocumentsPdf";

const PNG = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  ),
);

async function tinyPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([200, 200]);
  page.drawText("LIC", { x: 20, y: 100, size: 12, font });
  const second = doc.addPage([200, 200]);
  second.drawText("P2", { x: 20, y: 100, size: 12, font });
  return doc.save();
}

describe("mergeDocumentsToPdf", () => {
  it("une un PDF de dos páginas y una imagen detrás de la portada", async () => {
    const bytes = await mergeDocumentsToPdf(
      [
        { title: "Licencia", detail: "No. 123", mime: "application/pdf", bytes: await tinyPdf() },
        { title: "INE", detail: "", mime: "image/png", bytes: PNG },
      ],
      "Operador Juan Perez",
    );
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(4);
  });

  it("rechaza una lista vacía", async () => {
    await expect(mergeDocumentsToPdf([], "Unidad 12")).rejects.toThrow(/No hay archivos/);
  });

  it("avisa cuando el PDF no se puede leer", async () => {
    const garbage = Uint8Array.from([1, 2, 3, 4]);
    await expect(
      mergeDocumentsToPdf(
        [{ title: "Póliza", detail: "", mime: "application/pdf", bytes: garbage }],
        "Unidad 4",
      ),
    ).rejects.toThrow(/Póliza/);
  });
});

describe("normalizeMergeMime", () => {
  it("acepta jpg, png, webp y pdf, y usa la extensión si el mime no sirve", () => {
    expect(normalizeMergeMime("image/jpg; charset=binary", null)).toBe("image/jpeg");
    expect(normalizeMergeMime("image/png", "foto.png")).toBe("image/png");
    expect(normalizeMergeMime("image/webp", null)).toBe("image/webp");
    expect(normalizeMergeMime("application/octet-stream", "poliza.PDF")).toBe("application/pdf");
    expect(normalizeMergeMime("text/plain", "nota.txt")).toBeNull();
  });
});

describe("safeDownloadName", () => {
  it("quita acentos y caracteres que rompen el nombre de archivo", () => {
    expect(safeDownloadName("Juan Pérez / 12", "operador")).toBe("Juan-Perez-12");
    expect(safeDownloadName("   ", "unidad")).toBe("unidad");
  });
});
