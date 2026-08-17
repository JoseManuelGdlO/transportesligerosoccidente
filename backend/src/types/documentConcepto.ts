export type DocumentConcepto = {
  descripcion: string;
  precio: number;
};

function httpError(message: string, status: number): Error & { status: number } {
  const err = new Error(message) as Error & { status: number };
  err.status = status;
  return err;
}

/** Money rounding to 2 decimal places (centavos). */
function roundMoney(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function parseConceptosJson(raw: unknown): DocumentConcepto[] {
  let value = raw;
  if (typeof value === "string" && value.trim()) {
    try {
      value = JSON.parse(value);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(value)) return [];
  const out: DocumentConcepto[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const descripcion = String(rec.descripcion ?? "").trim();
    const precio = Number(rec.precio);
    if (!descripcion || !Number.isFinite(precio)) continue;
    out.push({ descripcion: descripcion.slice(0, 512), precio: roundMoney(precio) });
  }
  return out;
}

export function validateConceptos(raw: unknown): DocumentConcepto[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw httpError("Agrega al menos un concepto", 400);
  }
  const out: DocumentConcepto[] = [];
  raw.forEach((item, i) => {
    if (!item || typeof item !== "object") {
      throw httpError(`Concepto ${i + 1}: formato inválido`, 400);
    }
    const rec = item as Record<string, unknown>;
    const descripcion = String(rec.descripcion ?? "").trim();
    const precio = Number(rec.precio);
    if (!descripcion) {
      throw httpError(`Concepto ${i + 1}: falta descripción`, 400);
    }
    if (!Number.isFinite(precio) || precio < 0) {
      throw httpError(`Concepto ${i + 1}: el precio no puede ser negativo`, 400);
    }
    out.push({ descripcion: descripcion.slice(0, 512), precio: roundMoney(precio) });
  });
  return out;
}

export function sumConceptos(conceptos: DocumentConcepto[]): number {
  return roundMoney(conceptos.reduce((s, c) => s + c.precio, 0));
}

export function summarizeConceptos(conceptos: DocumentConcepto[], max = 512): string {
  const text = conceptos.map((c) => c.descripcion).join("; ");
  return (text || "Conceptos").slice(0, max);
}

export function conceptosFromLegacy(descripcion: string, costo: number): DocumentConcepto[] {
  const desc = descripcion.trim() || "Concepto";
  const precio = Math.max(0, roundMoney(Number.isFinite(costo) ? costo : 0));
  return [{ descripcion: desc.slice(0, 512), precio }];
}

export function maintenanceCxpProjection(record: {
  id: string;
  tipo: string;
  num_factura?: string | null;
  conceptos: unknown;
}): {
  folio: string;
  concepto: string;
  conceptos: DocumentConcepto[];
  monto: number;
} {
  const conceptos = validateConceptos(record.conceptos);
  const monto = sumConceptos(conceptos);
  const folio = record.num_factura?.trim() || `MANT-${record.id.slice(0, 8).toUpperCase()}`;
  const concepto = `Mantenimiento ${record.tipo}: ${summarizeConceptos(conceptos)}`.slice(0, 512);
  return { folio, concepto, conceptos, monto };
}

export function maintenancePatchFromAccount(patch: {
  folio?: string;
  concepto?: string;
  monto_original?: number;
  conceptos?: unknown;
}): Record<string, unknown> {
  const mPatch: Record<string, unknown> = {};
  if (patch.folio !== undefined) {
    mPatch.num_factura = patch.folio.trim() || null;
  }
  if (patch.conceptos !== undefined) {
    const conceptos = validateConceptos(patch.conceptos);
    mPatch.conceptos = conceptos;
    mPatch.costo = sumConceptos(conceptos);
    mPatch.descripcion = summarizeConceptos(conceptos);
    return mPatch;
  }
  if (patch.monto_original !== undefined) mPatch.costo = patch.monto_original;
  if (patch.concepto !== undefined) {
    const colon = patch.concepto.indexOf(":");
    mPatch.descripcion =
      colon >= 0 ? patch.concepto.slice(colon + 1).trim() || patch.concepto : patch.concepto;
  }
  if (mPatch.descripcion != null || mPatch.costo != null) {
    const desc = String(mPatch.descripcion ?? "").trim();
    const costo = Number(mPatch.costo ?? 0);
    if (desc) mPatch.conceptos = conceptosFromLegacy(desc, costo);
  }
  return mPatch;
}
