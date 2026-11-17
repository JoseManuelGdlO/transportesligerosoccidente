import type { AccountDocument } from "@/types/tlo";

export type PagoListaPlan =
  | { kind: "vacio"; message: string }
  | { kind: "error"; message: string }
  | { kind: "complemento"; clientId: string; docs: AccountDocument[]; omitidas: number }
  | { kind: "abono"; docs: AccountDocument[]; omitidas: number };

function monedaDe(doc: AccountDocument): string {
  return (doc.moneda || "MXN").toUpperCase();
}

/** Decide si las facturas marcadas se cobran con un complemento o con abonos internos. */
export function planPagoLista(docs: AccountDocument[]): PagoListaPlan {
  const pagables = docs.filter((doc) => doc.estatus === "abierta" && doc.saldo_pendiente > 0);
  const omitidas = docs.length - pagables.length;
  if (!pagables.length) {
    return { kind: "vacio", message: "Las facturas seleccionadas no tienen saldo por pagar" };
  }

  const conComplemento = pagables.filter((doc) => doc.complemento_disponible);
  const sinComplemento = pagables.filter((doc) => !doc.complemento_disponible);
  if (conComplemento.length && sinComplemento.length) {
    return {
      kind: "error",
      message:
        "No mezcles facturas con complemento de pago y facturas de abono interno. Selecciona un solo tipo.",
    };
  }

  if (!conComplemento.length) {
    return { kind: "abono", docs: sinComplemento, omitidas };
  }

  const clientIds = new Set(conComplemento.map((doc) => doc.client_id).filter(Boolean));
  if (clientIds.size !== 1 || !conComplemento[0].client_id) {
    return {
      kind: "error",
      message: "El complemento de pago solo puede incluir facturas del mismo cliente",
    };
  }

  const monedas = new Set(conComplemento.map(monedaDe));
  if (monedas.size !== 1) {
    return {
      kind: "error",
      message: "El complemento de pago solo puede incluir facturas de la misma moneda",
    };
  }

  return { kind: "complemento", clientId: conComplemento[0].client_id, docs: conComplemento, omitidas };
}
