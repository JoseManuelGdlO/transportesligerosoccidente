/**
 * Tipos del JSON de request/response para Sicofi Factura40 (CFDI 4.0).
 * Nombres de propiedades respetan el contrato de la API Sicofi (PascalCase).
 */

/** Línea de traslado o retención en un concepto CFDI. */
export interface ImpuestoLinea {
  Base: number;
  Impuesto: string;
  TipoFactor: string;
  TasaOCuota: number;
  Importe: number;
}

/** Concepto individual del bloque `ConceptosCFDI40`. */
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

/** Encabezado fiscal del comprobante (`DatosCFDI40`). */
export interface DatosCFDI40 {
  Serie: string;
  Folio: number | string;
  Fecha: string;
  /** Omitir en comprobante tipo T (traslado). */
  FormadePago?: string;
  CondicionesDePago?: string | null;
  Subtotal: number;
  Descuento: number;
  Moneda: string;
  TipoCambio?: number | null;
  Total: number;
  TipodeComprobante: string;
  /** Omitir en comprobante tipo T (traslado). */
  MetodoPago?: string;
  LugarDeExpedicion: string;
  Exportacion: string;
  DatosAdicionales?: null;
  MensajePDF?: string;
  EmailMensaje?: null;
  Transaccion: string;
  complementos?: null;
}

/** Nodo de factura global — público en general (`InformacionGlobal`). Sicofi usa `Año` como string. */
export interface InformacionGlobalCFDI40 {
  Periodicidad: string;
  Meses: string;
  Año: string;
}

/** Datos fiscales del receptor (`ReceptorCFDI40`). */
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

/**
 * Cuerpo del JSON Factura40 sin credenciales.
 * `CartaPorte31` contiene el complemento Carta Porte 3.1; versiones 2.0/3.0 van en null.
 */
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

/** Request completo a Sicofi: payload + `Usuario`, `Contrasena` y `EmisorCFDI40: null`. */
export interface SicofiFactura40Request extends Factura40PayloadBody {
  Usuario: string;
  Contrasena: string;
  EmisorCFDI40: null;
}
