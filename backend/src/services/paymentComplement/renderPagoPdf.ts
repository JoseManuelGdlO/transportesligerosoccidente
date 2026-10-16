import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { uploadRootDir } from "../../middlewares/uploadDocument";
import type { Tenant } from "../../models";
import { renderCfdiPdfFromXml } from "../cfdiPdf";

/** Representación impresa del complemento, con la misma hoja fiscal que Sicofi. */
export async function renderPagoPdf(xml: string, tenant?: Tenant | null): Promise<Buffer> {
  return renderCfdiPdfFromXml(xml, tenant);
}

export async function writePagoPdf(pagoId: string, tenantId: string, pdf: Buffer): Promise<string> {
  const rel = `${tenantId}/complementos-pago/${pagoId}.pdf`;
  const abs = path.join(uploadRootDir(), ...rel.split("/"));
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, pdf);
  return rel;
}
