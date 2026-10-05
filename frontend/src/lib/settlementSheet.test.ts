import { describe, expect, it } from "vitest";
import type { SettlementSummary } from "@/lib/calc";
import { buildSettlementSheet } from "@/lib/settlementSheet";

function summary(extras: Partial<SettlementSummary> = {}): SettlementSummary {
  return {
    trips: [],
    total_ingresos: 4314,
    total_comisiones: 7802.8,
    total_km: 0,
    viaticos_entregados: 0,
    viaticos_comprobados: 0,
    saldo_viaticos: 0,
    total_descuentos: 0,
    total_anticipos: 200,
    total_compensaciones: 0,
    neto_pagar: 7602.8,
    advances: [],
    discounts: [],
    compensations: [],
    ...extras,
  };
}

function labels(extras: Partial<SettlementSummary> = {}) {
  return buildSettlementSheet(summary(extras)).lines.map((line) => ({
    label: line.label,
    amount: line.amount,
    kind: line.kind,
  }));
}

describe("buildSettlementSheet descuentos", () => {
  it("muestra la descripción de cada descuento del periodo", () => {
    const lines = labels({
      total_descuentos: 2740,
      discounts: [
        { id: "d2", tipo: "multa", fecha: "2026-10-02", descripcion: "Multa patio", monto: 500, en_periodo: true },
        { id: "d1", tipo: "nomina", fecha: "2026-10-01", descripcion: "Nomina", monto: 2240, en_periodo: true },
      ],
    });

    expect(lines).toEqual(expect.arrayContaining([
      { label: "Nomina", amount: 2240, kind: "sub" },
      { label: "Multa patio", amount: 500, kind: "sub" },
    ]));
    expect(lines.map((line) => line.label)).toEqual([
      "Comisión",
      "Compensaciones",
      "Viáticos a favor",
      "Nomina",
      "Multa patio",
      "Anticipos",
      "Viáticos no comprobados",
      "Subtotal",
      "Abono a préstamos",
      "Abono a incidencias",
      "Neto a pagar",
    ]);
    expect(lines.find((line) => line.label === "Subtotal")?.amount).toBe(4862.8);
    expect(lines.find((line) => line.label === "Anticipos")?.amount).toBe(200);
    expect(lines.find((line) => line.label === "Neto a pagar")?.amount).toBe(7602.8);
    expect(lines.some((line) => line.label === "Descuentos")).toBe(false);
  });

  it("usa el tipo cuando la descripción está vacía o es el texto automático", () => {
    const lines = labels({
      total_descuentos: 300,
      discounts: [
        { id: "d1", tipo: "nomina", fecha: "2026-10-01", descripcion: "", monto: 100, en_periodo: true },
        { id: "d2", tipo: "dano", fecha: "2026-10-02", descripcion: "Descuento", monto: 200, en_periodo: true },
      ],
    });

    expect(lines.map((line) => line.label)).toContain("Nómina");
    expect(lines.map((line) => line.label)).toContain("Daño");
    expect(lines.find((line) => line.label === "Nómina")?.amount).toBe(100);
    expect(lines.find((line) => line.label === "Daño")?.amount).toBe(200);
  });

  it("conserva Descuentos en cero cuando no hay descuentos", () => {
    const lines = labels();
    expect(lines).toContainEqual({ label: "Descuentos", amount: 0, kind: "sub" });
  });

  it("conserva el total genérico si la liquidación no trae el detalle", () => {
    const lines = labels({ total_descuentos: 2240, discounts: undefined });
    expect(lines).toContainEqual({ label: "Descuentos", amount: 2240, kind: "sub" });
  });

  it("conserva el total genérico si el detalle no cuadra", () => {
    const lines = labels({
      total_descuentos: 2240,
      discounts: [
        { id: "d1", tipo: "nomina", fecha: "2026-10-01", descripcion: "Nomina", monto: 500, en_periodo: true },
      ],
    });
    expect(lines).toContainEqual({ label: "Descuentos", amount: 2240, kind: "sub" });
    expect(lines.some((line) => line.label === "Nomina")).toBe(false);
  });

  it("omite descuentos fuera del periodo", () => {
    const lines = labels({
      total_descuentos: 2240,
      discounts: [
        { id: "d1", tipo: "nomina", fecha: "2026-10-01", descripcion: "Nomina", monto: 2240, en_periodo: true },
        { id: "d0", tipo: "multa", fecha: "2026-09-01", descripcion: "Fuera", monto: 100, en_periodo: false },
      ],
    });
    expect(lines).toContainEqual({ label: "Nomina", amount: 2240, kind: "sub" });
    expect(lines.some((line) => line.label === "Fuera")).toBe(false);
  });
});
