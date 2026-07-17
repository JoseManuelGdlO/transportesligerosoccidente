import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import {
  sequelize,
  Driver,
  DriverAccount,
  DriverAccountItem,
  DriverAccountMovement,
} from "../models";
import {
  createAccountItem,
  createDirectPayment,
  applySettlementAccountInstallments,
} from "./driverAccountService";
import type { AccountApplication } from "./calc";

const tenantId = "tenant-1";
const otherTenantId = "tenant-2";
const driverId = "driver-1";

const mockTx = { LOCK: { UPDATE: "UPDATE" } };

function mockTransaction() {
  return mock.method(sequelize, "transaction", async (fn: (t: unknown) => Promise<unknown>) => fn(mockTx));
}

const mockDriver = { id: driverId, tenant_id: tenantId, nombre: "Operador Test" };

const baseItem = () => ({
  id: "item-1",
  tenant_id: tenantId,
  account_id: "acc-1",
  driver_id: driverId,
  tipo: "incidencia",
  concepto: "Llanta",
  monto_original: "3000",
  cuota_liquidacion: "500",
  fecha: "2026-06-01",
  estatus: "activo",
  movements: [{ monto: "500" }],
  update: mock.fn(async (..._args: unknown[]) => {}),
});

describe("createDirectPayment", () => {
  it("registra abono parcial sin liquidar el adeudo", async () => {
    const driverFindOne = mock.method(Driver, "findOne", async () => mockDriver as never);
    const transaction = mockTransaction();
    const item = baseItem();
    const itemFindOne = mock.method(DriverAccountItem, "findOne", async () => item as never);
    const movementCreate = mock.method(DriverAccountMovement, "create", async (data: unknown) => data as never);

    const result = await createDirectPayment(tenantId, driverId, "item-1", {
      monto: 1000,
      fecha: "2026-06-05",
    });

    // Saldo antes: 3000 - 500 abonado = 2500; tras el abono de 1000 quedan 1500
    assert.equal(result.saldo_despues, 1500);
    assert.equal(result.tipo, "pago_directo");
    assert.equal(item.update.mock.callCount(), 0);
    const created = movementCreate.mock.calls[0].arguments[0] as Record<string, unknown>;
    assert.equal(created.tenant_id, tenantId);
    assert.equal(created.monto, 1000);
    assert.equal(created.settlement_id, null);

    driverFindOne.mock.restore();
    transaction.mock.restore();
    itemFindOne.mock.restore();
    movementCreate.mock.restore();
  });

  it("marca el adeudo como liquidado cuando el abono agota el saldo", async () => {
    const driverFindOne = mock.method(Driver, "findOne", async () => mockDriver as never);
    const transaction = mockTransaction();
    const item = baseItem();
    const itemFindOne = mock.method(DriverAccountItem, "findOne", async () => item as never);
    const movementCreate = mock.method(DriverAccountMovement, "create", async (data: unknown) => data as never);

    const result = await createDirectPayment(tenantId, driverId, "item-1", {
      monto: 2500,
      fecha: "2026-06-05",
    });

    assert.equal(result.saldo_despues, 0);
    assert.equal(item.update.mock.callCount(), 1);
    assert.deepEqual(item.update.mock.calls[0].arguments[0], { estatus: "liquidado" });

    driverFindOne.mock.restore();
    transaction.mock.restore();
    itemFindOne.mock.restore();
    movementCreate.mock.restore();
  });

  it("rechaza con 400 un abono que excede el saldo pendiente", async () => {
    const driverFindOne = mock.method(Driver, "findOne", async () => mockDriver as never);
    const transaction = mockTransaction();
    const item = baseItem();
    const itemFindOne = mock.method(DriverAccountItem, "findOne", async () => item as never);
    const movementCreate = mock.method(DriverAccountMovement, "create", async () => {
      throw new Error("no debería crear movimiento");
    });

    await assert.rejects(
      () => createDirectPayment(tenantId, driverId, "item-1", { monto: 2600, fecha: "2026-06-05" }),
      (err: Error & { status?: number }) => {
        assert.equal(err.status, 400);
        return true;
      },
    );
    assert.equal(movementCreate.mock.callCount(), 0);

    driverFindOne.mock.restore();
    transaction.mock.restore();
    itemFindOne.mock.restore();
    movementCreate.mock.restore();
  });

  it("rechaza con 404 cuando el operador pertenece a otro tenant", async () => {
    const driverFindOne = mock.method(
      Driver,
      "findOne",
      async (opts: { where?: { tenant_id?: string } }) =>
        (opts?.where?.tenant_id === tenantId ? mockDriver : null) as never,
    );

    await assert.rejects(
      () => createDirectPayment(otherTenantId, driverId, "item-1", { monto: 100, fecha: "2026-06-05" }),
      (err: Error & { status?: number }) => {
        assert.equal(err.status, 404);
        assert.equal(err.message, "Operador no encontrado");
        return true;
      },
    );

    driverFindOne.mock.restore();
  });

  it("no permite abonar un adeudo de otro tenant aunque el id exista", async () => {
    // Ambos tenants tienen operador válido, pero el adeudo solo existe en tenant-1
    const driverFindOne = mock.method(Driver, "findOne", async () => mockDriver as never);
    const transaction = mockTransaction();
    const item = baseItem();
    const itemFindOne = mock.method(
      DriverAccountItem,
      "findOne",
      async (opts: { where?: { tenant_id?: string } }) =>
        (opts?.where?.tenant_id === tenantId ? item : null) as never,
    );

    await assert.rejects(
      () => createDirectPayment(otherTenantId, driverId, "item-1", { monto: 100, fecha: "2026-06-05" }),
      (err: Error & { status?: number }) => {
        assert.equal(err.status, 404);
        assert.equal(err.message, "Adeudo no encontrado o no activo");
        return true;
      },
    );
    const queriedWhere = itemFindOne.mock.calls[0].arguments[0]?.where as { tenant_id?: string };
    assert.equal(queriedWhere.tenant_id, otherTenantId);

    driverFindOne.mock.restore();
    transaction.mock.restore();
    itemFindOne.mock.restore();
  });
});

