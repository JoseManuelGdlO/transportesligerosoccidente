import type { ImpuestoLinea } from "./types";

export interface InvoiceTaxOpts {
  ivaTasa?: number;
  retencionTasa?: number;
  exento?: boolean;
}

export interface InvoiceTaxResult {
  subtotal: number;
  iva: number;
  retencion: number;
  total: number;
  traslados: ImpuestoLinea[];
  retenciones: ImpuestoLinea[];
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function computeTripInvoiceTaxes(tarifa: number, opts: InvoiceTaxOpts = {}): InvoiceTaxResult {
  const subtotal = round2(Math.max(0, tarifa));
  if (opts.exento || subtotal === 0) {
    return { subtotal, iva: 0, retencion: 0, total: subtotal, traslados: [], retenciones: [] };
  }
  const ivaTasa = opts.ivaTasa ?? 0.16;
  const retTasa = opts.retencionTasa ?? 0.04;
  const iva = round2(subtotal * ivaTasa);
  const retencion = round2(subtotal * retTasa);
  const total = round2(subtotal + iva - retencion);
  const traslados: ImpuestoLinea[] = [
    {
      Base: subtotal,
      Impuesto: "002",
      TipoFactor: "Tasa",
      TasaOCuota: ivaTasa,
      Importe: iva,
    },
  ];
  const retenciones: ImpuestoLinea[] = [
    {
      Base: subtotal,
      Impuesto: "002",
      TipoFactor: "Tasa",
      TasaOCuota: retTasa,
      Importe: retencion,
    },
  ];
  return { subtotal, iva, retencion, total, traslados, retenciones };
}
