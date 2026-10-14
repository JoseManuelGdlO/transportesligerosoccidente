import { describe, expect, it } from "vitest";
import { accountStatementTotals } from "./accountStatementTotals";

describe("accountStatementTotals", () => {
  it("separa pendiente, vencido y pagadas", () => {
    const t = accountStatementTotals([
      { estatus: "abierta", estatus_display: "Al día", saldo_pendiente: 100, monto_original: 100 },
      { estatus: "abierta", estatus_display: "Vencida", saldo_pendiente: 40, monto_original: 40 },
      { estatus: "pagada", estatus_display: "Pagada", saldo_pendiente: 0, monto_original: 80 },
      { estatus: "cancelada", estatus_display: "Cancelada", saldo_pendiente: 0, monto_original: 5 },
    ]);
    expect(t).toEqual({ pendiente: 140, vencido: 40, pagadas: 80 });
  });
});