describe("createAccountItem", () => {
  it("rechaza con 400 una cuota mayor al importe original", async () => {
    const driverFindOne = mock.method(Driver, "findOne", async () => mockDriver as never);

    await assert.rejects(
      () =>
        createAccountItem(tenantId, driverId, {
          tipo: "incidencia",
          concepto: "Llanta",
          monto_original: 1000,
          cuota_liquidacion: 1500,
          fecha: "2026-06-01",
        }),
      (err: Error & { status?: number }) => {
        assert.equal(err.status, 400);
        return true;
      },
    );

    driverFindOne.mock.restore();
  });
});

describe("applySettlementAccountInstallments", () => {
  const application: AccountApplication = {
    item_id: "item-1",
    tipo: "incidencia",
    concepto: "Llanta",
    monto: 500,
    saldo_antes: 3000,
    saldo_despues: 2500,
  };

  it("es idempotente: no duplica movimientos ya aplicados en el mismo cierre", async () => {
    const accountFindOne = mock.method(DriverAccount, "findOne", async () => ({ id: "acc-1" }) as never);
    const movementFindAll = mock.method(
      DriverAccountMovement,
      "findAll",
      async () => [{ id: "mov-existente" }] as never,
    );
    const movementCreate = mock.method(DriverAccountMovement, "create", async () => {
      throw new Error("no debería crear movimiento");
    });
    const itemFindAll = mock.method(DriverAccountItem, "findAll", async () => [] as never);

    await applySettlementAccountInstallments(
      tenantId,
      driverId,
      "settlement-1",
      "2026-06-07",
      [application],
      mockTx as never,
    );

    assert.equal(movementCreate.mock.callCount(), 0);
    assert.equal(itemFindAll.mock.callCount(), 0);

    accountFindOne.mock.restore();
    movementFindAll.mock.restore();
    movementCreate.mock.restore();
    itemFindAll.mock.restore();
  });

  it("limita el movimiento al saldo real si hubo un pago directo simultáneo", async () => {
    const accountFindOne = mock.method(DriverAccount, "findOne", async () => ({ id: "acc-1" }) as never);
    const movementFindAll = mock.method(DriverAccountMovement, "findAll", async () => [] as never);
    const movementCreate = mock.method(DriverAccountMovement, "create", async (data: unknown) => data as never);
    // El preview vio saldo 3000, pero un pago directo dejó el saldo real en 100
    const item = { ...baseItem(), movements: [{ monto: "2900" }], update: mock.fn(async (..._args: unknown[]) => {}) };
    const itemFindAll = mock.method(DriverAccountItem, "findAll", async () => [item] as never);

    await applySettlementAccountInstallments(
      tenantId,
      driverId,
      "settlement-1",
      "2026-06-07",
      [application],
      mockTx as never,
    );

    assert.equal(movementCreate.mock.callCount(), 1);
    const created = movementCreate.mock.calls[0].arguments[0] as { monto: number; settlement_id: string };
    assert.equal(created.monto, 100);
    assert.equal(created.settlement_id, "settlement-1");
    // El saldo quedó en cero: el adeudo se marca liquidado
    assert.equal(item.update.mock.callCount(), 1);
    assert.deepEqual(item.update.mock.calls[0].arguments[0], { estatus: "liquidado" });

    accountFindOne.mock.restore();
    movementFindAll.mock.restore();
    movementCreate.mock.restore();
    itemFindAll.mock.restore();
  });
});
