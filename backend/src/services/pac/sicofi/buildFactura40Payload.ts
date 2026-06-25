/**
 * Construcción del payload JSON para Sicofi Factura40.
 * @module pac/sicofi/buildFactura40Payload
 */
import type { CartaPorte, Trip } from "../../../models";
import { localDateTimeSatStr } from "../../../utils/localDates";
import { num } from "../../../utils/numbers";
import type { TimbradoContext } from "../types";
import type { Factura40PayloadBody } from "./types";
import { mapCartaPorte31 } from "./mapCartaPorte31";
import { mapConceptos } from "./mapConceptos";
import type { InvoiceTaxOpts } from "./invoiceTaxes";
import {
  PUBLICO_GENERAL_NOMBRE,
  PUBLICO_GENERAL_REGIMEN,
  buildInformacionGlobal,
  isPublicoGeneralReceptor,
} from "./publicoGeneral";

/** Resuelve tasas de IVA/retención desde opts del request o defaults del tenant. */
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

/** Folio inicial cuando aún no hay `folio_cfdi` timbrado (Sicofi no auto-asigna con 0). */
const DEFAULT_SICOFI_FOLIO = 1;

/**
 * Folio para Sicofi. Usa `cartaPorte.folio_cfdi` si ya existe y es > 0.
 */
function folioNumber(cartaPorte: CartaPorte, _trip: Trip): number | string {
  if (cartaPorte.folio_cfdi != null && cartaPorte.folio_cfdi !== "") {
    const n = Number(cartaPorte.folio_cfdi);
    if (Number.isFinite(n)) return n > 0 ? n : DEFAULT_SICOFI_FOLIO;
    return cartaPorte.folio_cfdi;
  }
  return DEFAULT_SICOFI_FOLIO;
}

/**
 * Construye el JSON Factura40 (sin `Usuario`/`Contrasena`) a partir del contexto del viaje.
 *
 * Orquesta `mapConceptos`, `mapCartaPorte31` y reglas de receptor:
 * - Traslado: receptor = datos del tenant (mismo RFC que CSD en Sicofi).
 * - Ingreso: receptor = cliente; público en general solo sin Carta Porte.
 *
 * @param ctx - Contexto completo de timbrado.
 * @returns Cuerpo listo para extender con credenciales en `SicofiPacProvider`.
 */
export function buildFactura40Payload(ctx: TimbradoContext): Factura40PayloadBody {
  const { tipo, trip, tenant, cartaPorte, ubicaciones, mercancias, truck, driver, client } = ctx;
  const opts = ctx.opts ?? {};
  const taxOpts = taxOptsFromContext(ctx);
  const conceptBlock = mapConceptos(trip, truck, tipo, taxOpts);
  const isTraslado = tipo === "traslado";
  const publicoGeneral = isPublicoGeneralReceptor(client);
  const lugarExpedicion = tenant.cp_fiscal || "00000";

  const moneda = isTraslado ? "XXX" : (opts.moneda ?? conceptBlock.moneda);
  const serie = isTraslado ? (tenant.cfdi_serie || "CP") : "A";
  const hasCartaPorte = mercancias.length > 0 || ubicaciones.length > 0;

  const datosCfdi: Factura40PayloadBody["DatosCFDI40"] = {
    Serie: serie,
    Folio: folioNumber(cartaPorte, trip),
    Fecha: localDateTimeSatStr(),
    CondicionesDePago: isTraslado
      ? null
      : (opts.condicionesPago ?? tenant.condiciones_pago_default ?? null),
    Subtotal: conceptBlock.subtotal,
    Descuento: 0,
    Moneda: moneda,
    Total: conceptBlock.total,
    TipodeComprobante: isTraslado ? "T" : "FA",
    LugarDeExpedicion: lugarExpedicion,
    Exportacion: "01",
    DatosAdicionales: null,
    MensajePDF: "",
    EmailMensaje: null,
    Transaccion: trip.folio || trip.id,
    complementos: null,
  };

  if (!isTraslado) {
    datosCfdi.FormadePago = opts.formaPago ?? tenant.forma_pago_default ?? "99";
    datosCfdi.MetodoPago = opts.metodoPago ?? tenant.metodo_pago_default ?? "PPD";
  }

  // SAT: TipoCambio solo aplica si moneda ≠ MXN y ≠ XXX. Sicofi (.NET) rechaza null en el campo.
  if (moneda !== "MXN" && moneda !== "XXX") {
    const tipoCambio = opts.tipoCambio ?? conceptBlock.tipoCambio;
    if (tipoCambio != null && tipoCambio > 0) {
      datosCfdi.TipoCambio = tipoCambio;
    }
  }

  const usoCfdi = isTraslado
    ? "S01"
    : publicoGeneral
      ? "S01"
      : (opts.usoCfdi ?? tenant.uso_cfdi_default ?? "G03");

  const receptorRfc = isTraslado ? tenant.rfc! : client.rfc;
  const receptorNombre = isTraslado
    ? tenant.razon_social!
    : publicoGeneral
      ? PUBLICO_GENERAL_NOMBRE
      : client.razon_social;
  const receptorCp = isTraslado || publicoGeneral ? lugarExpedicion : (client.cp || "00000");
  const receptorRegimen = isTraslado
    ? (tenant.regimen_fiscal || "601")
    : publicoGeneral
      ? PUBLICO_GENERAL_REGIMEN
      : (client.regimen_fiscal || "601");

  // Carta Porte + ingreso no admite InformacionGlobal (factura global es otro flujo).
  const informacionGlobal =
    !isTraslado && publicoGeneral && !hasCartaPorte ? buildInformacionGlobal() : null;

  return {
    DatosCFDI40: datosCfdi,
    CFDIRelacion40: [],
    InformacionGlobal: informacionGlobal,
    ReceptorCFDI40: {
      RFC: receptorRfc,
      RazonSocial: receptorNombre,
      ResidenciaFiscal: null,
      NumRegIdTrib: null,
      UsoCfdi: usoCfdi,
      DomicilioFiscalReceptor: receptorCp,
      RegimenFiscalReceptor: receptorRegimen,
      NoCliente: null,
      Email: isTraslado ? null : (client.email ?? null),
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
    CartaPorte31: mapCartaPorte31(
      trip,
      cartaPorte,
      ubicaciones,
      mercancias,
      truck,
      driver,
      client,
      ctx.satMaterialPeligrosoByClave,
    ),
    Addenda: null,
  };
}
