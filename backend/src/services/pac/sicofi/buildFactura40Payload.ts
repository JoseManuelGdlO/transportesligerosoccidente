import type { CartaPorte, Trip } from "../../../models";
import { num } from "../../../utils/numbers";
import type { TimbradoContext } from "../types";
import type { Factura40PayloadBody } from "./types";
import { mapCartaPorte31 } from "./mapCartaPorte31";
import { mapConceptos } from "./mapConceptos";
import type { InvoiceTaxOpts } from "./invoiceTaxes";

function taxOptsFromContext(ctx: TimbradoContext): InvoiceTaxOpts {
  const o = ctx.opts ?? {};
  return {
    ivaTasa: o.ivaTasa ?? (ctx.tenant.iva_tasa_default != null ? num(ctx.tenant.iva_tasa_default) : undefined),
    retencionTasa:
      o.retencionTasa ??
      (ctx.tenant.retencion_tasa_default != null ? num(ctx.tenant.retencion_tasa_default) : undefined),
    exento: o.exento,
  };
}

function folioNumber(cartaPorte: CartaPorte, trip: Trip): number | string {
  if (cartaPorte.folio_cfdi) {
    const n = Number(cartaPorte.folio_cfdi);
    return Number.isFinite(n) ? n : cartaPorte.folio_cfdi;
  }
  return 0;
}

/** Construye bloques Factura40 (sin Usuario/Contrasena). */
export function buildFactura40Payload(ctx: TimbradoContext): Factura40PayloadBody {
  const { tipo, trip, tenant, cartaPorte, ubicaciones, mercancias, truck, driver, client } = ctx;
  const opts = ctx.opts ?? {};
  const taxOpts = taxOptsFromContext(ctx);
  const conceptBlock = mapConceptos(trip, truck, tipo, taxOpts);
  const isTraslado = tipo === "traslado";

  const moneda = isTraslado ? "XXX" : (opts.moneda ?? conceptBlock.moneda);
  const tipoCambio =
    !isTraslado && moneda !== "MXN" ? (opts.tipoCambio ?? conceptBlock.tipoCambio ?? null) : null;

  return {
    DatosCFDI40: {
      Serie: tenant.cfdi_serie || "A",
      Folio: folioNumber(cartaPorte, trip),
      Fecha: "0001-01-01T00:00:00",
      FormadePago: opts.formaPago ?? tenant.forma_pago_default ?? "99",
      CondicionesDePago: opts.condicionesPago ?? tenant.condiciones_pago_default ?? null,
      Subtotal: conceptBlock.subtotal,
      Descuento: 0,
      Moneda: moneda,
      TipoCambio: tipoCambio,
      Total: conceptBlock.total,
      TipodeComprobante: isTraslado ? "T" : "FA",
      MetodoPago: isTraslado ? "PUE" : (opts.metodoPago ?? tenant.metodo_pago_default ?? "PPD"),
      LugarDeExpedicion: tenant.cp_fiscal || "00000",
      Exportacion: "01",
      DatosAdicionales: null,
      MensajePDF: "",
      EmailMensaje: null,
      Transaccion: trip.folio || trip.id,
      complementos: null,
    },
    CFDIRelacion40: [],
    InformacionGlobal: null,
    ReceptorCFDI40: {
      RFC: client.rfc,
      RazonSocial: client.razon_social,
      ResidenciaFiscal: null,
      NumRegIdTrib: null,
      UsoCfdi: isTraslado ? "S01" : (opts.usoCfdi ?? tenant.uso_cfdi_default ?? "G03"),
      DomicilioFiscalReceptor: client.cp || "00000",
      RegimenFiscalReceptor: client.regimen_fiscal || "601",
      NoCliente: null,
      Email: client.email ?? null,
      Calle: null,
      NumExt: null,
      NumInt: null,
      Colonia: null,
      Estado: null,
      Localidad: null,
      Municipio: null,
      CP: null,
      Pais: null,
      ContactoP: null,
      Telefono: null,
      Telefono2: null,
      Contacto1: null,
      Contacto2: null,
    },
    ConceptosCFDI40: { Conceptos: conceptBlock.conceptos },
    CartaPorte20: null,
    CartaPorte30: null,
    CartaPorte31: mapCartaPorte31(trip, cartaPorte, ubicaciones, mercancias, truck, driver, client),
    Addenda: null,
  };
}
