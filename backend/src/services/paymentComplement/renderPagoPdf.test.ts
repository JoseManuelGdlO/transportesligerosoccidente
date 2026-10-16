import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderPagoPdf } from "./renderPagoPdf";

describe("renderPagoPdf", () => {
  it("devuelve un buffer PDF", async () => {
    const buffer = await renderPagoPdf({
      serie: "P",
      folio: "1",
      uuid: "11111111-1111-1111-1111-111111111111",
      fechaPago: "2026-10-15T12:00:00",
      formaPagoP: "03",
      monedaP: "MXN",
      monto: 5600,
      receptorNombre: "ESCUELA",
      receptorRfc: "EKU9003173C9",
      lineas: [
        {
          serie: "I",
          folio: "15",
          uuid: "D9BE138A-9449-11EE-9430-00155D012007",
          numParcialidad: 1,
          impSaldoAnt: 11200,
          impPagado: 5600,
          impSaldoInsoluto: 5600,
          taxes: [
            {
              tipo: "traslado",
              impuesto: "002",
              tipoFactor: "Tasa",
              tasaOCuota: 0.16,
              base: 5000,
              importe: 800,
            },
            {
              tipo: "retencion",
              impuesto: "002",
              tipoFactor: "Tasa",
              tasaOCuota: 0.04,
              base: 5000,
              importe: 200,
            },
          ],
        },
      ],
    });

    assert.equal(buffer.subarray(0, 4).toString(), "%PDF");
  });
});
