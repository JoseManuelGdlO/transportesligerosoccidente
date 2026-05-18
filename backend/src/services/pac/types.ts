export interface TimbradoResult {
  uuid: string;
  xmlTimbrado: string;
  fechaTimbrado: string;
  cadenaOriginal?: string;
  pacResponse?: string;
}

export interface PacProvider {
  readonly name: string;
  timbrarCartaPorte(xml: string): Promise<TimbradoResult>;
  cancelar(uuid: string, motivo: string, rfc: string): Promise<void>;
}
