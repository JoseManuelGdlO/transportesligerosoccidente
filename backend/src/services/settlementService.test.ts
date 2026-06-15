import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import { Driver, Trip, Settlement, DriverAdvance, DriverDiscount } from "../models";
import {
  createDraftSettlement,
  updateDraftSettlement,
  deleteDraftSettlement,
  settlementSummary,
  closeSettlement,
  closeSettlementById,
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

const mockTrip = (overrides: Record<string, unknown>) => ({
  id: "trip-1",
  tenant_id: tenantId,
  driver_id: driverId,
  folio: "TL001-1",
  truck_id: "truck-1",
  client_id: "client-1",
  origen: "A",
  destino: "B",
  fecha_salida: "2026-06-03",
  km_inicial: 0,
  km_final: 100,
  tarifa: 1000,
  viaticos_entregados: 0,
  tipo_viaje: "local",
  fuel: [],
  expenses: [],
  ...overrides,
});

describe("settlementSummary trip inclusions", () => {
  it("incluye viajes pendientes anteriores al periodo con en_periodo false", async () => {
    const deps = mockSummaryDeps();
    const carryOver = mockTrip({ id: "trip-carry", folio: "TL000-1", fecha_salida: "2026-05-28" });
    const inPeriod = mockTrip({ id: "trip-in", folio: "TL001-1", fecha_salida: "2026-06-03" });
    deps.tripFindAll.mock.mockImplementation(async () => [carryOver, inPeriod] as never);

    const summary = await settlementSummary(tenantId, driverId, fechaInicio, fechaFin);
    const trips = summary.trips as { id: string; en_periodo?: boolean; included?: boolean }[];

    assert.equal(trips.length, 2);
    const carry = trips.find((t) => t.id === "trip-carry");
    const current = trips.find((t) => t.id === "trip-in");
    assert.equal(carry?.en_periodo, false);
    assert.equal(current?.en_periodo, true);
    assert.equal(carry?.included, true);
    assert.equal(current?.included, true);

    restoreSummaryDeps(deps);
  });

  it("respeta trip_inclusions al calcular totales y flags", async () => {
    const deps = mockSummaryDeps();
    const tripA = mockTrip({ id: "trip-a", tarifa: 1000 });
    const tripB = mockTrip({ id: "trip-b", folio: "TL002-1", tarifa: 2000 });
    deps.tripFindAll.mock.mockImplementation(async () => [tripA, tripB] as never);

    const summary = await settlementSummary(tenantId, driverId, fechaInicio, fechaFin, [
      { id: "trip-a", included: true },
      { id: "trip-b", included: false },
    ]);
    const trips = summary.trips as { id: string; included?: boolean }[];

    assert.equal(trips.find((t) => t.id === "trip-a")?.included, true);
    assert.equal(trips.find((t) => t.id === "trip-b")?.included, false);
    assert.equal(summary.total_comisiones, 100);

    restoreSummaryDeps(deps);
  });
});

describe("closeSettlement trip inclusions", () => {
  it("liquida solo viajes incluidos", async () => {
    const deps = mockSummaryDeps();
    const tripA = mockTrip({ id: "trip-a" });
    const tripB = mockTrip({ id: "trip-b", folio: "TL002-1" });
    deps.tripFindAll.mock.mockImplementation(async () => [tripA, tripB] as never);

    const tripUpdate = mock.method(Trip, "update", async () => [1] as never);
    const settlementFindOne = mock.method(Settlement, "findOne", async () => null);
    const settlementCreate = mock.method(Settlement, "create", async (data: unknown) => ({
      ...(data as object),
      id: "settlement-1",
    }) as never);

    await closeSettlement(tenantId, driverId, fechaInicio, fechaFin, undefined, [
      { id: "trip-a", included: true },
      { id: "trip-b", included: false },
    ]);

    assert.equal(tripUpdate.mock.callCount(), 1);
    const updateArgs = tripUpdate.mock.calls[0].arguments[0] as { settlement_id: string };
    const updateWhere = tripUpdate.mock.calls[0].arguments[1] as { where: { id: Record<symbol, string[]> } };
    const inKey = Object.getOwnPropertySymbols(updateWhere.where.id)[0];
    assert.equal(updateArgs.settlement_id, "settlement-1");
    assert.deepEqual(updateWhere.where.id[inKey], ["trip-a"]);

    restoreSummaryDeps(deps);
    tripUpdate.mock.restore();
    settlementFindOne.mock.restore();
    settlementCreate.mock.restore();
  });

  it("mantiene viaje excluido disponible en el periodo siguiente", async () => {
    const deps = mockSummaryDeps();
    const excluded = mockTrip({ id: "trip-excluded", fecha_salida: "2026-06-03" });
    deps.tripFindAll.mock.mockImplementation(async () => [excluded] as never);

    const nextPeriodSummary = await settlementSummary(
      tenantId,
      driverId,
      "2026-06-08",
      "2026-06-14",
    );
    const trips = nextPeriodSummary.trips as { id: string; en_periodo?: boolean }[];

    assert.equal(trips.length, 1);
    assert.equal(trips[0]?.id, "trip-excluded");
    assert.equal(trips[0]?.en_periodo, false);

    restoreSummaryDeps(deps);
  });

  it("no usa snapshot del borrador cuando trip_inclusions es un arreglo vacío explícito", async () => {
    const deps = mockSummaryDeps();
    const tripA = mockTrip({ id: "trip-a" });
    const tripB = mockTrip({ id: "trip-b", folio: "TL002-1" });
    deps.tripFindAll.mock.mockImplementation(async () => [tripA, tripB] as never);

    const draftRow = {
      id: "draft-1",
      tenant_id: tenantId,
      driver_id: driverId,
      fecha_inicio: fechaInicio,
      fecha_fin: fechaFin,
      cerrado: false,
      snapshot: {
        trips: [
          { id: "trip-a", included: true },
          { id: "trip-b", included: false },
        ],
      },
      update: mock.fn(async () => {}),
    };

    const settlementFindOne = mock.method(Settlement, "findOne", async (opts: { where?: Record<string, unknown> }) => {
      const where = opts?.where ?? {};
      if (where.id === "draft-1" && where.cerrado === false) return draftRow as never;
      if (where.cerrado === true) return null;
      return null;
    });
    const tripUpdate = mock.method(Trip, "update", async () => [1] as never);

    await closeSettlement(tenantId, driverId, fechaInicio, fechaFin, "draft-1", []);

    assert.equal(tripUpdate.mock.callCount(), 1);
    const updateWhere = tripUpdate.mock.calls[0].arguments[1] as { where: { id: Record<symbol, string[]> } };
    const inKey = Object.getOwnPropertySymbols(updateWhere.where.id)[0];
    assert.deepEqual(updateWhere.where.id[inKey].sort(), ["trip-a", "trip-b"]);

    restoreSummaryDeps(deps);
    settlementFindOne.mock.restore();
    tripUpdate.mock.restore();
  });
});

describe("createDraftSettlement with trip inclusions", () => {
  it("guarda included en el snapshot del borrador", async () => {
    const deps = mockSummaryDeps();
    const tripA = mockTrip({ id: "trip-a" });
    const tripB = mockTrip({ id: "trip-b", folio: "TL002-1" });
    deps.tripFindAll.mock.mockImplementation(async () => [tripA, tripB] as never);

    const settlementFindOne = mock.method(Settlement, "findOne", async () => null);
    let savedSnapshot: Record<string, unknown> | undefined;
    const settlementCreate = mock.method(Settlement, "create", async (data: unknown) => {
      savedSnapshot = (data as { snapshot: Record<string, unknown> }).snapshot;
      return { ...(data as object), id: "draft-1" } as never;
    });

    await createDraftSettlement(tenantId, driverId, fechaInicio, fechaFin, [
      { id: "trip-a", included: true },
      { id: "trip-b", included: false },
    ]);

    const trips = (savedSnapshot?.trips ?? []) as { id: string; included?: boolean }[];
    assert.equal(trips.find((t) => t.id === "trip-b")?.included, false);

    restoreSummaryDeps(deps);
    settlementFindOne.mock.restore();
    settlementCreate.mock.restore();
  });
});

describe("closeSettlementById", () => {
  it("usa inclusiones del snapshot del borrador al cerrar", async () => {
    const deps = mockSummaryDeps();
    const tripA = mockTrip({ id: "trip-a" });
    const tripB = mockTrip({ id: "trip-b", folio: "TL002-1" });
    deps.tripFindAll.mock.mockImplementation(async () => [tripA, tripB] as never);

    const draftRow = {
      id: "draft-1",
      tenant_id: tenantId,
      driver_id: driverId,
      fecha_inicio: fechaInicio,
      fecha_fin: fechaFin,
      cerrado: false,
      snapshot: {
        trips: [
          { id: "trip-a", included: true },
          { id: "trip-b", included: false },
        ],
      },
      update: mock.fn(async () => {}),
    };

    const settlementFindOne = mock.method(Settlement, "findOne", async (opts: { where?: Record<string, unknown> }) => {
      const where = opts?.where ?? {};
      if (where.id === "draft-1" && where.cerrado === false) return draftRow as never;
      if (where.cerrado === true) return null;
      return null;
    });
    const tripUpdate = mock.method(Trip, "update", async () => [1] as never);

    await closeSettlementById(tenantId, "draft-1");

    assert.equal(tripUpdate.mock.callCount(), 1);
    const updateWhere = tripUpdate.mock.calls[0].arguments[1] as { where: { id: Record<symbol, string[]> } };
    const inKey = Object.getOwnPropertySymbols(updateWhere.where.id)[0];
    assert.deepEqual(updateWhere.where.id[inKey], ["trip-a"]);
    assert.equal(draftRow.update.mock.callCount(), 1);

    restoreSummaryDeps(deps);
    settlementFindOne.mock.restore();
    tripUpdate.mock.restore();
  });
});
