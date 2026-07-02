import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { renderCfdiPdfFromXml } from "../src/services/cfdiPdf/renderCfdiPdf";

const DEFAULT_XML = path.join(process.cwd(), "tmp/folio-3856.sample.xml");

async function main() {
  const xmlPath = process.argv[2] || DEFAULT_XML;
  const outPath = process.argv[3] || path.join(process.cwd(), "tmp-cfdi-preview.pdf");
  const xml = readFileSync(xmlPath, "utf8");

  const tenant = {
    razon_social: "TRANSPORTES LIGEROS DE OCCIDENTE",
    rfc: "TNU150126V30",
    regimen_fiscal: "624",
    cp_fiscal: "45640",
    calle_fiscal: "PINO",
    colonia_fiscal: "LOS SAUCES",
    municipio_fiscal: "TLAJOMULCO DE ZUÑIGA",
    estado_fiscal: "JALISCO",
    pdf_trip_logo_path: "e0000000-0000-4000-8000-000000000001/pdf-branding/logo-1883ad5d-8388-4d1a-b042-3c7ae861796b.jpg",
  };
  const pdf = await renderCfdiPdfFromXml(xml, tenant as never);
  writeFileSync(outPath, pdf);
  console.log("Wrote", outPath, pdf.length, "bytes", "from", xmlPath);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
