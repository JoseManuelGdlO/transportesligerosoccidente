import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  computeAgingBucket,
  computeDisplayEstatus,
  daysBetween,
  resolveDueDate,
  toDocumentDto,
} from "./accountDocumentService";
import type { AccountDocument } from "../models/AccountDocument";
import type { AccountDocumentPayment } from "../models/AccountDocumentPayment";

function stubDoc(
  overrides: Partial<{
    estatus: "abierta" | "pagada" | "cancelada";
    fecha_vencimiento: string | null;
    monto_original: string;
    fecha_emision: string;
  }> = {},
): AccountDocument {
  return {
    id: "doc-1",
    tenant_id: "t1",
    tipo: "cxc",
    entidad_nombre: "Cliente",
    folio: "F-1",
    concepto: "Servicio",
    fecha_emision: overrides.fecha_emision ?? "2026-01-01",
    plazo_credito_dias: 30,
    fecha_vencimiento:
      overrides.fecha_vencimiento !== undefined ? overrides.fecha_vencimiento : "2026-01-31",
    monto_original: overrides.monto_original ?? "1000",
    estatus: overrides.estatus ?? "abierta",
    origen: "manual",
  } as AccountDocument;
}

function stubPay(monto: string, fecha = "2026-02-01"): AccountDocumentPayment {
  return {
    id: "pay-1",
    tenant_id: "t1",
    document_id: "doc-1",
    monto,
    fecha,
  } as AccountDocumentPayment;
}

describe("accountDocumentService aging/saldo", () => {
  it("daysBetween calcula días calendario", () => {
    assert.equal(daysBetween("2026-01-01", "2026-01-31"), 30);
    assert.equal(daysBetween("2026-01-31", "2026-02-01"), 1);
  });

  it("resolveDueDate suma plazo o null", () => {
    assert.equal(resolveDueDate("2026-01-01", 15), "2026-01-16");
    assert.equal(resolveDueDate("2026-01-01", null), null);
    assert.equal(resolveDueDate("2026-01-01", undefined), null);
  });

  it("bucket corriente si no hay vencimiento o aún no vence", () => {
    assert.equal(
      computeAgingBucket(stubDoc({ fecha_vencimiento: null }), 100, "2026-03-01"),
      "corriente",
    );
    assert.equal(
      computeAgingBucket(stubDoc({ fecha_vencimiento: "2026-03-10" }), 100, "2026-03-01"),
      "corriente",
    );
    assert.equal(
      computeAgingBucket(stubDoc({ fecha_vencimiento: "2026-03-01" }), 100, "2026-03-01"),
      "corriente",
    );
  });

  it("buckets de vencido 1-30, 31-60 y 90+", () => {
    assert.equal(
      computeAgingBucket(stubDoc({ fecha_vencimiento: "2026-02-01" }), 100, "2026-02-15"),
      "1-30",
    );
    assert.equal(
      computeAgingBucket(stubDoc({ fecha_vencimiento: "2026-01-01" }), 100, "2026-02-15"),
      "31-60",
    );
    assert.equal(
      computeAgingBucket(stubDoc({ fecha_vencimiento: "2025-11-01" }), 100, "2026-02-15"),
      "90+",
    );
  });

  it("sin bucket si pagada, cancelada o saldo 0", () => {
    assert.equal(computeAgingBucket(stubDoc({ estatus: "pagada" }), 0, "2026-03-01"), null);
    assert.equal(computeAgingBucket(stubDoc({ estatus: "cancelada" }), 100, "2026-03-01"), null);
    assert.equal(computeAgingBucket(stubDoc(), 0, "2026-03-01"), null);
  });

  it("display estatus deriva Al día / Vencida / Pagada / Cancelada", () => {
    assert.equal(computeDisplayEstatus("abierta", "corriente"), "Al día");
    assert.equal(computeDisplayEstatus("abierta", "1-30"), "Vencida");
    assert.equal(computeDisplayEstatus("pagada", null), "Pagada");
    assert.equal(computeDisplayEstatus("cancelada", null), "Cancelada");
  });

  it("toDocumentDto calcula abonos y saldo", () => {
    const dto = toDocumentDto(
      stubDoc({ monto_original: "1000.00" }),
      [stubPay("250"), stubPay("100")],
      "2026-02-01",
    );
    assert.equal(dto.abonos, 350);
    assert.equal(dto.saldo_pendiente, 650);
    assert.equal(dto.estatus_display, "Vencida");
    assert.equal(dto.aging_bucket, "1-30");
  });

  it("toDocumentDto marca Al día con saldo y sin vencimiento", () => {
    const dto = toDocumentDto(
      stubDoc({ fecha_vencimiento: null, monto_original: "500" }),
      [],
      "2026-06-01",
    );
    assert.equal(dto.saldo_pendiente, 500);
    assert.equal(dto.estatus_display, "Al día");
    assert.equal(dto.aging_bucket, "corriente");
  });

  it("idempotencia conceptual: misma fuente no duplica bucket al recalcular", () => {
    const first = toDocumentDto(stubDoc({ monto_original: "1000" }), [], "2026-02-10");
    const second = toDocumentDto(stubDoc({ monto_original: "1000" }), [], "2026-02-10");
    assert.equal(first.aging_bucket, second.aging_bucket);
    assert.equal(first.saldo_pendiente, second.saldo_pendiente);
  });
});
