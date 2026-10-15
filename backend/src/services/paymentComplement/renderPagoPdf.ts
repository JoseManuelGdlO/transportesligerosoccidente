import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { uploadRootDir } from "../../middlewares/uploadDocument";

export async function renderPagoPdf(): Promise<Buffer> {
  return Buffer.from("%PDF-1.1\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF");
}

export async function writePagoPdf(pagoId: string, tenantId: string, pdf: Buffer): Promise<string> {
  const rel = `${tenantId}/complementos-pago/${pagoId}.pdf`;
  const abs = path.join(uploadRootDir(), ...rel.split("/"));
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, pdf);
  return rel;
}
