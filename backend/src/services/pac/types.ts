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

export type TipoComprobanteTimbrado = "ingreso" | "traslado";

export interface TimbradoResult {
  uuid: string;
  xmlTimbrado: string;
  fechaTimbrado: string;
  serie?: string;
  folio?: string;
  cadenaOriginal?: string;
  pacResponse?: string;
}

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
}

export interface PacProvider {
  readonly name: string;
  timbrar(ctx: TimbradoContext): Promise<TimbradoResult>;
  cancelar(uuid: string, motivo: string, rfc: string): Promise<void>;
}
