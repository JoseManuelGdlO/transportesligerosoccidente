#!/usr/bin/env tsx
/**
 * CLI spike Sicofi Factura40.
 * Uso: npx tsx scripts/sicofi-spike.ts --tipo ingreso|traslado [--usuario X] [--contrasena Y]
 */
import "dotenv/config";
import path from "node:path";
import { sicofiPostFactura40 } from "../src/services/pac/sicofi/sicofiClient";
import { resolveSicofiBaseUrl } from "../src/services/pac/sicofi/config";
import type { SicofiFactura40Request } from "../src/services/pac/sicofi/types";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const tipo = (arg("--tipo") || "traslado") as "ingreso" | "traslado";
const usuario = arg("--usuario") || process.env.SICOFI_USUARIO || "";
const contrasena = arg("--contrasena") || process.env.SICOFI_CONTRASENA || "";

if (!usuario || !contrasena) {
  console.error("Requiere --usuario y --contrasena (o SICOFI_USUARIO / SICOFI_CONTRASENA en .env)");
  process.exit(1);
}

const base = resolveSicofiBaseUrl(null);
const url = `${base}/Comprobante40/Factura40`;

const sampleIngreso: Omit<SicofiFactura40Request, "Usuario" | "Contrasena"> = {
  EmisorCFDI40: null,
  DatosCFDI40: {
    Serie: "A",
    Folio: 0,
    Fecha: "0001-01-01T00:00:00",
    FormadePago: "99",
    CondicionesDePago: "CREDITO 30 DIAS",
    Subtotal: 250,
    Descuento: 0,
    Moneda: "MXN",
    Total: 280,
    TipodeComprobante: "FA",
    MetodoPago: "PPD",
    LugarDeExpedicion: "44100",
    Exportacion: "01",
    Transaccion: `spike-ingreso-${Date.now()}`,
  },
  CFDIRelacion40: [],
  InformacionGlobal: null,
  ReceptorCFDI40: {
    RFC: "XAXX010101000",
    RazonSocial: "PUBLICO EN GENERAL",
    UsoCfdi: "G03",
    DomicilioFiscalReceptor: "44100",
    RegimenFiscalReceptor: "601",
  },
  ConceptosCFDI40: {
    Conceptos: [
      {
        ClaveProdServ: "78101801",
        Cantidad: 1,
        ClaveUnidad: "E48",
        Descripcion: "Flete spike ingreso",
        ValorUnitario: 250,
        Importe: 250,
        ObjetoImp: "02",
        Traslados: [{ Base: 250, Impuesto: "002", TipoFactor: "Tasa", TasaOCuota: 0.16, Importe: 40 }],
        Retenciones: [{ Base: 250, Impuesto: "002", TipoFactor: "Tasa", TasaOCuota: 0.04, Importe: 10 }],
      },
    ],
  },
  CartaPorte20: null,
  CartaPorte30: null,
  CartaPorte31: null,
  Addenda: null,
};

const sampleTraslado: Omit<SicofiFactura40Request, "Usuario" | "Contrasena"> = {
  EmisorCFDI40: null,
  DatosCFDI40: {
    Serie: "CP",
    Folio: 0,
    Fecha: "0001-01-01T00:00:00",
    FormadePago: "99",
    Subtotal: 0,
    Moneda: "XXX",
    Total: 0,
    TipodeComprobante: "T",
    MetodoPago: "PUE",
    LugarDeExpedicion: "44100",
    Exportacion: "01",
    Transaccion: `spike-traslado-${Date.now()}`,
  },
  CFDIRelacion40: [],
  InformacionGlobal: null,
  ReceptorCFDI40: {
    RFC: "XAXX010101000",
    RazonSocial: "PUBLICO EN GENERAL",
    UsoCfdi: "S01",
    DomicilioFiscalReceptor: "44100",
    RegimenFiscalReceptor: "601",
  },
  ConceptosCFDI40: {
    Conceptos: [
      {
        ClaveProdServ: "78101800",
        Cantidad: 1,
        ClaveUnidad: "E48",
        Descripcion: "Transporte de carga",
        ValorUnitario: 0,
        Importe: 0,
        ObjetoImp: "01",
      },
    ],
  },
  CartaPorte20: null,
  CartaPorte30: null,
  CartaPorte31: null,
  Addenda: null,
};

async function main() {
  const body = tipo === "ingreso" ? sampleIngreso : sampleTraslado;
  console.log(`POST ${url} tipo=${tipo}`);
  try {
    const result = await sicofiPostFactura40(url, {
      Usuario: usuario,
      Contrasena: contrasena,
      ...body,
    });
    console.log("UUID:", result.uuid);
    console.log("Serie:", result.serie, "Folio:", result.folio);
    console.log("XML length:", result.xmlTimbrado.length);
    const out = path.join(process.cwd(), `sicofi-spike-${tipo}.xml`);
    const { writeFileSync } = await import("node:fs");
    writeFileSync(out, result.xmlTimbrado, "utf8");
    console.log("Guardado:", out);
  } catch (e) {
    console.error("Error:", e instanceof Error ? e.message : e);
    process.exit(1);
  }
}

void main();
