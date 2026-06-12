export interface ImpuestoLinea {
  Base: number;
  Impuesto: string;
  TipoFactor: string;
  TasaOCuota: number;
  Importe: number;
}

export interface ConceptoCFDI40 {
  ClaveProdServ: string;
  NoIdentificacion?: string | null;
  Cantidad: number;
  ClaveUnidad: string;
  Unidad: string;
  Descripcion: string;
  ValorUnitario: number;
  Importe: number;
  Descuento: number;
  ObjetoImp: string;
  DatosAdicionales?: null;
  Traslados?: ImpuestoLinea[];
  Retenciones?: ImpuestoLinea[];
  InformacionAduana?: null;
  ACuentaTerceros?: null;
  Predial?: null;
  Parte?: null;
  ComplementosConceptos?: null;
}

export interface DatosCFDI40 {
  Serie: string;
  Folio: number | string;
  Fecha: string;
  FormadePago: string;
  CondicionesDePago?: string | null;
  Subtotal: number;
  Descuento: number;
  Moneda: string;
  TipoCambio?: number | null;
  Total: number;
  TipodeComprobante: string;
  MetodoPago: string;
  LugarDeExpedicion: string;
  Exportacion: string;
  DatosAdicionales?: null;
  MensajePDF?: string;
  EmailMensaje?: null;
  Transaccion: string;
  complementos?: null;
}

/** CFDI global — público en general (XAXX010101000). Sicofi usa Año (string). */
export interface InformacionGlobalCFDI40 {
  Periodicidad: string;
  Meses: string;
  Año: string;
}

export interface ReceptorCFDI40 {
  RFC: string;
  RazonSocial: string;
  ResidenciaFiscal?: null;
  NumRegIdTrib?: null;
  UsoCfdi: string;
  DomicilioFiscalReceptor: string;
  RegimenFiscalReceptor: string;
  NoCliente?: null;
  Email?: string | null;
  Calle?: null;
  NumExt?: null;
  NumInt?: null;
  Colonia?: null;
  Estado?: null;
  Localidad?: null;
  Municipio?: null;
  CP?: null;
  Pais?: null;
  ContactoP?: null;
  Telefono?: null;
  Telefono2?: null;
  Contacto1?: null;
  Contacto2?: null;
}

export interface Factura40PayloadBody {
  DatosCFDI40: DatosCFDI40;
  CFDIRelacion40: unknown[];
  InformacionGlobal: InformacionGlobalCFDI40 | null;
  ReceptorCFDI40: ReceptorCFDI40;
  ConceptosCFDI40: { Conceptos: ConceptoCFDI40[] };
  CartaPorte20: null;
  CartaPorte30: null;
  CartaPorte31: Record<string, unknown> | null;
  Addenda: null;
}

export interface SicofiFactura40Request extends Factura40PayloadBody {
  Usuario: string;
  Contrasena: string;
  EmisorCFDI40: null;
}
