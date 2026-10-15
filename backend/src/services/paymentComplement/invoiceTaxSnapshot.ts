import { XMLParser } from "fast-xml-parser";
import type { TaxComponent } from "./taxComponent";

export interface InvoiceFiscalSnapshot {
  uuid: string;
  serie?: string;
  folio?: string;
  fecha: string;
  total: number;
  moneda: string;
  metodoPago?: string;
  taxes: TaxComponent[];
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function asArray<T>(v: T | T[] | undefined | null): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

function attr(node: Record<string, unknown> | undefined, name: string): string {
  if (!node) return "";
  const v = node[`@_${name}`];
  return v != null ? String(v) : "";
}

function taxKey(tipo: TaxComponent["tipo"], impuesto: string, tipoFactor: string, tasaOCuota: number): string {
  return `${tipo}|${impuesto}|${tipoFactor}|${tasaOCuota}`;
}

function mergeTax(
  map: Map<string, TaxComponent>,
  tipo: TaxComponent["tipo"],
  node: Record<string, unknown>,
): void {
  const impuesto = attr(node, "Impuesto");
  const tipoFactor = attr(node, "TipoFactor");
  const tasaOCuota = Number(attr(node, "TasaOCuota"));
  const base = Number(attr(node, "Base"));
  const importe = Number(attr(node, "Importe"));
  const key = taxKey(tipo, impuesto, tipoFactor, tasaOCuota);
  const existing = map.get(key);
  if (existing) {
    existing.base = round2(existing.base + base);
    existing.importe = round2(existing.importe + importe);
    return;
  }
  map.set(key, {
    tipo,
    impuesto,
    tipoFactor,
    tasaOCuota,
    base: round2(base),
    importe: round2(importe),
  });
}

function collectTaxesFromConceptos(comprobante: Record<string, unknown>): TaxComponent[] {
  const conceptosNode = (comprobante.Conceptos as Record<string, unknown> | undefined)?.Concepto;
  const conceptos = asArray(conceptosNode as Record<string, unknown> | Record<string, unknown>[] | undefined);
  const map = new Map<string, TaxComponent>();

  for (const concepto of conceptos) {
    const impuestos = concepto.Impuestos as Record<string, unknown> | undefined;
    if (!impuestos) continue;

    const trasladosNode = impuestos.Traslados as Record<string, unknown> | undefined;
    for (const t of asArray(trasladosNode?.Traslado as Record<string, unknown> | Record<string, unknown>[] | undefined)) {
      mergeTax(map, "traslado", t);
    }

    const retencionesNode = impuestos.Retenciones as Record<string, unknown> | undefined;
    for (const r of asArray(
      retencionesNode?.Retencion as Record<string, unknown> | Record<string, unknown>[] | undefined,
    )) {
      mergeTax(map, "retencion", r);
    }
  }

  return Array.from(map.values());
}

export function parseInvoiceTaxSnapshot(xml: string): InvoiceFiscalSnapshot {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    removeNSPrefix: true,
    isArray: (name) => ["Concepto", "Traslado", "Retencion"].includes(name),
  });

  const doc = parser.parse(xml) as Record<string, unknown>;
  const comprobante = (doc.Comprobante || doc["cfdi:Comprobante"]) as Record<string, unknown> | undefined;
  if (!comprobante) {
    throw new Error("XML sin nodo Comprobante");
  }

  const complemento = comprobante.Complemento as Record<string, unknown> | undefined;
  const tfd =
    (complemento?.TimbreFiscalDigital as Record<string, unknown> | undefined) ||
    (() => {
      const vals = complemento ? Object.values(complemento) : [];
      return vals.find((v) => v && typeof v === "object" && "@_UUID" in (v as object)) as
        | Record<string, unknown>
        | undefined;
    })();

  const uuid = attr(tfd, "UUID");
  if (!uuid) {
    throw new Error("XML sin UUID en TimbreFiscalDigital");
  }

  const fechaRaw = attr(comprobante, "Fecha");
  const serie = attr(comprobante, "Serie") || undefined;
  const folio = attr(comprobante, "Folio") || undefined;
  const metodoPago = attr(comprobante, "MetodoPago") || undefined;

  return {
    uuid,
    serie,
    folio,
    fecha: fechaRaw.slice(0, 10),
    total: Number(attr(comprobante, "Total")),
    moneda: attr(comprobante, "Moneda"),
    metodoPago,
    taxes: collectTaxesFromConceptos(comprobante),
  };
}
