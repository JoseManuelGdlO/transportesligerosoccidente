import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import { Driver, Trip, Settlement, DriverAdvance, DriverDiscount } from "../models";
import {
  createDraftSettlement,
  updateDraftSettlement,
  deleteDraftSettlement,
} from "./settlementService";

const tenantId = "tenant-1";
const driverId = "driver-1";
const fechaInicio = "2026-06-01";
const fechaFin = "2026-06-07";

const mockDriver = {
  id: driverId,
  nombre: "Operador Test",
  comision_tipo: "porcentaje",
  comision_valor: 10,
  comision_valor_local: 10,
  comision_valor_foraneo: 15,
  estatus: "activo",
};

function mockSummaryDeps() {
  const driverFindOne = mock.method(Driver, "findOne", async () => mockDriver as never);
  const tripFindAll = mock.method(Trip, "findAll", async () => [] as never);
  const advanceFindAll = mock.method(DriverAdvance, "findAll", async () => [] as never);
  const discountFindAll = mock.method(DriverDiscount, "findAll", async () => [] as never);
  return { driverFindOne, tripFindAll, advanceFindAll, discountFindAll };
}

function restoreSummaryDeps(deps: ReturnType<typeof mockSummaryDeps>) {
  deps.driverFindOne.mock.restore();
  deps.tripFindAll.mock.restore();
  deps.advanceFindAll.mock.restore();
  deps.discountFindAll.mock.restore();
}

describe("createDraftSettlement", () => {
  it("crea borrador cuando no existe uno abierto", async () => {
    const deps = mockSummaryDeps();
    const settlementFindOne = mock.method(Settlement, "findOne", async () => null);
    const settlementCreate = mock.method(Settlement, "create", async (data: unknown) => data as never);

    const row = await createDraftSettlement(tenantId, driverId, fechaInicio, fechaFin);

    assert.equal(settlementFindOne.mock.callCount(), 1);
    assert.equal(settlementCreate.mock.callCount(), 1);
    assert.equal((row as { driver_id: string }).driver_id, driverId);
    assert.equal((row as { cerrado: boolean }).cerrado, false);

    restoreSummaryDeps(deps);
    settlementFindOne.mock.restore();
    settlementCreate.mock.restore();
  });

  it("actualiza snapshot si ya existe borrador abierto (deduplicación)", async () => {
    const deps = mockSummaryDeps();
    const update = mock.fn(async () => {});
    const existing = {
      id: "draft-1",
      tenant_id: tenantId,
      driver_id: driverId,
      fecha_inicio: fechaInicio,
      fecha_fin: fechaFin,
      cerrado: false,
      update,
    };
    const settlementFindOne = mock.method(Settlement, "findOne", async () => existing as never);
    const settlementCreate = mock.method(Settlement, "create", async () => {
      throw new Error("create no debería llamarse");
    });

    const row = await createDraftSettlement(tenantId, driverId, fechaInicio, fechaFin);

    assert.equal(settlementFindOne.mock.callCount(), 1);
    assert.equal(settlementCreate.mock.callCount(), 0);
    assert.equal(update.mock.callCount(), 1);
    assert.equal(row, existing);

    restoreSummaryDeps(deps);
    settlementFindOne.mock.restore();
    settlementCreate.mock.restore();
  });
});

describe("updateDraftSettlement", () => {
  it("refresca snapshot de borrador abierto", async () => {
    const deps = mockSummaryDeps();
    const update = mock.fn(async () => {});
    const row = {
      id: "draft-1",
      tenant_id: tenantId,
      driver_id: driverId,
      fecha_inicio: fechaInicio,
      fecha_fin: fechaFin,
      cerrado: false,
      update,
    };
    const settlementFindOne = mock.method(Settlement, "findOne", async () => row as never);

    const result = await updateDraftSettlement(tenantId, "draft-1");

    assert.equal(settlementFindOne.mock.callCount(), 1);
    assert.equal(update.mock.callCount(), 1);
    assert.equal(result, row);

    restoreSummaryDeps(deps);
    settlementFindOne.mock.restore();
  });

  it("rechaza con 404 si no encuentra borrador abierto", async () => {
    const settlementFindOne = mock.method(Settlement, "findOne", async () => null);

    await assert.rejects(
      () => updateDraftSettlement(tenantId, "missing"),
      (err: Error & { status?: number }) => {
        assert.equal(err.status, 404);
        assert.equal(err.message, "Pre-liquidación no encontrada");
        return true;
      },
    );

    settlementFindOne.mock.restore();
  });
});

describe("deleteDraftSettlement", () => {
  it("elimina borrador abierto", async () => {
    const destroy = mock.fn(async () => {});
    const row = {
      id: "draft-1",
      tenant_id: tenantId,
      cerrado: false,
      destroy,
    };
    const settlementFindOne = mock.method(Settlement, "findOne", async () => row as never);

    await deleteDraftSettlement(tenantId, "draft-1");

    assert.equal(destroy.mock.callCount(), 1);

    settlementFindOne.mock.restore();
  });

  it("rechaza con 409 al intentar eliminar liquidación cerrada", async () => {
    const destroy = mock.fn(async () => {});
    const row = {
      id: "closed-1",
      tenant_id: tenantId,
      cerrado: true,
      destroy,
    };
    const settlementFindOne = mock.method(Settlement, "findOne", async () => row as never);

    await assert.rejects(
      () => deleteDraftSettlement(tenantId, "closed-1"),
      (err: Error & { status?: number }) => {
        assert.equal(err.status, 409);
        assert.equal(err.message, "No se puede eliminar una liquidación cerrada");
        return true;
      },
    );

    assert.equal(destroy.mock.callCount(), 0);

    settlementFindOne.mock.restore();
  });

  it("rechaza con 404 si no encuentra la liquidación", async () => {
    const settlementFindOne = mock.method(Settlement, "findOne", async () => null);

    await assert.rejects(
      () => deleteDraftSettlement(tenantId, "missing"),
      (err: Error & { status?: number }) => {
        assert.equal(err.status, 404);
        assert.equal(err.message, "Pre-liquidación no encontrada");
        return true;
      },
    );

    settlementFindOne.mock.restore();
  });
});
