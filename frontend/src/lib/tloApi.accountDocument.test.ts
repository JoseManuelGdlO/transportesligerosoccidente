import { describe, expect, it } from "vitest";
import { normalizeAccountDocument } from "./tloApi";

describe("normalizeAccountDocument", () => {
  it("copia los complementos cancelados del detalle", () => {
    const doc = normalizeAccountDocument({
      id: "doc-1",
      tipo: "cxc",
      entidad_nombre: "ESCUELA",
      folio: "15",
      concepto: "Flete",
      fecha_emision: "2026-05-01",
      monto_original: 11200,
      estatus: "pagada",
      origen: "viaje",
      complementos_cancelados: [
        {
          id: "pago-1",
          serie: "P",
          folio: "4",
          uuid: "0ca71ac8-61a8-4d50-8136-fc447522c588",
        },
      ],
    });

    expect(doc.complementos_cancelados).toEqual([
      {
        id: "pago-1",
        serie: "P",
        folio: "4",
        uuid: "0ca71ac8-61a8-4d50-8136-fc447522c588",
      },
    ]);
  });

  it("deja la lista vacía cuando el listado no la manda", () => {
    const doc = normalizeAccountDocument({
      id: "doc-1",
      tipo: "cxc",
      entidad_nombre: "ESCUELA",
      folio: "15",
      concepto: "Flete",
      fecha_emision: "2026-05-01",
      monto_original: 11200,
      estatus: "abierta",
      origen: "viaje",
    });

    expect(doc.complementos_cancelados).toEqual([]);
  });
});
