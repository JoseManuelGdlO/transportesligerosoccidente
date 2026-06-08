import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import { FuelLoad, Trip } from "../models";
import { removeFuel } from "./tripService";

const tenantId = "tenant-1";
const tripId = "trip-1";
const fuelId = "fuel-1";

describe("removeFuel", () => {
  it("rechaza eliminar carga generada por prorrateo", async () => {
    const tripFindOne = mock.method(Trip, "findOne", async () => ({ id: tripId }) as never);
    const fuelFindOne = mock.method(FuelLoad, "findOne", async () =>
      ({
        id: fuelId,
        trip_id: tripId,
        tenant_id: tenantId,
        fuel_ticket_id: "ticket-proration-1",
        destroy: async () => {},
      }) as never,
    );

    await assert.rejects(
      () => removeFuel(tenantId, tripId, fuelId),
      (err: Error & { status?: number }) => {
        assert.equal(err.status, 400);
        assert.equal(err.message, "Carga generada por prorrateo; no se puede eliminar");
        return true;
      },
    );

    tripFindOne.mock.restore();
    fuelFindOne.mock.restore();
  });

  it("elimina carga manual sin fuel_ticket_id", async () => {
    const destroy = mock.fn(async () => {});
    const tripFindOne = mock.method(Trip, "findOne", async () => ({ id: tripId }) as never);
    const fuelFindOne = mock.method(FuelLoad, "findOne", async () =>
      ({
        id: fuelId,
        trip_id: tripId,
        tenant_id: tenantId,
        fuel_ticket_id: null,
        destroy,
      }) as never,
    );

    await removeFuel(tenantId, tripId, fuelId);

    assert.equal(destroy.mock.callCount(), 1);

    tripFindOne.mock.restore();
    fuelFindOne.mock.restore();
  });
});
