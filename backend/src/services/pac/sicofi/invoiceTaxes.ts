import type { ImpuestoLinea } from "./types";

/** Tasas opcionales para el cálculo de impuestos de factura de ingreso. */
export interface InvoiceTaxOpts {
  /** Tasa de IVA (default 0.16). */
  ivaTasa?: number;
  /** Tasa de retención ISR/IVA transporte (default 0.04). */
  retencionTasa?: number;
  /** Si true, no se calculan traslados ni retenciones. */
  exento?: boolean;
}

/** Desglose de impuestos y totales para un concepto de flete. */
export interface InvoiceTaxResult {
  subtotal: number;
  iva: number;
  retencion: number;
  total: number;
  traslados: ImpuestoLinea[];
  retenciones: ImpuestoLinea[];
}

/** Redondeo a 2 decimales para montos fiscales. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Calcula IVA (impuesto 002) y retención para la tarifa de un viaje de ingreso.
 *
 * Fórmula: `total = subtotal + iva − retención`.
 * Defaults: IVA 16%, retención 4%.
 *
 * @param tarifa - Monto base del flete (subtotal).
 * @param opts - Tasas y flag de exento.
 * @returns Líneas de traslado/retención listas para `ConceptoCFDI40`.
 */
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
