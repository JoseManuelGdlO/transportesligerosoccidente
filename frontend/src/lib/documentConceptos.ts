export type DocumentConcepto = {
  descripcion: string;
  precio: number;
};

function roundMoney(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function emptyConcepto(): DocumentConcepto {
  return { descripcion: "", precio: 0 };
}

export function sumConceptos(conceptos: DocumentConcepto[]): number {
  return roundMoney(
    conceptos.reduce((s, c) => s + (Number.isFinite(c.precio) ? c.precio : 0), 0),
  );
}

export function validateConceptos(conceptos: DocumentConcepto[]): string | null {
  const filled = conceptos.filter((c) => c.descripcion.trim());
  if (!filled.length) return "Agrega al menos un concepto con descripción";
  for (let i = 0; i < conceptos.length; i++) {
    const c = conceptos[i];
    const hasDesc = Boolean(c.descripcion.trim());
    const hasPrecio = c.precio !== 0;
    if (!hasDesc && !hasPrecio) continue;
    if (!hasDesc) return `Concepto ${i + 1}: falta descripción`;
    if (!Number.isFinite(c.precio) || c.precio < 0) {
      return `Concepto ${i + 1}: el precio no puede ser negativo`;
    }
  }
  return null;
}

export function filledConceptos(conceptos: DocumentConcepto[]): DocumentConcepto[] {
  return conceptos
    .filter((c) => c.descripcion.trim())
    .map((c) => ({ descripcion: c.descripcion.trim(), precio: roundMoney(c.precio) }));
}

export function parsePrecioInput(raw: string): number {
  if (raw.trim() === "") return 0;
  const n = Number(raw);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, roundMoney(n));
}
