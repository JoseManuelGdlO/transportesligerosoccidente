import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import { FuelLoad, Trip } from "../models";
import { removeFuel } from "./tripService";
import {
  compareTripOrder,
  intervalsOverlap,
  tripIntervalEndMs,
  validateTripScheduleAndOdometer,
  type TripPeer,
} from "./tripSequenceValidation";

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

function peer(partial: {
  id: string;
  folio?: string;
  salida: string;
  llegada?: string | null;
  km_inicial: number;
  km_final?: number | null;
}): TripPeer {
  return {
    id: partial.id,
    folio: partial.folio ?? partial.id,
    fecha_salida: new Date(partial.salida),
    fecha_llegada: partial.llegada === undefined || partial.llegada === null ? null : new Date(partial.llegada),
    km_inicial: partial.km_inicial,
    km_final: partial.km_final === undefined ? null : partial.km_final,
  };
}

describe("intervalsOverlap", () => {
  it("permite extremos que se tocan", () => {
    const aStart = Date.parse("2026-06-01T08:00:00.000Z");
    const aEnd = Date.parse("2026-06-01T12:00:00.000Z");
    const bStart = Date.parse("2026-06-01T12:00:00.000Z");
    const bEnd = Date.parse("2026-06-01T18:00:00.000Z");
    assert.equal(intervalsOverlap(aStart, aEnd, bStart, bEnd), false);
  });

  it("detecta cruce de intervalos", () => {
    const aStart = Date.parse("2026-06-01T08:00:00.000Z");
    const aEnd = Date.parse("2026-06-01T14:00:00.000Z");
    const bStart = Date.parse("2026-06-01T12:00:00.000Z");
    const bEnd = Date.parse("2026-06-01T18:00:00.000Z");
    assert.equal(intervalsOverlap(aStart, aEnd, bStart, bEnd), true);
  });
});

describe("validateTripScheduleAndOdometer", () => {
  const closedA = peer({
    id: "a",
    folio: "TLO-1",
    salida: "2026-06-01T08:00:00.000Z",
    llegada: "2026-06-01T12:00:00.000Z",
    km_inicial: 100,
    km_final: 200,
  });
  const closedB = peer({
    id: "b",
    folio: "TLO-2",
    salida: "2026-06-02T08:00:00.000Z",
    llegada: "2026-06-02T12:00:00.000Z",
    km_inicial: 200,
    km_final: 300,
  });

  it("acepta viaje que toca el extremo del anterior", () => {
    assert.doesNotThrow(() =>
      validateTripScheduleAndOdometer(
        {
          fecha_salida: new Date("2026-06-01T12:00:00.000Z"),
          fecha_llegada: new Date("2026-06-01T18:00:00.000Z"),
          km_inicial: 200,
          km_final: 250,
        },
        [closedA],
      ),
    );
  });

  it("rechaza fechas que se cruzan", () => {
    assert.throws(
      () =>
        validateTripScheduleAndOdometer(
          {
            fecha_salida: new Date("2026-06-01T10:00:00.000Z"),
            fecha_llegada: new Date("2026-06-01T14:00:00.000Z"),
            km_inicial: 150,
            km_final: 180,
          },
          [closedA],
        ),
      /traslapan/,
    );
  });

  it("rechaza km_inicial distinto del km_final anterior", () => {
    assert.throws(
      () =>
        validateTripScheduleAndOdometer(
          {
            fecha_salida: new Date("2026-06-01T12:00:00.000Z"),
            fecha_llegada: null,
            km_inicial: 199,
            km_final: null,
          },
          [closedA],
        ),
      /km inicial debe ser 200/,
    );
  });

  it("acepta crear con km_inicial igual al último cerrado", () => {
    assert.doesNotThrow(() =>
      validateTripScheduleAndOdometer(
        {
          fecha_salida: new Date("2026-06-03T08:00:00.000Z"),
          fecha_llegada: null,
          km_inicial: 300,
          km_final: null,
        },
        [closedA, closedB],
      ),
    );
  });

  it("rechaza editar cerrado rompiendo continuidad con el siguiente", () => {
    assert.throws(
      () =>
        validateTripScheduleAndOdometer(
          {
            tripId: "a",
            folio: "TLO-1",
            fecha_salida: new Date("2026-06-01T08:00:00.000Z"),
            fecha_llegada: new Date("2026-06-01T12:00:00.000Z"),
            km_inicial: 100,
            km_final: 250,
          },
          [closedA, closedB],
        ),
      /km final debe ser 200/,
    );
  });

  it("viaje abierto hasta infinito traslapa con cerrado posterior", () => {
    assert.throws(
      () =>
        validateTripScheduleAndOdometer(
          {
            fecha_salida: new Date("2026-06-01T06:00:00.000Z"),
            fecha_llegada: null,
            km_inicial: 50,
            km_final: null,
          },
          [closedA],
        ),
      /traslapan/,
    );
  });

  it("tripIntervalEndMs usa infinito sin llegada", () => {
    assert.equal(tripIntervalEndMs({ fecha_llegada: null }), Number.POSITIVE_INFINITY);
  });

  it("compareTripOrder desempata por folio", () => {
    const a = { fecha_salida: "2026-06-01T00:00:00.000Z", folio: "A-1" };
    const b = { fecha_salida: "2026-06-01T00:00:00.000Z", folio: "A-2" };
    assert.ok(compareTripOrder(a, b) < 0);
  });
});
