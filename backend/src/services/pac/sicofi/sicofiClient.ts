import { parseSicofiResponse } from "./parseResponse";
import { sicofiTimeoutMs } from "./config";
import { enhanceSicofiErrorMessage } from "./sicofiErrors";
import type { SicofiFactura40Request } from "./types";
import type { TimbradoResult } from "../types";
import { logger } from "../../../utils/logger";

export { enhanceSicofiErrorMessage } from "./sicofiErrors";

/**
 * Error HTTP devuelto por Sicofi en Factura40.
 * El mensaje se enriquece con `enhanceSicofiErrorMessage`.
 */
export class SicofiHttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(enhanceSicofiErrorMessage(message));
    this.name = "SicofiHttpError";
    this.status = status;
  }
}

/**
 * Indica si el error es un 401 de Sicofi (token expirado o credenciales inválidas).
 * Usado para decidir reintento con token fresco.
 */
export function isSicofiHttp401(e: unknown): boolean {
  return e instanceof SicofiHttpError && e.status === 401;
}

/**
 * Envía el payload Factura40 a Sicofi y parsea la respuesta a `TimbradoResult`.
 *
 * @param url - URL completa de Factura40.
 * @param payload - JSON con credenciales y bloques CFDI.
 * @param accessToken - JWT Bearer obtenido en `sicofiAuth`.
 * @returns UUID, XML y metadatos del comprobante timbrado.
 * @throws `SicofiHttpError` si HTTP no OK; `Error` en timeout o parseo fallido.
 */
export async function sicofiPostFactura40(
  url: string,
  payload: SicofiFactura40Request,
  accessToken: string,
): Promise<TimbradoResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), sicofiTimeoutMs());
  try {
    const debugBody = { ...payload, Contrasena: "[redacted]" };
    logger.debug(`[Sicofi] Factura40 request body:\n${JSON.stringify(debugBody, null, 2)}`);
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, application/xml, text/xml",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const contentType = res.headers.get("content-type") ?? undefined;
    const body = await res.text();
    if (!res.ok) {
      let msg = `Sicofi respondió ${res.status}`;
      try {
        const j = JSON.parse(body) as Record<string, unknown>;
        if (typeof j.message === "string") msg = j.message;
        else if (typeof j.Mensaje === "string") msg = j.Mensaje;
        else if (typeof j.error === "string") msg = j.error;
        const errors = j.errors as Record<string, string[] | string> | undefined;
        if (errors && typeof errors === "object") {
          const parts = Object.entries(errors).flatMap(([k, v]) =>
            Array.isArray(v) ? v.map((e) => `${k}: ${e}`) : [`${k}: ${v}`],
          );
          if (parts.length) msg = `${msg} — ${parts.join("; ")}`;
        }
      } catch {
        if (body.trim()) msg = body.trim().slice(0, 500);
      }
      throw new SicofiHttpError(res.status, msg);
    }
    return parseSicofiResponse(body, contentType);
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new Error("Timeout al conectar con Sicofi");
    }
    throw e;
  } finally {
    clearTimeout(timeout);
  }
}
