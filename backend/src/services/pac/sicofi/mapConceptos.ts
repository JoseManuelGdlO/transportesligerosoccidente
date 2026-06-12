import type { Trip, Truck } from "../../../models";
import type { TipoComprobanteTimbrado } from "../types";
import type { ConceptoCFDI40 } from "./types";
import { computeTripInvoiceTaxes } from "./invoiceTaxes";
import type { InvoiceTaxOpts } from "./invoiceTaxes";

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

  const tarifa = Number(trip.tarifa) || 0;
  const taxes = computeTripInvoiceTaxes(tarifa, taxOpts);
  const equipo = truck.numero_economico || truck.placas;
  const descripcion = `Flete de ${trip.origen} - ${trip.destino} Ref: ${trip.folio} Equipo: ${equipo}`;

  const concepto: ConceptoCFDI40 = {
    ClaveProdServ: "78101801",
    NoIdentificacion: trip.folio?.replace(/[^A-Za-z0-9]/g, "").slice(0, 20) || null,
    Cantidad: 1,
    ClaveUnidad: "E48",
    Unidad: "Unidad de servicio",
    Descripcion: descripcion,
    ValorUnitario: taxes.subtotal,
    Importe: taxes.subtotal,
    Descuento: 0,
    ObjetoImp: "02",
    DatosAdicionales: null,
    Traslados: taxes.traslados.length ? taxes.traslados : undefined,
    Retenciones: taxes.retenciones.length ? taxes.retenciones : undefined,
  };

  return {
    conceptos: [concepto],
    subtotal: taxes.subtotal,
    total: taxes.total,
    moneda: "MXN",
  };
}
