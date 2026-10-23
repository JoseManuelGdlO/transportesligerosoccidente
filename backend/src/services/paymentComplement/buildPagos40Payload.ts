import type { DraftLine } from "./buildDraftLines";
import { aggregatePagoImpuestos } from "./proratePaymentTaxes";
import type { TaxComponent } from "./taxComponent";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function toDr(tax: TaxComponent) {
  return {
    BaseDR: tax.base,
    ImpuestoDR: tax.impuesto,
    TipoFactorDR: tax.tipoFactor,
    TasaOCuotaDR: tax.tasaOCuota,
    ImporteDR: tax.importe,
  };
}

function impuestosDr(linea: DraftLine) {
  if (linea.objetoImpDr === "01") return null;
  const retenciones = linea.taxes.filter((tax) => tax.tipo === "retencion");
  const traslados = linea.taxes.filter((tax) => tax.tipo === "traslado");
  return {
    RetencionesDR40: retenciones.length ? retenciones.map(toDr) : null,
    TrasladosDR40: traslados.map(toDr),
  };
}

function doctoRelacionado(linea: DraftLine) {
  return {
    IdDocumento: linea.uuid,
    Serie: linea.serie,
    Folio: linea.folio,
    MonedaDR: linea.monedaDr,
    EquivalenciaDR: 1,
    NumParcialidad: linea.numParcialidad,
    ImpSaldoAnt: linea.impSaldoAnt,
    ImpPagado: linea.impPagado,
    ImpSaldoInsoluto: linea.impSaldoInsoluto,
    ObjetoImpDR: linea.objetoImpDr,
    TotalTraslados: linea.totalTraslados,
    TotalRetenidos: linea.totalRetenidos,
    ImpuestosDR: impuestosDr(linea),
  };
}

export function buildPagos40Payload(input: {
  folio: number;
  fechaCfdi: string;
  lugarExpedicion: string;
  formaPagoP: string;
  fechaPago: string;
  monedaP: string;
  tipoCambioP: number;
  numOperacion: string;
  receptor: { rfc: string; razonSocial: string; domicilioFiscal: string; regimenFiscal: string };
  lineas: DraftLine[];
  email?: string | null;
  emailMensaje?: string | null;
}): Record<string, unknown> {
  const monto = round2(input.lineas.reduce((sum, linea) => sum + linea.impPagado, 0));
  const impuestos = aggregatePagoImpuestos(
    input.lineas.map((linea) => linea.taxes),
    input.tipoCambioP,
  );
  const email = input.email?.trim() || null;
  const emailMensaje = email ? input.emailMensaje?.trim() || null : null;

  return {
    DatosCFDI: {
      Folio: input.folio,
      Fecha: input.fechaCfdi,
      FormadePago: input.formaPagoP,
      CondicionesDePago: "",
      Subtotal: 0,
      Descuento: 0,
      Moneda: "XXX",
      TipoCambio: 0,
      Total: 0,
      TipodeComprobante: "P",
      MetodoPago: "PUE",
      LugarDeExpedicion: input.lugarExpedicion,
      Exportacion: "01",
      DatosAdicionales: null,
      MensajePDF: null,
      EmailMensaje: emailMensaje,
      complementos: null,
    },
    CFDIRelacion40: null,
    ReceptorCFDI: {
      RFC: input.receptor.rfc,
      RazonSocial: input.receptor.razonSocial,
      ResidenciaFiscal: null,
      NumRegIdTrib: null,
      UsoCfdi: "CP01",
      DomicilioFiscalReceptor: input.receptor.domicilioFiscal,
      RegimenFiscalReceptor: input.receptor.regimenFiscal,
      NoCliente: null,
      Email: email,
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
    ConceptosCFD: null,
    Pagos: {
      Totales: {
        MontoTotalPagos: round2(monto * input.tipoCambioP),
        ...impuestos.totales,
      },
      CFDIPagos40: [
        {
          FechaPago: input.fechaPago,
          FormaDePagoP: input.formaPagoP,
          MonedaP: input.monedaP,
          TipoCambioP: input.tipoCambioP,
          Monto: monto,
          NumOperacion: input.numOperacion,
          RfcEmisorCtaOrd: "",
          CtaOrdenante: "",
          TipoCadPago: "",
          CertPago: "",
          CadPago: "",
          SelloPago: "",
          NomBancoOrdExt: "",
          RfcEmisorCtaBen: "",
          CtaBeneficiario: "",
          FechaPagoManual: "",
          DoctoRelacionado: input.lineas.map(doctoRelacionado),
          Impuestos: {
            RetencionesP40: impuestos.retencionesP,
            TrasladosP40: impuestos.trasladosP,
          },
        },
      ],
    },
    Addenda: null,
  };
}
