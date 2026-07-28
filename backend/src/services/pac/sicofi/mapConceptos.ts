import type { Trip, Truck } from "../../../models";
import type { TipoComprobanteTimbrado } from "../types";
import type { ConceptoCFDI40 } from "./types";
import { computeTripInvoiceTaxes } from "./invoiceTaxes";
import type { InvoiceTaxOpts } from "./invoiceTaxes";
import { tripRouteLabelFromModel } from "../../tripRouteLabel";
import type { TripCfdiConcepto } from "../../../types/tripCfdiConcepto";
import {
  DEFAULT_CFDI_CLAVE_PROD_SERV,
  DEFAULT_CFDI_CLAVE_UNIDAD,
  DEFAULT_CFDI_UNIDAD,
} from "../../../types/tripCfdiConcepto";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function lineImporte(c: TripCfdiConcepto): number {
  return round2(Number(c.valor_unitario) * Number(c.cantidad || 1));
}

function mapStoredConcepto(
  line: TripCfdiConcepto,
  trip: Trip,
  taxOpts: InvoiceTaxOpts,
): ConceptoCFDI40 {
  const importe = lineImporte(line);
  const taxes = computeTripInvoiceTaxes(importe, taxOpts);
  const objetoImp = line.objeto_imp === "01" ? "01" : "02";
  return {
    ClaveProdServ: line.clave_prod_serv || DEFAULT_CFDI_CLAVE_PROD_SERV,
    NoIdentificacion: trip.folio?.replace(/[^A-Za-z0-9]/g, "").slice(0, 20) || null,
    Cantidad: Number(line.cantidad) || 1,
    ClaveUnidad: line.clave_unidad || DEFAULT_CFDI_CLAVE_UNIDAD,
    Unidad: line.unidad || DEFAULT_CFDI_UNIDAD,
    Descripcion: line.descripcion,
    ValorUnitario: round2(Number(line.valor_unitario) || 0),
    Importe: taxes.subtotal,
    Descuento: 0,
    ObjetoImp: objetoImp,
    DatosAdicionales: null,
    Traslados: objetoImp === "02" && taxes.traslados.length ? taxes.traslados : undefined,
    Retenciones: objetoImp === "02" && taxes.retenciones.length ? taxes.retenciones : undefined,
  };
}

function fallbackIngresoConcepto(
  trip: Trip,
  truck: Truck,
  taxOpts: InvoiceTaxOpts,
): ConceptoCFDI40 {
  const tarifa = Number(trip.tarifa) || 0;
  const taxes = computeTripInvoiceTaxes(tarifa, taxOpts);
  const equipo = truck.numero_economico || truck.placas;
  const ruta = tripRouteLabelFromModel(trip);
  const descripcion = `Flete de ${ruta} Ref: ${trip.folio} Equipo: ${equipo}`;
  return {
    ClaveProdServ: DEFAULT_CFDI_CLAVE_PROD_SERV,
    NoIdentificacion: trip.folio?.replace(/[^A-Za-z0-9]/g, "").slice(0, 20) || null,
    Cantidad: 1,
    ClaveUnidad: DEFAULT_CFDI_CLAVE_UNIDAD,
    Unidad: DEFAULT_CFDI_UNIDAD,
    Descripcion: descripcion,
    ValorUnitario: taxes.subtotal,
    Importe: taxes.subtotal,
    Descuento: 0,
    ObjetoImp: "02",
    DatosAdicionales: null,
    Traslados: taxes.traslados.length ? taxes.traslados : undefined,
    Retenciones: taxes.retenciones.length ? taxes.retenciones : undefined,
  };
}

/**
 * Mapea los conceptos CFDI 4.0 según el tipo de comprobante.
 *
 * - **Traslado**: un concepto de transporte en $0, moneda `XXX`, sin impuestos (`ObjetoImp: 01`).
 * - **Ingreso**: N conceptos desde `trip.cfdi_conceptos` (o 1 fallback desde `tarifa`),
 *   clave default `78101802` / unidad `E54`, IVA y retención vía `computeTripInvoiceTaxes`.
 *
 * @returns Conceptos, subtotal, total y moneda para `DatosCFDI40`.
 */
export function mapConceptos(
  trip: Trip,
  truck: Truck,
  tipo: TipoComprobanteTimbrado,
  taxOpts: InvoiceTaxOpts,
): { conceptos: ConceptoCFDI40[]; subtotal: number; total: number; moneda: string; tipoCambio?: number } {
  if (tipo === "traslado") {
    return {
      conceptos: [
        {
          ClaveProdServ: "78101800",
          Cantidad: 1,
          ClaveUnidad: "E48",
          Unidad: "Unidad de servicio",
          Descripcion: "Transporte de carga",
          ValorUnitario: 0,
          Importe: 0,
          Descuento: 0,
          ObjetoImp: "01",
          DatosAdicionales: null,
        },
      ],
      subtotal: 0,
      total: 0,
      moneda: "XXX",
    };
  }

  const stored = Array.isArray(trip.cfdi_conceptos) ? trip.cfdi_conceptos : [];
  const conceptos: ConceptoCFDI40[] =
    stored.length > 0
      ? stored.map((line) => mapStoredConcepto(line, trip, taxOpts))
      : [fallbackIngresoConcepto(trip, truck, taxOpts)];

  let subtotal = 0;
  let total = 0;
  for (const c of conceptos) {
    const base = Number(c.Importe) || 0;
    subtotal = round2(subtotal + base);
    const iva = (c.Traslados ?? []).reduce((s, t) => s + (Number(t.Importe) || 0), 0);
    const ret = (c.Retenciones ?? []).reduce((s, t) => s + (Number(t.Importe) || 0), 0);
    total = round2(total + base + iva - ret);
  }

  return {
    conceptos,
    subtotal,
    total,
    moneda: "MXN",
  };
}
