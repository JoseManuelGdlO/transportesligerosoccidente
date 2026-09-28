import { describe, expect, it } from "vitest";
import type { jsPDF } from "jspdf";
import { buildSettlementPdf } from "@/lib/settlementPdf";
import { SAMPLE_DRIVER, SAMPLE_PERIOD, SAMPLE_SETTLEMENT_SUMMARY } from "@/lib/settlementPdfSample";
import type { SettlementSummary } from "@/lib/calc";

function pdfText(doc: jsPDF): string {
  const internal = doc as unknown as { internal?: { pages?: unknown[] } };
  const pages = internal.internal?.pages;
  if (!Array.isArray(pages)) return "";
  const parts: string[] = [];
  for (let i = 1; i < pages.length; i++) {
    const page = pages[i];
    if (!Array.isArray(page)) continue;
    for (const token of page) {
      if (typeof token !== "string") continue;
      const matches = token.match(/\((?:\\.|[^\\)])*\)/g) ?? [];
      for (const m of matches) {
        parts.push(m.slice(1, -1).replace(/\\(.)/g, "$1"));
      }
    }
  }
  return parts.join(" ");
}

function summaryWithDebts(extras: Partial<SettlementSummary> = {}): SettlementSummary {
  return {
    ...SAMPLE_SETTLEMENT_SUMMARY,
    account_items: [
      {
        id: "paused",
        tipo: "incidencia",
        concepto: "Llanta sin descuento",
        monto_original: 3000,
        cuota_liquidacion: 500,
        saldo: 3000,
        fecha: "2026-01-01",
        descuento_activo: false,
      },
      {
        id: "active",
        tipo: "prestamo",
        concepto: "Prestamo activo",
        monto_original: 1000,
        cuota_liquidacion: 400,
        saldo: 1000,
        fecha: "2026-02-01",
        descuento_activo: true,
      },
    ],
    account_applications: [
      {
        item_id: "active",
        tipo: "prestamo",
        concepto: "Prestamo activo",
        monto: 400,
        saldo_antes: 1000,
        saldo_despues: 600,
      },
    ],
    ...extras,
  };
}

describe("buildSettlementPdf cuenta en viáticos", () => {
  it("muestra cuotas de cuenta en la tabla de viáticos", () => {
    const doc = buildSettlementPdf({
      tenantNombre: "TLO",
      driver: SAMPLE_DRIVER,
      inicio: SAMPLE_PERIOD.inicio,
      fin: SAMPLE_PERIOD.fin,
      summary: summaryWithDebts({ total_cuenta_abonos: 400 }),
    });
    const text = pdfText(doc);

    expect(text).toContain("compensaciones y cuenta");
    expect(text).toContain("Cuenta (prestamo)");
    expect(text).toContain("Prestamo activo");
    expect(text).toContain("Cuenta operador (cuotas)");
  });

  it("incluye adeudos vigentes aunque no se descuenten en el periodo", () => {
    const doc = buildSettlementPdf({
      tenantNombre: "TLO",
      driver: SAMPLE_DRIVER,
      inicio: SAMPLE_PERIOD.inicio,
      fin: SAMPLE_PERIOD.fin,
      summary: summaryWithDebts(),
    });
    const text = pdfText(doc);

    expect(text).toContain("Cuenta (incidencia)");
    expect(text).toContain("Llanta sin descuento");
  });
});
