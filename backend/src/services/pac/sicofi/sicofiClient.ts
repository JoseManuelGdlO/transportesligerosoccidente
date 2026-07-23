import { parseSicofiResponse } from "./parseResponse";
import { sicofiTimeoutMs } from "./config";
import { enhanceSicofiErrorMessage } from "./sicofiErrors";
import type {
  SicofiCancelaTimbradoRequest,
  SicofiCancelaTimbradoResponse,
  SicofiFactura40Request,
} from "./types";
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

function messageFromSicofiJsonBody(body: string, fallbackStatus: number): string {
  let msg = `Sicofi respondió ${fallbackStatus}`;
  try {
    const j = JSON.parse(body) as Record<string, unknown>;
    if (typeof j.message === "string") msg = j.message;
    else if (typeof j.Mensaje === "string") msg = j.Mensaje;
    else if (typeof j.ErrorCancelacion === "string") msg = j.ErrorCancelacion;
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
  return msg;
}

/**
 * Indica si la cancelación fue exitosa según `CancelacionCorrecta` (true/false string).
 */
export function isSicofiCancelacionCorrecta(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return false;
  return value.trim().toLowerCase() === "true";
}

function pickSicofiCancelField(
  res: Record<string, unknown>,
  ...keys: string[]
): string | null {
  for (const key of keys) {
    const v = res[key];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number" || typeof v === "boolean") return String(v);
  }
  return null;
}

/**
 * Arma mensaje de error a partir de la respuesta de cancelación Sicofi.
 * Incluye ErrorCancelacion, Mensaje, CodigoError, RespuestaSAT; si no hay detalle, usa el body crudo.
 */
export function formatSicofiCancelacionError(
  res: SicofiCancelaTimbradoResponse | Record<string, unknown>,
  rawBody?: string,
): string {
  const r = res as Record<string, unknown>;
  const parts = [
    pickSicofiCancelField(r, "ErrorCancelacion", "errorCancelacion", "error_cancelacion"),
    pickSicofiCancelField(r, "Mensaje", "mensaje", "message", "Message"),
    (() => {
      const code = pickSicofiCancelField(r, "CodigoError", "codigoError", "codigo_error");
      return code ? `código ${code}` : null;
    })(),
    (() => {
      const sat = pickSicofiCancelField(r, "RespuestaSAT", "respuestaSAT", "respuesta_sat");
      return sat ? `RespuestaSAT: ${sat}` : null;
    })(),
  ].filter((p): p is string => typeof p === "string" && p.length > 0);

  if (parts.length) return parts.join(" — ");

  const trimmed = rawBody?.trim();
  if (trimmed) {
    const snippet = trimmed.length > 800 ? `${trimmed.slice(0, 800)}…` : trimmed;
    return `Cancelación rechazada por Sicofi: ${snippet}`;
  }
  return "Cancelación rechazada por Sicofi (sin detalle del PAC)";
}

/**
 * Envía la solicitud de cancelación a Sicofi y valida `CancelacionCorrecta`.
 *
 * @param url - URL completa de CancelaTimbrado.
 * @param payload - JSON con credenciales, UUID y motivo.
 * @param accessToken - JWT Bearer obtenido en `sicofiAuth`.
 * @throws `SicofiHttpError` si HTTP no OK; `Error` si cancelación no correcta o timeout.
 */
export async function sicofiPostCancelaTimbrado(
  url: string,
  payload: SicofiCancelaTimbradoRequest,
  accessToken: string,
): Promise<SicofiCancelaTimbradoResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), sicofiTimeoutMs());
  try {
    const debugBody = { ...payload, Contrasena: "[redacted]" };
    logger.debug(`[Sicofi] CancelaTimbrado request body:\n${JSON.stringify(debugBody, null, 2)}`);
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const body = await res.text();
    logger.debug(
      `[Sicofi] CancelaTimbrado response status=${res.status} body:\n${body.slice(0, 4000)}`,
    );
    if (!res.ok) {
      logger.warn(`[Sicofi] CancelaTimbrado HTTP ${res.status}: ${body.slice(0, 1000)}`);
      throw new SicofiHttpError(res.status, messageFromSicofiJsonBody(body, res.status));
    }
    let parsed: SicofiCancelaTimbradoResponse;
    try {
      parsed = JSON.parse(body) as SicofiCancelaTimbradoResponse;
    } catch {
      logger.warn(`[Sicofi] CancelaTimbrado respuesta no JSON: ${body.slice(0, 1000)}`);
      throw new Error(
        `Respuesta de cancelación Sicofi no es JSON válido: ${body.trim().slice(0, 500) || "(vacío)"}`,
      );
    }
    if (!isSicofiCancelacionCorrecta(parsed.CancelacionCorrecta)) {
      const detail = formatSicofiCancelacionError(parsed, body);
      logger.warn(
        `[Sicofi] CancelaTimbrado rechazada CancelacionCorrecta=${String(parsed.CancelacionCorrecta)}: ${detail}`,
      );
      throw new Error(enhanceSicofiErrorMessage(detail));
    }
    return parsed;
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new Error("Timeout al conectar con Sicofi");
    }
    throw e;
  } finally {
    clearTimeout(timeout);
  }
}
