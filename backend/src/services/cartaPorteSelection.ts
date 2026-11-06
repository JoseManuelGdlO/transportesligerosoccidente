export type CartaEstatus = "borrador" | "timbrada" | "cancelada" | "error";

type CartaConFecha = {
  updatedAt?: Date | string | null;
};

function timestamp(value: Date | string | null | undefined): number {
  if (value == null) return 0;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? 0 : t;
}

function pickLatest<T extends CartaConFecha>(cartas: T[]): T | null {
  let winner: T | null = null;
  let winnerTs = -1;
  for (const carta of cartas) {
    const ts = timestamp(carta.updatedAt);
    if (winner === null || ts >= winnerTs) {
      winner = carta;
      winnerTs = ts;
    }
  }
  return winner;
}

export function cartaVisible<
  T extends { id: string; estatus: CartaEstatus; updatedAt?: Date | string | null },
>(cartas: T[]): T | null {
  const editable = cartas.filter((c) => c.estatus === "borrador" || c.estatus === "error");
  if (editable.length > 0) return pickLatest(editable);

  const timbradas = cartas.filter((c) => c.estatus === "timbrada");
  if (timbradas.length > 0) return pickLatest(timbradas);

  const canceladas = cartas.filter((c) => c.estatus === "cancelada");
  if (canceladas.length > 0) return pickLatest(canceladas);

  return null;
}

export function algunaCartaTimbrada(cartas: { estatus: string }[]): boolean {
  return cartas.some((c) => c.estatus === "timbrada");
}
