import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import PDFDocument from "pdfkit";
import { uploadRootDir } from "../../middlewares/uploadDocument";
import type { TaxComponent } from "./taxComponent";

export interface RenderPagoPdfLinea {
  serie: string;
  folio: string;
  uuid: string;
  numParcialidad: number;
  impSaldoAnt: number;
  impPagado: number;
  impSaldoInsoluto: number;
  taxes: TaxComponent[];
}

export interface RenderPagoPdfInput {
  serie: string;
  folio: string;
  uuid: string;
  fechaPago: string;
  formaPagoP: string;
  monedaP: string;
  monto: number;
  receptorNombre: string;
  receptorRfc: string;
  lineas: RenderPagoPdfLinea[];
}

function money(n: number): string {
  return n.toFixed(2);
}

function sumIva(taxes: TaxComponent[]): number {
  return taxes
    .filter((tax) => tax.tipo === "traslado" && tax.impuesto === "002")
    .reduce((sum, tax) => sum + tax.importe, 0);
}

function sumRetencion(taxes: TaxComponent[]): number {
  return taxes.filter((tax) => tax.tipo === "retencion").reduce((sum, tax) => sum + tax.importe, 0);
}

export async function renderPagoPdf(input: RenderPagoPdfInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "LETTER", margin: 48 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(16).text("Complemento de pago", { align: "center" });
    doc.moveDown();
    doc.fontSize(10);
    doc.text(`Serie-folio: ${input.serie}-${input.folio}`);
    doc.text(`UUID: ${input.uuid}`);
    doc.text(`Receptor: ${input.receptorNombre}  RFC: ${input.receptorRfc}`);
    doc.text(`Fecha de pago: ${input.fechaPago}`);
    doc.text(`Forma de pago: ${input.formaPagoP}`);
    doc.text(`Moneda: ${input.monedaP}`);
    doc.text(`Monto: ${money(input.monto)}`);
    doc.moveDown();

    const cols = [
      { label: "Serie", width: 40 },
      { label: "Folio", width: 40 },
      { label: "UUID", width: 150 },
      { label: "Parc.", width: 36 },
      { label: "Saldo ant.", width: 62 },
      { label: "Pagado", width: 54 },
      { label: "Insoluto", width: 54 },
      { label: "IVA", width: 44 },
      { label: "Retención", width: 58 },
    ];
    const startX = doc.x;
    let x = startX;
    const headerY = doc.y;
    doc.fontSize(8);
    for (const col of cols) {
      doc.text(col.label, x, headerY, { width: col.width });
      x += col.width;
    }
    doc.moveTo(startX, headerY + 14).lineTo(startX + cols.reduce((s, c) => s + c.width, 0), headerY + 14).stroke();
    doc.y = headerY + 18;

    for (const linea of input.lineas) {
      const rowY = doc.y;
      const values = [
        linea.serie,
        linea.folio,
        linea.uuid,
        String(linea.numParcialidad),
        money(linea.impSaldoAnt),
        money(linea.impPagado),
        money(linea.impSaldoInsoluto),
        money(sumIva(linea.taxes)),
        money(sumRetencion(linea.taxes)),
      ];
      x = startX;
      let rowHeight = 12;
      for (let i = 0; i < cols.length; i++) {
        const h = doc.heightOfString(values[i], { width: cols[i].width });
        if (h > rowHeight) rowHeight = h;
        doc.text(values[i], x, rowY, { width: cols[i].width });
        x += cols[i].width;
      }
      doc.y = rowY + rowHeight + 4;
    }

    doc.end();
  });
}

export async function writePagoPdf(pagoId: string, tenantId: string, pdf: Buffer): Promise<string> {
  const rel = `${tenantId}/complementos-pago/${pagoId}.pdf`;
  const abs = path.join(uploadRootDir(), ...rel.split("/"));
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, pdf);
  return rel;
}
