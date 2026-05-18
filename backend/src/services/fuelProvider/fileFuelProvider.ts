import { readFile } from "node:fs/promises";
import path from "node:path";
import type { FuelDownloadParams, FuelReportProvider } from "./types";

/**
 * Lee un archivo local (pruebas o respaldo manual).
 * FUEL_SYNC_FILE_PATH puede ser ruta fija o directorio con el archivo más reciente .xlsx/.xls/.csv
 */
export class FileFuelProvider implements FuelReportProvider {
  constructor(private readonly filePath: string) {}

  async downloadReport(_params: FuelDownloadParams): Promise<Buffer> {
    const p = this.filePath;
    const lower = p.toLowerCase();
    if (lower.endsWith(".xlsx") || lower.endsWith(".xls") || lower.endsWith(".csv")) {
      return readFile(p);
    }
    throw new Error(
      `FUEL_SYNC_FILE_PATH debe ser un archivo .xlsx/.xls/.csv (recibido: ${path.basename(p)})`,
    );
  }
}
