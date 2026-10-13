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
    const j = JSON.parse(body) as Record<string, unknown> | string;
    if (typeof j === "string") return formatSicofiPlainCancelacionError(j);
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
  const decoded = decodeSicofiUnicodeEscapes(msg);
  if (SICOFI_PLAIN_CANCEL_ERROR.test(decoded)) return formatSicofiPlainCancelacionError(decoded);
  return decoded;
}

/**
 * Indica si la cancelación fue exitosa según `CancelacionCorrecta` (true/false string).
 */
export function isSicofiCancelacionCorrecta(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return false;
  return value.trim().toLowerCase() === "true";
}

const YA_CANCELADA_EN_SAT = /ya se encuentra cancelada/i;
/** `<a:Estado>Cancelado</a:Estado>` o `<Estado>Cancelado</Estado>`. No coincide con EsCancelable. */
const ESTADO_SAT_CANCELADO = /<(?:[\w.]+:)?Estado>\s*Cancelado\s*<\/(?:[\w.]+:)?Estado>/i;

/**
 * El SAT ya canceló el CFDI. Sicofi no manda `CancelacionCorrecta`, pero el acuse
 * o el `Estado` del SOAP lo confirman. Se trata como éxito para alinear el estatus local.
 */
export function isSicofiCfdiYaCancelado(
  res: SicofiCancelaTimbradoResponse | Record<string, unknown> | null | undefined,
): boolean {
  if (!res) return false;
  const record = res as Record<string, unknown>;
  const acuse = pickSicofiCancelField(record, "acuse", "Acuse");
  if (acuse && YA_CANCELADA_EN_SAT.test(acuse)) return true;
  const mensajeSat = pickSicofiCancelField(record, "mensajeSAT", "MensajeSAT", "mensajeSat");
  return Boolean(mensajeSat && ESTADO_SAT_CANCELADO.test(mensajeSat));
}

/** Quita el SOAP de consulta SAT antes de mostrar un body crudo. */
function rawBodySinMensajeSat(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const copy = { ...(parsed as Record<string, unknown>) };
      delete copy.mensajeSAT;
      delete copy.MensajeSAT;
      delete copy.mensajeSat;
      if (Object.keys(copy).length === 0) return "";
      return JSON.stringify(copy);
    }
  } catch {
    // El body no es JSON; se usa tal cual.
  }
  return raw;
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

/** Texto plano de Sicofi: `Error: 999 Descripción: …` (a veces con `\u00F3` sin decodificar). */
const SICOFI_PLAIN_CANCEL_ERROR = /^Error:\s*(\S*)\s*Descripci[oó]n:\s*([\s\S]*)$/i;

/**
 * Convierte escapes `\uXXXX` literales a caracteres. Sicofi a veces los deja en el cuerpo
 * aunque el JSON ya debería haberlos decodificado.
 */
export function decodeSicofiUnicodeEscapes(text: string): string {
  return text.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex: string) =>
    String.fromCharCode(Number.parseInt(hex, 16)),
  );
}

/**
 * Normaliza el error de texto que Sicofi devuelve en lugar del objeto de cancelación.
 * `Error: 999 Descripción: …` pasa a `Error 999: …`. Si código y descripción vienen vacíos, no hay detalle.
 */
export function formatSicofiPlainCancelacionError(text: string): string {
  const decoded = decodeSicofiUnicodeEscapes(text).trim().replace(/^"|"$/g, "");
  const match = decoded.match(SICOFI_PLAIN_CANCEL_ERROR);
  if (!match) {
    return decoded || "Cancelación rechazada por Sicofi (sin detalle del PAC)";
  }
  const code = match[1]?.trim() ?? "";
  const description = match[2]?.trim() ?? "";
  if (code && description) return `Error ${code}: ${description}`;
  if (description) return description;
  if (code) return `Error ${code}`;
  return "Cancelación rechazada por Sicofi (sin detalle del PAC)";
}

/**
 * Arma mensaje de error a partir de la respuesta de cancelación Sicofi.
 * Incluye acuse, ErrorCancelacion, Mensaje, CodigoError y RespuestaSAT.
 * `mensajeSAT` es el SOAP de consulta y no se muestra: desborda el modal.
 * Si el PAC manda un string JSON, lo decodifica. Si no hay detalle, usa el body crudo ya decodificado.
 */
export function formatSicofiCancelacionError(
  res: SicofiCancelaTimbradoResponse | Record<string, unknown> | string,
  rawBody?: string,
): string {
  if (typeof res === "string") return formatSicofiPlainCancelacionError(res);

  const r = res as Record<string, unknown>;
  const parts = [
    pickSicofiCancelField(r, "acuse", "Acuse"),
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
  ]
    .filter((p): p is string => typeof p === "string" && p.length > 0)
    .map((p) =>
      SICOFI_PLAIN_CANCEL_ERROR.test(decodeSicofiUnicodeEscapes(p))
        ? formatSicofiPlainCancelacionError(p)
        : decodeSicofiUnicodeEscapes(p),
    );

  if (parts.length) return parts.join(" — ");

  const trimmed = rawBodySinMensajeSat(rawBody?.trim() ?? "").trim();
  if (trimmed) {
    const decoded = decodeSicofiUnicodeEscapes(trimmed);
    const snippet = decoded.length > 800 ? `${decoded.slice(0, 800)}…` : decoded;
    return `Cancelación rechazada por Sicofi: ${snippet}`;
  }
  return "Cancelación rechazada por Sicofi (sin detalle del PAC)";
}

/**
 * Envía la solicitud de cancelación a Sicofi y valida `CancelacionCorrecta`.
 *
 * @param url - URL completa de Cancela.
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
    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      logger.warn(`[Sicofi] CancelaTimbrado respuesta no JSON: ${body.slice(0, 1000)}`);
      throw new Error(
        `Respuesta de cancelación Sicofi no es JSON válido: ${decodeSicofiUnicodeEscapes(body.trim()).slice(0, 500) || "(vacío)"}`,
      );
    }
    if (typeof parsed === "string") {
      const detail = formatSicofiCancelacionError(parsed);
      logger.warn(`[Sicofi] CancelaTimbrado rechazada (texto): ${detail}`);
      throw new Error(enhanceSicofiErrorMessage(detail));
    }
    const response =
      parsed !== null && typeof parsed === "object"
        ? (parsed as SicofiCancelaTimbradoResponse)
        : undefined;
    if (
      response &&
      (isSicofiCancelacionCorrecta(response.CancelacionCorrecta) ||
        isSicofiCfdiYaCancelado(response))
    ) {
      if (!isSicofiCancelacionCorrecta(response.CancelacionCorrecta)) {
        logger.info(
          "[Sicofi] CancelaTimbrado: el CFDI ya estaba cancelado en el SAT; se toma como éxito",
        );
      }
      return response;
    }
    const detail = formatSicofiCancelacionError(response ?? {}, body);
    logger.warn(
      `[Sicofi] CancelaTimbrado rechazada CancelacionCorrecta=${String(response?.CancelacionCorrecta)}: ${detail}`,
    );
    throw new Error(enhanceSicofiErrorMessage(detail));
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new Error("Timeout al conectar con Sicofi");
    }
    throw e;
  } finally {
    clearTimeout(timeout);
  }
}
