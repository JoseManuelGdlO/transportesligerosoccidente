import type { Client } from "../../../models";
import type { InformacionGlobalCFDI40 } from "./types";

export const PUBLICO_GENERAL_RFC = "XAXX010101000";
export const PUBLICO_GENERAL_NOMBRE = "PUBLICO EN GENERAL";
export const PUBLICO_GENERAL_REGIMEN = "616";

export function isPublicoGeneralReceptor(client: Pick<Client, "rfc">): boolean {
  return client.rfc?.trim().toUpperCase() === PUBLICO_GENERAL_RFC;
}

/** Información global del periodo (mensual por defecto). Sicofi exige Año como string. */
export function buildInformacionGlobal(date = new Date()): InformacionGlobalCFDI40 {
  return {
    Periodicidad: "04",
    Meses: String(date.getMonth() + 1).padStart(2, "0"),
    Año: String(date.getFullYear()),
  };
}
