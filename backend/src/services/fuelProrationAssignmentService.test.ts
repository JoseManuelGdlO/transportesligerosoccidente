import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import { Op } from "sequelize";
import {
  FuelProrationAssignment,
  FuelTicket,
  Trip,
  Truck,
  sequelize,
} from "../models";
import type { FuelTicket as FuelTicketModel } from "../models/FuelTicket";
import type { Trip as TripModel } from "../models/Trip";
import { saveAssignments } from "./fuelProrationAssignmentService";

const tenantId = "tenant-1";
const truckId = "truck-1";
const inicio = "2026-06-01";
const fin = "2026-06-30";

function mockTruck(): Truck {
  return { id: truckId, tenant_id: tenantId } as Truck;
}

function mockTrip(partial: {
  id: string;
  truck_id?: string;
  folio?: string;
  km_inicial?: number;
  km_final?: number | null;
}): TripModel {
  return {
    id: partial.id,
    truck_id: partial.truck_id ?? truckId,
    folio: partial.folio ?? partial.id,
    km_inicial: partial.km_inicial ?? 0,
    km_final: partial.km_final !== undefined ? partial.km_final : 100,
  } as TripModel;
}

function mockTicket(partial: {
  id: string;
  truck_id?: string;
  fecha: string;
}): FuelTicketModel {
  return {
    id: partial.id,
    truck_id: partial.truck_id ?? truckId,
    fecha: partial.fecha as unknown as Date,
  } as FuelTicketModel;
}

async function expectError(
  fn: () => Promise<void>,
  status: number,
  messagePattern: RegExp | string,
): Promise<void> {
  await assert.rejects(fn, (err: Error & { status?: number }) => {
    assert.equal(err.status, status);
    if (typeof messagePattern === "string") assert.equal(err.message, messagePattern);
    else assert.match(err.message, messagePattern);
    return true;
  });
}

