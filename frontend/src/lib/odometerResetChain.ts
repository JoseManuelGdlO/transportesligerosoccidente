export type ChainDraft = {
  id: string;
  folio: string;
  cerrado: boolean;
  kmInicial: number;
  kmFinal: string;
};

/** El km final de cada viaje cerrado fija el km inicial del siguiente. */
export function linkChain(rows: ChainDraft[]): ChainDraft[] {
  const out: ChainDraft[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    if (i === 0) {
      out.push(row);
      continue;
    }
    const prev = out[i - 1]!;
    const parsed = Number(prev.kmFinal);
    const linked =
      prev.cerrado && prev.kmFinal.trim() !== "" && Number.isInteger(parsed) ? parsed : Number.NaN;
    out.push({ ...row, kmInicial: linked });
  }
  return out;
}

export function chainError(rows: ChainDraft[]): string | null {
  const linked = linkChain(rows);
  for (let i = 0; i < linked.length; i++) {
    const row = linked[i]!;
    if (!Number.isInteger(row.kmInicial) || row.kmInicial < 0) {
      if (i === 0) return `El km inicial de ${row.folio} no es válido`;
      return `Indica el km final de ${linked[i - 1]!.folio} para continuar con ${row.folio}`;
    }
    if (!row.cerrado) continue;
    if (row.kmFinal.trim() === "") return `Indica el km final de ${row.folio}`;
    const fin = Number(row.kmFinal);
    if (!Number.isInteger(fin) || fin < 0) return `El km final de ${row.folio} no es válido`;
    if (fin <= row.kmInicial) return `El km final de ${row.folio} debe ser mayor al inicial`;
  }
  return null;
}
