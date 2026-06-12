import type { TimbradoResult } from "../types";

export interface ParsedCfdiMeta {
  uuid: string;
  xmlTimbrado: string;
  fechaTimbrado: string;
  serie?: string;
  folio?: string;
  tipoDeComprobante?: string;
}

function attr(xml: string, tag: string, name: string): string | undefined {
  const re = new RegExp(`<(?:[^:>]+:)?${tag}[^>]*\\s${name}="([^"]*)"`, "i");
  const m = xml.match(re);
  return m?.[1];
}

function comprobanteAttr(xml: string, name: string): string | undefined {
  const re = new RegExp(`<(?:[^:>]+:)?Comprobante[^>]*\\s${name}="([^"]*)"`, "i");
  const m = xml.match(re);
  return m?.[1];
}

/** Extrae XML desde body crudo (XML directo o JSON con campo Xml/xml). */
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
      const err = typeof j.Mensaje === "string" ? j.Mensaje : typeof j.error === "string" ? j.error : JSON.stringify(j);
      throw new Error(err || "Respuesta Sicofi sin XML");
    } catch (e) {
      if (e instanceof SyntaxError) throw new Error("Respuesta Sicofi no reconocida");
      throw e;
    }
  }
  throw new Error("Respuesta Sicofi no reconocida");
}

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
