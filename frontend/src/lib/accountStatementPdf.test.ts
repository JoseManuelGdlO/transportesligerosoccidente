import { describe, expect, it } from "vitest";
import type { jsPDF } from "jspdf";
import {
  buildAccountStatementPdf,
  diasAtraso,
  empresaLineasParaSaldos,
  groupSaldos,
  type AccountStatementRow,
} from "./accountStatementPdf";
import { DEFAULT_TEMPLATE_SETTLEMENT, DEFAULT_TEMPLATE_TRIP, type PdfTemplatesConfig } from "@/types/pdfTemplate";

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

function row(partial: Partial<AccountStatementRow> & Pick<AccountStatementRow, "entidad_id" | "entidad_nombre">): AccountStatementRow {
  return {
    tipo_docto: "FACTURA",
    folio: "RA-1",
    fecha_emision: "2026-09-24",
    fecha_ingreso_cobranza: null,
    fecha_vencimiento: null,
    monto_original: 0,
    abonos: 0,
    saldo_pendiente: 0,
    ...partial,
  };
}

describe("diasAtraso", () => {
  it("sin vencimiento es 0", () => {
    expect(diasAtraso(null, "2026-10-01")).toBe(0);
    expect(diasAtraso("", "2026-10-01")).toBe(0);
    expect(diasAtraso(undefined, "2026-10-01")).toBe(0);
  });

  it("es negativo cuando el corte es anterior al vencimiento", () => {
    expect(diasAtraso("2026-10-21", "2026-10-01")).toBe(-20);
  });
});

describe("groupSaldos", () => {
  it("agrupa por cliente y suma totales del reporte", () => {
    const { grupos, totales } = groupSaldos([
      row({
        entidad_id: "c:2",
        entidad_nombre: "RECAL ESTRUCTURAS",
        folio: "RA-304",
        fecha_emision: "2026-09-30",
        monto_original: 545664,
        saldo_pendiente: 545664,
      }),
      row({
        entidad_id: "c:1",
        entidad_nombre: "LATEX MEXICANA",
        folio: "RA-305",
        fecha_emision: "2026-09-30",
        monto_original: 100,
        abonos: 40,
        saldo_pendiente: 60,
      }),
      row({
        entidad_id: "c:1",
        entidad_nombre: "LATEX MEXICANA",
        folio: "RA-303",
        fecha_emision: "2026-09-24",
        monto_original: 12903.84,
        saldo_pendiente: 12903.84,
      }),
    ]);

    expect(grupos.map((g) => g.nombre)).toEqual(["LATEX MEXICANA", "RECAL ESTRUCTURAS"]);
    expect(grupos[0].rows.map((r) => r.folio)).toEqual(["RA-303", "RA-305"]);
    expect(grupos[0]).toMatchObject({ neto: 13003.84, pagos: 40, saldo: 12963.84 });
    expect(grupos[1]).toMatchObject({ neto: 545664, pagos: 0, saldo: 545664 });
    expect(totales).toEqual({ neto: 558667.84, pagos: 40, saldo: 558627.84 });
  });
});

describe("empresaLineasParaSaldos", () => {
  const config: PdfTemplatesConfig = {
    version: 2,
    settlement: DEFAULT_TEMPLATE_SETTLEMENT,
    trip: DEFAULT_TEMPLATE_TRIP,
  };

  it("usa el nombre del tenant si el bloque sigue siendo el ejemplo", () => {
    expect(empresaLineasParaSaldos(config, "Transportes Ligeros")).toEqual(["Transportes Ligeros"]);
  });

  it("prefiere el texto personalizado de liquidación", () => {
    const custom = structuredClone(config);
    const block = custom.settlement.sections.header.find((b) => b.id === "company_fiscal_block");
    if (block) block.props = { ...block.props, text: "GOCAL TRANSPORTACIONES\nRFC: RTR1502233P2" };
    expect(empresaLineasParaSaldos(custom, "Transportes Ligeros")).toEqual([
      "GOCAL TRANSPORTACIONES",
      "RFC: RTR1502233P2",
    ]);
  });
});

describe("buildAccountStatementPdf", () => {
  it("crea un PDF con dos clientes y el título Saldos de Clientes", () => {
    const { grupos, totales } = groupSaldos([
      row({
        entidad_id: "c:1",
        entidad_nombre: "LATEX MEXICANA",
        folio: "RA-303",
        fecha_emision: "2026-09-24",
        monto_original: 12903.84,
        saldo_pendiente: 12903.84,
      }),
      row({
        entidad_id: "c:2",
        entidad_nombre: "RECAL ESTRUCTURAS",
        folio: "RA-304",
        fecha_emision: "2026-09-30",
        fecha_ingreso_cobranza: "2026-09-30",
        fecha_vencimiento: "2026-10-21",
        monto_original: 545664,
        saldo_pendiente: 545664,
      }),
    ]);
    const doc = buildAccountStatementPdf({
      titulo: "Saldos de Clientes",
      fechaCorte: "2026-10-01",
      alcanceLabel: "ACTIVOS",
      entidadEtiqueta: "CLIENTE",
      seleccionLabel: null,
      empresaLineas: ["GOCAL TRANSPORTACIONES"],
      grupos,
      totales,
      generadoEn: new Date("2026-10-01T15:25:00"),
    });
    const text = pdfText(doc);
    expect(text).toContain("Saldos de Clientes");
    expect(text).toContain("LATEX MEXICANA");
    expect(text).toContain("RECAL ESTRUCTURAS");
    expect(text).toContain("Totales por cliente:");
    expect(text).toContain("Totales del reporte:");
    expect(text).toContain("Fecha: 01/10/2026");
    expect(text).toContain("-20");
    expect(doc.getNumberOfPages()).toBeGreaterThan(0);
  });
});
