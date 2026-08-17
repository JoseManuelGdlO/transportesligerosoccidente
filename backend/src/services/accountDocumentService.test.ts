import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { AccountDocument, AccountDocumentPayment, Supplier } from "../models";
import {
  assertMaintenanceCxpSyncAllowed,
  computeAgingBucket,
  computeDisplayEstatus,
  daysBetween,
  planMaintenanceCxpSync,
  resolveDueDate,
  toDocumentDto,
  upsertFromMaintenance,
} from "./accountDocumentService";
import type { AccountDocument as AccountDocumentModel } from "../models/AccountDocument";
import type { AccountDocumentPayment as AccountDocumentPaymentModel } from "../models/AccountDocumentPayment";
import type { MaintenanceRecord } from "../models/MaintenanceRecord";

function stubDoc(
  overrides: Partial<{
    estatus: "abierta" | "pagada" | "cancelada";
    fecha_vencimiento: string | null;
    monto_original: string;
    fecha_emision: string;
  }> = {},
): AccountDocumentModel {
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
  } as AccountDocumentModel;
}

function stubPay(monto: string, fecha = "2026-02-01"): AccountDocumentPaymentModel {
  return {
    id: "pay-1",
    tenant_id: "t1",
    document_id: "doc-1",
    monto,
    fecha,
  } as AccountDocumentPaymentModel;
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
    assert.deepEqual(dto.conceptos, []);
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

describe("planMaintenanceCxpSync", () => {
  const abierta = { estatus: "abierta" };

  it("cancela CXP si monto <= 0 y no hay abonos", () => {
    assert.deepEqual(planMaintenanceCxpSync(0, abierta, 0, 0), { action: "cancel" });
  });

  it("rechaza monto <= 0 si hay abonos", () => {
    const plan = planMaintenanceCxpSync(0, abierta, 100, 1);
    assert.equal(plan.action, "reject");
    if (plan.action === "reject") {
      assert.match(plan.message, /0\/negativo/);
    }
  });

  it("rechaza monto menor a abonos y no deja el CXP intacto en silencio", () => {
    const plan = planMaintenanceCxpSync(50, abierta, 100, 1);
    assert.equal(plan.action, "reject");
    if (plan.action === "reject") {
      assert.match(plan.message, /menor a los abonos/);
    }
  });

  it("no toca CXP cancelado o inexistente cuando el monto es 0", () => {
    assert.deepEqual(planMaintenanceCxpSync(0, null, 0, 0), { action: "noop" });
    assert.deepEqual(planMaintenanceCxpSync(0, { estatus: "cancelada" }, 0, 0), {
      action: "noop",
    });
  });

  it("permite upsert si el monto cubre los abonos", () => {
    assert.deepEqual(planMaintenanceCxpSync(150, abierta, 100, 1), { action: "upsert" });
  });
});

describe("assertMaintenanceCxpSyncAllowed / upsertFromMaintenance", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("assert lanza 400 si el nuevo monto es menor a los abonos", async () => {
    mock.method(AccountDocument, "findOne", async () => ({
      id: "cxp-1",
      estatus: "abierta",
    }) as never);
    mock.method(AccountDocumentPayment, "findAll", async () => [{ monto: "400" }] as never);

    await assert.rejects(
      () => assertMaintenanceCxpSyncAllowed("t1", "mant-1", 100),
      (err: Error & { status?: number }) => {
        assert.equal(err.status, 400);
        assert.match(err.message, /menor a los abonos/);
        return true;
      },
    );
  });

  it("assert lanza 400 si se baja a 0 con abonos", async () => {
    mock.method(AccountDocument, "findOne", async () => ({
      id: "cxp-1",
      estatus: "abierta",
    }) as never);
    mock.method(AccountDocumentPayment, "findAll", async () => [{ monto: "50" }] as never);

    await assert.rejects(
      () => assertMaintenanceCxpSyncAllowed("t1", "mant-1", 0),
      (err: Error & { status?: number }) => {
        assert.equal(err.status, 400);
        assert.match(err.message, /0\/negativo/);
        return true;
      },
    );
  });

  it("upsertFromMaintenance cancela el CXP si el monto queda en 0 sin abonos", async () => {
    const doc = {
      id: "cxp-1",
      tenant_id: "t1",
      tipo: "cxp" as const,
      entidad_nombre: "Taller",
      folio: "F-1",
      concepto: "Mantenimiento menor: Ajuste",
      fecha_emision: "2026-01-01",
      plazo_credito_dias: null as number | null,
      fecha_vencimiento: null as string | null,
      monto_original: "400",
      estatus: "abierta" as "abierta" | "pagada" | "cancelada",
      origen: "mantenimiento" as const,
      maintenance_record_id: "mant-1",
      update: async (patch: Record<string, unknown>) => {
        Object.assign(doc, patch);
      },
    };
    mock.method(AccountDocument, "findOne", async () => doc as never);
    mock.method(AccountDocumentPayment, "findAll", async () => [] as never);

    const dto = await upsertFromMaintenance({
      id: "mant-1",
      tenant_id: "t1",
      tipo: "menor",
      num_factura: "F-1",
      conceptos: [{ descripcion: "Ajuste", precio: 0 }],
      fecha: "2026-01-01",
      supplier_id: null,
      taller: "Taller",
    } as MaintenanceRecord);

    assert.equal(doc.estatus, "cancelada");
    assert.equal(dto?.estatus, "cancelada");
  });

  it("upsertFromMaintenance reabre y actualiza un CXP cancelado al volver a monto positivo", async () => {
    const doc = {
      id: "cxp-1",
      tenant_id: "t1",
      tipo: "cxp" as const,
      client_id: null,
      supplier_id: "supplier-1",
      entidad_nombre: "Taller anterior",
      folio: "F-OLD",
      concepto: "Mantenimiento menor: Ajuste anterior",
      conceptos: [{ descripcion: "Ajuste anterior", precio: 0 }],
      fecha_emision: "2026-01-01",
      plazo_credito_dias: null as number | null,
      fecha_vencimiento: null as string | null,
      monto_original: "0",
      estatus: "cancelada" as "abierta" | "pagada" | "cancelada",
      origen: "mantenimiento" as const,
      maintenance_record_id: "mant-1",
      update: async (patch: Record<string, unknown>) => {
        Object.assign(doc, patch);
      },
    };
    const supplier = {
      id: "supplier-1",
      razon_social: "Taller actualizado",
      dias_credito: 15,
    };
    mock.method(AccountDocument, "findOne", async () => doc as never);
    mock.method(AccountDocumentPayment, "findAll", async () => [] as never);
    mock.method(Supplier, "findByPk", async () => supplier as never);
    mock.method(Supplier, "findOne", async () => supplier as never);

    const dto = await upsertFromMaintenance({
      id: "mant-1",
      tenant_id: "t1",
      tipo: "menor",
      num_factura: "F-NEW",
      conceptos: [{ descripcion: "Ajuste nuevo", precio: 250 }],
      fecha: "2026-02-01",
      supplier_id: "supplier-1",
      taller: "Taller actualizado",
    } as MaintenanceRecord);

    assert.equal(doc.estatus, "abierta");
    assert.equal(doc.folio, "F-NEW");
    assert.equal(doc.monto_original, "250");
    assert.deepEqual(doc.conceptos, [{ descripcion: "Ajuste nuevo", precio: 250 }]);
    assert.equal(dto?.estatus, "abierta");
    assert.equal(dto?.monto_original, 250);
  });

  it("upsertFromMaintenance lanza 400 si el monto es menor a los abonos", async () => {
    mock.method(AccountDocument, "findOne", async () => ({
      id: "cxp-1",
      estatus: "abierta",
    }) as never);
    mock.method(AccountDocumentPayment, "findAll", async () => [{ monto: "400" }] as never);

    await assert.rejects(
      () =>
        upsertFromMaintenance({
          id: "mant-1",
          tenant_id: "t1",
          tipo: "menor",
          conceptos: [{ descripcion: "Ajuste", precio: 100 }],
          fecha: "2026-01-01",
          supplier_id: null,
          taller: "Taller",
        } as MaintenanceRecord),
      (err: Error & { status?: number }) => {
        assert.equal(err.status, 400);
        assert.match(err.message, /menor a los abonos/);
        return true;
      },
    );
  });
});