describe("saveAssignments", () => {
  it("rechaza camión inexistente con 404", async () => {
    const truckFindOne = mock.method(Truck, "findOne", async () => null);

    await expectError(
      () => saveAssignments(tenantId, truckId, inicio, fin, [{ trip_id: "v1", fuel_ticket_id: "tk1" }]),
      404,
      "Camión no encontrado",
    );

    truckFindOne.mock.restore();
  });

  it("rechaza viaje inexistente", async () => {
    const truckFindOne = mock.method(Truck, "findOne", async () => mockTruck());
    const tripFindAll = mock.method(Trip, "findAll", async () => [] as never);

    await expectError(
      () => saveAssignments(tenantId, truckId, inicio, fin, [{ trip_id: "missing", fuel_ticket_id: "tk1" }]),
      400,
      /Viaje no encontrado/,
    );

    truckFindOne.mock.restore();
    tripFindAll.mock.restore();
  });

  it("rechaza viaje de otro camión", async () => {
    const truckFindOne = mock.method(Truck, "findOne", async () => mockTruck());
    const tripFindAll = mock.method(Trip, "findAll", async () => [
      mockTrip({ id: "v1", truck_id: "other-truck", folio: "TL001" }),
    ] as never);

    await expectError(
      () => saveAssignments(tenantId, truckId, inicio, fin, [{ trip_id: "v1", fuel_ticket_id: "tk1" }]),
      400,
      /El viaje TL001 no pertenece a esta unidad/,
    );

    truckFindOne.mock.restore();
    tripFindAll.mock.restore();
  });

  it("rechaza viaje sin km final", async () => {
    const truckFindOne = mock.method(Truck, "findOne", async () => mockTruck());
    const tripFindAll = mock.method(Trip, "findAll", async () => [
      mockTrip({ id: "v1", folio: "TL002", km_final: null }),
    ] as never);

    await expectError(
      () => saveAssignments(tenantId, truckId, inicio, fin, [{ trip_id: "v1", fuel_ticket_id: "tk1" }]),
      400,
      /El viaje TL002 no tiene km final registrado/,
    );

    truckFindOne.mock.restore();
    tripFindAll.mock.restore();
  });

  it("rechaza ticket inexistente", async () => {
    const truckFindOne = mock.method(Truck, "findOne", async () => mockTruck());
    const tripFindAll = mock.method(Trip, "findAll", async () => [mockTrip({ id: "v1" })] as never);
    const ticketFindAll = mock.method(FuelTicket, "findAll", async () => [] as never);

    await expectError(
      () => saveAssignments(tenantId, truckId, inicio, fin, [{ trip_id: "v1", fuel_ticket_id: "missing-tk" }]),
      400,
      /Ticket no encontrado/,
    );

    truckFindOne.mock.restore();
    tripFindAll.mock.restore();
    ticketFindAll.mock.restore();
  });

  it("rechaza ticket de otro camión", async () => {
    const truckFindOne = mock.method(Truck, "findOne", async () => mockTruck());
    const tripFindAll = mock.method(Trip, "findAll", async () => [mockTrip({ id: "v1" })] as never);
    const ticketFindAll = mock.method(FuelTicket, "findAll", async () => [
      mockTicket({ id: "tk1", truck_id: "other-truck", fecha: "2026-06-02" }),
    ] as never);

    await expectError(
      () => saveAssignments(tenantId, truckId, inicio, fin, [{ trip_id: "v1", fuel_ticket_id: "tk1" }]),
      400,
      "El ticket no pertenece a esta unidad",
    );

    truckFindOne.mock.restore();
    tripFindAll.mock.restore();
    ticketFindAll.mock.restore();
  });

  it("rechaza ticket fuera del período", async () => {
    const truckFindOne = mock.method(Truck, "findOne", async () => mockTruck());
    const tripFindAll = mock.method(Trip, "findAll", async () => [mockTrip({ id: "v1" })] as never);
    const ticketFindAll = mock.method(FuelTicket, "findAll", async () => [
      mockTicket({ id: "tk1", fecha: "2026-05-15" }),
    ] as never);

    await expectError(
      () => saveAssignments(tenantId, truckId, inicio, fin, [{ trip_id: "v1", fuel_ticket_id: "tk1" }]),
      400,
      "El ticket no está en el período seleccionado",
    );

    truckFindOne.mock.restore();
    tripFindAll.mock.restore();
    ticketFindAll.mock.restore();
  });

  it("rechaza trip_id duplicado en el payload", async () => {
    const truckFindOne = mock.method(Truck, "findOne", async () => mockTruck());

    await expectError(
      () =>
        saveAssignments(tenantId, truckId, inicio, fin, [
          { trip_id: "v1", fuel_ticket_id: "tk1" },
          { trip_id: "v1", fuel_ticket_id: "tk2" },
        ]),
      400,
      "Asignaciones duplicadas para el mismo viaje",
    );

    truckFindOne.mock.restore();
  });

  it("elimina asignación con fuel_ticket_id null (destroy sin bulkCreate)", async () => {
    const truckFindOne = mock.method(Truck, "findOne", async () => mockTruck());
    const tripFindAll = mock.method(Trip, "findAll", async () => [mockTrip({ id: "v1" })] as never);
    const destroy = mock.method(FuelProrationAssignment, "destroy", async () => 1 as never);
    const bulkCreate = mock.method(FuelProrationAssignment, "bulkCreate", async () => {
      throw new Error("no debe crear filas");
    });
    const transaction = mock.method(sequelize, "transaction", async (fn: (t: unknown) => Promise<void>) => {
      await fn({});
    });

    await saveAssignments(tenantId, truckId, inicio, fin, [{ trip_id: "v1", fuel_ticket_id: null }]);

    assert.equal(destroy.mock.callCount(), 1);
    assert.equal(bulkCreate.mock.callCount(), 0);

    truckFindOne.mock.restore();
    tripFindAll.mock.restore();
    destroy.mock.restore();
    bulkCreate.mock.restore();
    transaction.mock.restore();
  });

  it("persiste asignaciones en transacción destroy + bulkCreate", async () => {
    const truckFindOne = mock.method(Truck, "findOne", async () => mockTruck());
    const tripFindAll = mock.method(Trip, "findAll", async () => [
      mockTrip({ id: "v1" }),
      mockTrip({ id: "v2" }),
    ] as never);
    const ticketFindAll = mock.method(FuelTicket, "findAll", async () => [
      mockTicket({ id: "tk1", fecha: "2026-06-02" }),
    ] as never);
    const destroy = mock.method(FuelProrationAssignment, "destroy", async () => 2 as never);
    const bulkCreate = mock.method(FuelProrationAssignment, "bulkCreate", async () => [] as never);
    const transaction = mock.method(sequelize, "transaction", async (fn: (t: unknown) => Promise<void>) => {
      await fn({ tx: true });
    });

    await saveAssignments(tenantId, truckId, inicio, fin, [
      { trip_id: "v1", fuel_ticket_id: "tk1" },
      { trip_id: "v2", fuel_ticket_id: null },
    ]);

    assert.equal(destroy.mock.callCount(), 1);
    const destroyArgs = destroy.mock.calls[0]!.arguments[0] as {
      where: { tenant_id: string; trip_id: { [Op.in]: string[] } };
      transaction: unknown;
    };
    assert.equal(destroyArgs.where.tenant_id, tenantId);
    assert.deepEqual(destroyArgs.where.trip_id[Op.in].sort(), ["v1", "v2"]);
    assert.deepEqual(destroyArgs.transaction, { tx: true });

    assert.equal(bulkCreate.mock.callCount(), 1);
    const createRows = bulkCreate.mock.calls[0]!.arguments[0] as Array<{
      tenant_id: string;
      trip_id: string;
      fuel_ticket_id: string;
    }>;
    assert.deepEqual(createRows, [
      { tenant_id: tenantId, trip_id: "v1", fuel_ticket_id: "tk1" },
    ]);

    truckFindOne.mock.restore();
    tripFindAll.mock.restore();
    ticketFindAll.mock.restore();
    destroy.mock.restore();
    bulkCreate.mock.restore();
    transaction.mock.restore();
  });
});
