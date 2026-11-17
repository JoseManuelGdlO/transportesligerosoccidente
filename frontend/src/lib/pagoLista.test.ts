import { describe, expect, it } from "vitest";
import type { AccountDocument } from "@/types/tlo";
import { planPagoLista } from "./pagoLista";

function doc(partial: Partial<AccountDocument> & Pick<AccountDocument, "id">): AccountDocument {
  return {
    tipo: "cxc",
    entidad_nombre: "Cliente",
    folio: partial.id,
    concepto: "",
    conceptos: [],
    fecha_emision: "2026-01-01",
    monto_original: 100,
    abonos: 0,
    saldo_pendiente: 100,
    estatus: "abierta",
    estatus_display: "Al día",
    origen: "viaje",
    client_id: "cliente-1",
    moneda: "MXN",
    ...partial,
  };
}

describe("planPagoLista", () => {
  it("rechaza una selección sin saldo", () => {
    const plan = planPagoLista([doc({ id: "a", estatus: "pagada", saldo_pendiente: 0 })]);
    expect(plan.kind).toBe("vacio");
  });

  it("junta facturas PPD del mismo cliente en un complemento y cuenta las que no entran", () => {
    const plan = planPagoLista([
      doc({ id: "a", complemento_disponible: true }),
      doc({ id: "b", complemento_disponible: true }),
      doc({ id: "c", estatus: "pagada", saldo_pendiente: 0, complemento_disponible: true }),
    ]);
    expect(plan).toMatchObject({ kind: "complemento", clientId: "cliente-1", omitidas: 1 });
    if (plan.kind === "complemento") expect(plan.docs.map((item) => item.id)).toEqual(["a", "b"]);
  });

  it("no mezcla clientes ni monedas en un complemento", () => {
    expect(
      planPagoLista([
        doc({ id: "a", complemento_disponible: true, client_id: "cliente-1" }),
        doc({ id: "b", complemento_disponible: true, client_id: "cliente-2" }),
      ]).kind,
    ).toBe("error");
    expect(
      planPagoLista([
        doc({ id: "a", complemento_disponible: true, moneda: "MXN" }),
        doc({ id: "b", complemento_disponible: true, moneda: "USD" }),
      ]).kind,
    ).toBe("error");
  });

  it("no mezcla complemento de pago con abono interno", () => {
    const plan = planPagoLista([
      doc({ id: "a", complemento_disponible: true }),
      doc({ id: "b", complemento_disponible: false }),
    ]);
    expect(plan.kind).toBe("error");
  });

  it("manda a abono interno las facturas que no timbran complemento", () => {
    const plan = planPagoLista([
      doc({ id: "a", origen: "manual", complemento_disponible: false }),
      doc({ id: "b", origen: "manual" }),
    ]);
    expect(plan.kind).toBe("abono");
    if (plan.kind === "abono") expect(plan.docs).toHaveLength(2);
  });
});
