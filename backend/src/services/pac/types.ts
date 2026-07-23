import type {
  Trip,
  Tenant,
  CartaPorte,
  TripUbicacion,
  TripMercancia,
  Truck,
  Driver,
  Client,
} from "../../models";
import type { SatMaterialPeligroso } from "../../utils/cartaPorteSat";

/** Variante de comprobante a timbrar: factura de ingreso (`FA`) o traslado (`T`). */
export type TipoComprobanteTimbrado = "ingreso" | "traslado";

/** Resultado normalizado tras un timbrado exitoso en cualquier PAC. */
export interface TimbradoResult {
  /** UUID del TimbreFiscalDigital. */
  uuid: string;
  /** XML del CFDI timbrado completo. */
  xmlTimbrado: string;
  /** Fecha/hora de timbrado según el PAC (ISO o formato SAT). */
  fechaTimbrado: string;
  serie?: string;
  folio?: string;
  cadenaOriginal?: string;
  /** Respuesta cruda del PAC (truncada a 8000 chars en Sicofi). */
  pacResponse?: string;
}

/** Opciones fiscales que pueden sobreescribir los defaults del tenant en un timbrado. */
export interface TimbradoOpts {
  moneda?: string;
  tipoCambio?: number;
  usoCfdi?: string;
  metodoPago?: string;
  formaPago?: string;
  condicionesPago?: string;
  ivaTasa?: number;
  retencionTasa?: number;
  exento?: boolean;
}

/**
 * Contexto completo para construir el payload y timbrar un viaje.
 * Lo arma `cartaPorteService.buildTimbradoContext` antes de llamar al PAC.
 */
export interface TimbradoContext {
  tipo: TipoComprobanteTimbrado;
  trip: Trip;
  tenant: Tenant;
  cartaPorte: CartaPorte;
  ubicaciones: TripUbicacion[];
  mercancias: TripMercancia[];
  truck: Truck;
  driver: Driver;
  client: Client;
  opts?: TimbradoOpts;
  /** Columna Material Peligroso del catálogo c_ClaveProdServCP por clave de mercancía. */
  satMaterialPeligrosoByClave?: Record<string, SatMaterialPeligroso>;
}

/** Opciones adicionales para cancelación ante el PAC. */
export interface CancelarOpts {
  /** UUID/folio del CFDI que sustituye; si falta, Sicofi recibe `FolioSustitucion: ""`. */
  folioSustitucion?: string;
}

/**
 * Contrato que debe implementar cada proveedor PAC (stub, Sicofi, futuros).
 */
export interface PacProvider {
  readonly name: string;
  /** Ejecuta el timbrado ante el PAC y devuelve XML + metadatos. */
  timbrar(ctx: TimbradoContext): Promise<TimbradoResult>;
  /** Cancela un CFDI timbrado ante el PAC. */
  cancelar(uuid: string, motivo: string, tenant: Tenant, opts?: CancelarOpts): Promise<void>;
}
