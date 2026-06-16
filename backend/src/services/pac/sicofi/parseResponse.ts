import type { TimbradoResult } from "../types";
import { enhanceSicofiErrorMessage } from "./sicofiErrors";

/** Metadatos extraídos del XML timbrado antes de armar `TimbradoResult`. */
export interface ParsedCfdiMeta {
  uuid: string;
  xmlTimbrado: string;
  fechaTimbrado: string;
  serie?: string;
  folio?: string;
  tipoDeComprobante?: string;
}

/** Lee un atributo de un nodo XML por nombre de tag y atributo (con o sin namespace). */
function attr(xml: string, tag: string, name: string): string | undefined {
  const re = new RegExp(`<(?:[^:>]+:)?${tag}[^>]*\\s${name}="([^"]*)"`, "i");
  const m = xml.match(re);
  return m?.[1];
}

/** Lee un atributo del nodo `Comprobante` del CFDI. */
function comprobanteAttr(xml: string, name: string): string | undefined {
  const re = new RegExp(`<(?:[^:>]+:)?Comprobante[^>]*\\s${name}="([^"]*)"`, "i");
  const m = xml.match(re);
  return m?.[1];
}

/**
 * Extrae el XML del CFDI desde el body de respuesta de Sicofi.
 * Acepta XML directo o JSON con campo `Xml`/`xml`/`Comprobante`.
 *
 * @param body - Cuerpo crudo de la respuesta HTTP.
 * @param contentType - Header Content-Type opcional para detectar JSON.
 * @returns XML del comprobante timbrado.
 * @throws Si el formato no es reconocido o JSON sin XML (mensaje enriquecido).
 */
export function extractXmlFromBody(body: string, contentType?: string): string {
  const trimmed = body.trim();
  if (trimmed.startsWith("<?xml") || trimmed.startsWith("<cfdi:") || trimmed.startsWith("<")) {
    return trimmed;
  }
  if (contentType?.includes("json") || trimmed.startsWith("{")) {
    try {
      const j = JSON.parse(trimmed) as Record<string, unknown>;
      const xml =
        (typeof j.Xml === "string" && j.Xml) ||
        (typeof j.xml === "string" && j.xml) ||
        (typeof j.XML === "string" && j.XML) ||
        (typeof j.Comprobante === "string" && j.Comprobante);
      if (xml) return xml;
      const err = typeof j.Mensaje === "string" ? j.Mensaje : typeof j.message === "string" ? j.message : typeof j.error === "string" ? j.error : JSON.stringify(j);
      throw new Error(enhanceSicofiErrorMessage(err || "Respuesta Sicofi sin XML"));
    } catch (e) {
      if (e instanceof SyntaxError) throw new Error("Respuesta Sicofi no reconocida");
      throw e;
    }
  }
  throw new Error("Respuesta Sicofi no reconocida");
}

/**
 * Parsea UUID, fecha de timbrado y serie/folio desde el XML del CFDI.
 *
 * @param xml - XML timbrado completo.
 * @returns Metadatos del TimbreFiscalDigital y Comprobante.
 * @throws Si falta `TimbreFiscalDigital` con UUID o FechaTimbrado.
 */
export function parseTimbradoXml(xml: string): ParsedCfdiMeta {
  const uuid = attr(xml, "TimbreFiscalDigital", "UUID");
  const fechaTimbrado = attr(xml, "TimbreFiscalDigital", "FechaTimbrado");
  if (!uuid || !fechaTimbrado) {
    throw new Error("XML timbrado sin TimbreFiscalDigital (UUID/FechaTimbrado)");
  }
  return {
    uuid,
    xmlTimbrado: xml,
    fechaTimbrado,
    serie: comprobanteAttr(xml, "Serie"),
    folio: comprobanteAttr(xml, "Folio"),
    tipoDeComprobante: comprobanteAttr(xml, "TipoDeComprobante"),
  };
}

/**
 * Pipeline completo: body HTTP → XML → `TimbradoResult`.
 * Trunca `pacResponse` a 8000 caracteres para persistencia en BD.
 */
export function parseSicofiResponse(body: string, contentType?: string): TimbradoResult {
  const xml = extractXmlFromBody(body, contentType);
  const parsed = parseTimbradoXml(xml);
  return {
    uuid: parsed.uuid,
    xmlTimbrado: parsed.xmlTimbrado,
    fechaTimbrado: parsed.fechaTimbrado,
    serie: parsed.serie,
    folio: parsed.folio,
    pacResponse: body.length > 8000 ? body.slice(0, 8000) + "…" : body,
  };
}
