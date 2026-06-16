import type { Client } from "../../../models";
import type { InformacionGlobalCFDI40 } from "./types";

/** RFC genérico SAT para público en general. */
export const PUBLICO_GENERAL_RFC = "XAXX010101000";

/** Razón social estándar para receptor público en general. */
export const PUBLICO_GENERAL_NOMBRE = "PUBLICO EN GENERAL";

/** Régimen fiscal 616 — sin obligaciones fiscales (público en general). */
export const PUBLICO_GENERAL_REGIMEN = "616";

/**
 * Indica si el cliente usa el RFC de público en general.
 * No válido para ingreso con Carta Porte (validado en `validateSicofiFactura40`).
 */
export function isPublicoGeneralReceptor(client: Pick<Client, "rfc">): boolean {
  return client.rfc?.trim().toUpperCase() === PUBLICO_GENERAL_RFC;
}

/**
 * Construye el nodo `InformacionGlobal` para factura global mensual.
 * Sicofi exige `Año` como string. Solo aplica a ingreso sin Carta Porte.
 *
 * @param date - Fecha de referencia para mes y año (default: hoy).
 */
export function buildInformacionGlobal(date = new Date()): InformacionGlobalCFDI40 {
  return {
    Periodicidad: "04",
    Meses: String(date.getMonth() + 1).padStart(2, "0"),
    Año: String(date.getFullYear()),
  };
}
