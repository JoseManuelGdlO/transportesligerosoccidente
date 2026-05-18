export type FuelDownloadParams = {
  inicio: string;
  fin: string;
};

export type FuelProviderCredentials = {
  url: string;
  usuario?: string | null;
  password?: string | null;
  /** GET por defecto; POST envía JSON { inicio, fin }. */
  method?: "GET" | "POST";
};

export interface FuelReportProvider {
  /** Descarga el Excel/CSV del proveedor. Lanza Error si falla. */
  downloadReport(params: FuelDownloadParams): Promise<Buffer>;
}
