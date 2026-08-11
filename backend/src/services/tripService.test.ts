import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import {
  AccountDocument,
  FuelLoad,
  FuelProrationAssignment,
  FuelTicket,
  Trip,
  Truck,
  sequelize,
} from "../models";
import { addFuel, removeFuel } from "./tripService";
import {
  compareTripOrder,
  findCascadePredecessorPeer,
  findCascadeSuccessorPeer,
  findNextTripPeer,
  findPreviousTripPeer,
  intervalsOverlap,
  planKmFinalCascade,
  planKmInicialCascade,
  tripIntervalEndMs,
  validateTripScheduleAndOdometer,
  type TripPeer,
} from "./tripSequenceValidation";

const tenantId = "tenant-1";
const tripId = "trip-1";
const fuelId = "fuel-1";

describe("removeFuel", () => {
  it("rechaza eliminar carga de ticket confirmado", async () => {
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
    const ticketFindOne = mock.method(FuelTicket, "findOne", async () =>
      ({
        id: "ticket-proration-1",
        prorrateo_confirmado_at: new Date(),
      }) as never,
    );

    await assert.rejects(
      () => removeFuel(tenantId, tripId, fuelId),
      (err: Error & { status?: number }) => {
        assert.equal(err.status, 400);
        assert.match(err.message, /ticket confirmado/);
        return true;
      },
    );

    tripFindOne.mock.restore();
    fuelFindOne.mock.restore();
    ticketFindOne.mock.restore();
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

  it("cascada borra load, assignment y ticket pendiente", async () => {
    const ticketDestroy = mock.fn(async () => {});
    const tripFindOne = mock.method(Trip, "findOne", async () => ({ id: tripId }) as never);
    const fuelFindOne = mock.method(FuelLoad, "findOne", async () =>
      ({
        id: fuelId,
        trip_id: tripId,
        tenant_id: tenantId,
        fuel_ticket_id: "tk-pending",
      }) as never,
    );
    const ticketFindOne = mock.method(FuelTicket, "findOne", async () =>
      ({
        id: "tk-pending",
        prorrateo_confirmado_at: null,
        destroy: ticketDestroy,
      }) as never,
    );
    const fuelDestroy = mock.method(FuelLoad, "destroy", async () => 1);
    const assignDestroy = mock.method(FuelProrationAssignment, "destroy", async () => 1);
    const docDestroy = mock.method(AccountDocument, "destroy", async () => 1);
    const transaction = mock.method(sequelize, "transaction", async (fn: (t: unknown) => Promise<void>) => {
      await fn({ tx: true });
    });

    await removeFuel(tenantId, tripId, fuelId);

    assert.equal(fuelDestroy.mock.callCount(), 1);
    assert.equal(assignDestroy.mock.callCount(), 1);
    assert.equal(ticketDestroy.mock.callCount(), 1);

    tripFindOne.mock.restore();
    fuelFindOne.mock.restore();
    ticketFindOne.mock.restore();
    fuelDestroy.mock.restore();
    assignDestroy.mock.restore();
    docDestroy.mock.restore();
    transaction.mock.restore();
  });
});

describe("addFuel", () => {
  it("crea ticket pendiente, assignment y FuelLoad enlazado", async () => {
    const trip = {
      id: tripId,
      truck_id: "truck-1",
      km_inicial: 1000,
      km_final: 1200,
    };
    const tripFindOne = mock.method(Trip, "findOne", async () => trip as never);
    const truckFindOne = mock.method(Truck, "findOne", async () =>
      ({ id: "truck-1", numero_economico: "TL01", placas: "ABC-123" }) as never,
    );

    const created: Record<string, unknown>[] = [];
    const ticketCreate = mock.method(FuelTicket, "create", async (row: Record<string, unknown>) => {
      created.push({ type: "ticket", ...row });
      return row as never;
    });
    const assignCreate = mock.method(FuelProrationAssignment, "create", async (row: Record<string, unknown>) => {
      created.push({ type: "assignment", ...row });
      return row as never;
    });
    const loadCreate = mock.method(FuelLoad, "create", async (row: Record<string, unknown>) => {
      created.push({ type: "load", ...row });
      return row as never;
    });
    const transaction = mock.method(sequelize, "transaction", async (fn: (t: unknown) => Promise<unknown>) => {
      return fn({ tx: true });
    });

    const load = await addFuel(tenantId, tripId, {
      litros: 50,
      precio_litro: 26,
      ubicacion: "Pemex Norte",
      es_foraneo: true,
    });

    assert.equal(ticketCreate.mock.callCount(), 1);
    assert.equal(assignCreate.mock.callCount(), 1);
    assert.equal(loadCreate.mock.callCount(), 1);

    const ticket = created.find((c) => c.type === "ticket")!;
    assert.equal(ticket.source_trip_id, tripId);
    assert.equal(ticket.es_foraneo, true);
    assert.equal(ticket.prorrateo_confirmado_at, null);
    assert.equal(ticket.odometro, 1200);

    const assignment = created.find((c) => c.type === "assignment")!;
    assert.equal(assignment.trip_id, tripId);
    assert.equal(assignment.fuel_ticket_id, ticket.id);

    assert.equal((load as { fuel_ticket_id?: string }).fuel_ticket_id, ticket.id);
    assert.equal((load as { es_foraneo?: boolean }).es_foraneo, true);
    assert.equal((load as { litros?: string }).litros, "50");
    assert.equal((load as { precio_litro?: string }).precio_litro, "26");
    assert.equal(typeof (load as { litros?: string }).litros, "string");
    assert.equal(typeof (load as { precio_litro?: string }).precio_litro, "string");

    tripFindOne.mock.restore();
    truckFindOne.mock.restore();
    ticketCreate.mock.restore();
    assignCreate.mock.restore();
    loadCreate.mock.restore();
    transaction.mock.restore();
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
            tripId: "a",
            folio: "TLO-1",
            fecha_salida: new Date("2026-06-01T08:00:00.000Z"),
            fecha_llegada: new Date("2026-06-02T10:00:00.000Z"),
            km_inicial: 100,
            km_final: 200,
          },
          [closedA, closedB],
        ),
      /traslapan/,
    );
  });

  it("al crear, prioriza mensaje de fecha anterior al último si también habría traslape", () => {
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
      /fecha anterior al último viaje/,
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

  it("rechaza crear con fecha anterior a la llegada del último viaje", () => {
    assert.throws(
      () =>
        validateTripScheduleAndOdometer(
          {
            fecha_salida: new Date("2026-06-01T14:00:00.000Z"),
            fecha_llegada: null,
            km_inicial: 200,
            km_final: null,
          },
          [closedA, closedB],
        ),
      /fecha anterior al último viaje/,
    );
  });

  it("acepta crear exactamente en la llegada del último viaje", () => {
    assert.doesNotThrow(() =>
      validateTripScheduleAndOdometer(
        {
          fecha_salida: new Date("2026-06-02T12:00:00.000Z"),
          fecha_llegada: null,
          km_inicial: 300,
          km_final: null,
        },
        [closedA, closedB],
      ),
    );
  });

  it("al editar un viaje histórico no exige fecha >= llegada del último", () => {
    assert.doesNotThrow(() =>
      validateTripScheduleAndOdometer(
        {
          tripId: "a",
          folio: "TLO-1",
          fecha_salida: new Date("2026-06-01T08:00:00.000Z"),
          fecha_llegada: new Date("2026-06-01T12:00:00.000Z"),
          km_inicial: 100,
          km_final: 200,
        },
        [closedA, closedB],
      ),
    );
  });

  it("al editar el último viaje rechaza salida anterior a la llegada del previo", () => {
    assert.throws(
      () =>
        validateTripScheduleAndOdometer(
          {
            tripId: "b",
            folio: "TLO-2",
            fecha_salida: new Date("2026-06-01T10:00:00.000Z"),
            fecha_llegada: new Date("2026-06-01T11:00:00.000Z"),
            km_inicial: 200,
            km_final: 250,
          },
          [closedA, closedB],
        ),
      /fecha anterior al último viaje/,
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

  it("con propagateKmFinalToNext acepta cambio y exige distancia no negativa en el siguiente", () => {
    assert.doesNotThrow(() =>
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
        { propagateKmFinalToNext: true },
      ),
    );
    assert.doesNotThrow(() =>
      validateTripScheduleAndOdometer(
        {
          tripId: "a",
          folio: "TLO-1",
          fecha_salida: new Date("2026-06-01T08:00:00.000Z"),
          fecha_llegada: new Date("2026-06-01T12:00:00.000Z"),
          km_inicial: 100,
          km_final: 300,
        },
        [closedA, closedB],
        { propagateKmFinalToNext: true },
      ),
    );
    assert.throws(
      () =>
        validateTripScheduleAndOdometer(
          {
            tripId: "a",
            folio: "TLO-1",
            fecha_salida: new Date("2026-06-01T08:00:00.000Z"),
            fecha_llegada: new Date("2026-06-01T12:00:00.000Z"),
            km_inicial: 100,
            km_final: 301,
          },
          [closedA, closedB],
          { propagateKmFinalToNext: true },
        ),
      /máximo permitido/,
    );
  });

  it("planKmFinalCascade refleja el ejemplo de transferencia de km", () => {
    const plan = planKmFinalCascade(
      {
        tripId: "a",
        folio: "TLO-1",
        fecha_salida: new Date("2026-06-01T08:00:00.000Z"),
        fecha_llegada: new Date("2026-06-01T12:00:00.000Z"),
        km_inicial: 100,
        km_final: 250,
      },
      [closedA, closedB],
    );
    assert.ok(plan);
    assert.equal(plan!.nextFolio, "TLO-2");
    assert.equal(plan!.newKmInicial, 250);
    assert.equal(plan!.previousDistance, 100);
    assert.equal(plan!.newDistance, 50);
  });

  it("planKmFinalCascade permite dejar al siguiente en 0 km", () => {
    const plan = planKmFinalCascade(
      {
        tripId: "a",
        folio: "TLO-1",
        fecha_salida: new Date("2026-06-01T08:00:00.000Z"),
        fecha_llegada: new Date("2026-06-01T12:00:00.000Z"),
        km_inicial: 100,
        km_final: 300,
      },
      [closedA, closedB],
    );
    assert.ok(plan);
    assert.equal(plan!.newKmInicial, 300);
    assert.equal(plan!.newDistance, 0);
  });

  it("planKmFinalCascade rechaza si el siguiente quedaría con distancia negativa", () => {
    assert.throws(
      () =>
        planKmFinalCascade(
          {
            tripId: "a",
            folio: "TLO-1",
            fecha_salida: new Date("2026-06-01T08:00:00.000Z"),
            fecha_llegada: new Date("2026-06-01T12:00:00.000Z"),
            km_inicial: 100,
            km_final: 301,
          },
          [closedA, closedB],
        ),
      /máximo permitido/,
    );
  });

  it("planKmFinalCascade: subir 100 km al primero baja 100 al segundo", () => {
    const trip1 = peer({
      id: "1",
      folio: "V1",
      salida: "2026-06-01T08:00:00.000Z",
      llegada: "2026-06-01T12:00:00.000Z",
      km_inicial: 0,
      km_final: 100,
    });
    const trip2 = peer({
      id: "2",
      folio: "V2",
      salida: "2026-06-02T08:00:00.000Z",
      llegada: "2026-06-02T12:00:00.000Z",
      km_inicial: 100,
      km_final: 400,
    });
    const plan = planKmFinalCascade(
      {
        tripId: "1",
        folio: "V1",
        fecha_salida: trip1.fecha_salida,
        fecha_llegada: trip1.fecha_llegada,
        km_inicial: 0,
        km_final: 200,
      },
      [trip1, trip2],
    );
    assert.ok(plan);
    assert.equal(plan!.previousDistance, 300);
    assert.equal(plan!.newDistance, 200);
    assert.equal(plan!.newKmInicial, 200);
  });

  it("con propagateKmInicialToPrev acepta cambio y exige distancia no negativa en el anterior", () => {
    assert.doesNotThrow(() =>
      validateTripScheduleAndOdometer(
        {
          tripId: "b",
          folio: "TLO-2",
          fecha_salida: new Date("2026-06-02T08:00:00.000Z"),
          fecha_llegada: new Date("2026-06-02T12:00:00.000Z"),
          km_inicial: 150,
          km_final: 300,
        },
        [closedA, closedB],
        { propagateKmInicialToPrev: true },
      ),
    );
    assert.doesNotThrow(() =>
      validateTripScheduleAndOdometer(
        {
          tripId: "b",
          folio: "TLO-2",
          fecha_salida: new Date("2026-06-02T08:00:00.000Z"),
          fecha_llegada: new Date("2026-06-02T12:00:00.000Z"),
          km_inicial: 100,
          km_final: 300,
        },
        [closedA, closedB],
        { propagateKmInicialToPrev: true },
      ),
    );
    assert.throws(
      () =>
        validateTripScheduleAndOdometer(
          {
            tripId: "b",
            folio: "TLO-2",
            fecha_salida: new Date("2026-06-02T08:00:00.000Z"),
            fecha_llegada: new Date("2026-06-02T12:00:00.000Z"),
            km_inicial: 99,
            km_final: 300,
          },
          [closedA, closedB],
          { propagateKmInicialToPrev: true },
        ),
      /mínimo permitido/,
    );
  });

  it("planKmInicialCascade refleja transferencia de km al anterior", () => {
    const plan = planKmInicialCascade(
      {
        tripId: "b",
        folio: "TLO-2",
        fecha_salida: new Date("2026-06-02T08:00:00.000Z"),
        fecha_llegada: new Date("2026-06-02T12:00:00.000Z"),
        km_inicial: 150,
        km_final: 300,
      },
      [closedA, closedB],
      200,
    );
    assert.ok(plan);
    assert.equal(plan!.prevFolio, "TLO-1");
    assert.equal(plan!.newKmFinal, 150);
    assert.equal(plan!.previousDistance, 100);
    assert.equal(plan!.newDistance, 50);
  });

  it("planKmInicialCascade permite dejar al anterior en 0 km", () => {
    const plan = planKmInicialCascade(
      {
        tripId: "b",
        folio: "TLO-2",
        fecha_salida: new Date("2026-06-02T08:00:00.000Z"),
        fecha_llegada: new Date("2026-06-02T12:00:00.000Z"),
        km_inicial: 100,
        km_final: 300,
      },
      [closedA, closedB],
      200,
    );
    assert.ok(plan);
    assert.equal(plan!.newKmFinal, 100);
    assert.equal(plan!.newDistance, 0);
  });

  it("planKmInicialCascade rechaza si el anterior quedaría con distancia negativa", () => {
    assert.throws(
      () =>
        planKmInicialCascade(
          {
            tripId: "b",
            folio: "TLO-2",
            fecha_salida: new Date("2026-06-02T08:00:00.000Z"),
            fecha_llegada: new Date("2026-06-02T12:00:00.000Z"),
            km_inicial: 99,
            km_final: 300,
          },
          [closedA, closedB],
          200,
        ),
      /mínimo permitido/,
    );
  });

  it("planKmInicialCascade: bajar 50 km al segundo baja 50 al primero", () => {
    const trip1 = peer({
      id: "1",
      folio: "V1",
      salida: "2026-06-01T08:00:00.000Z",
      llegada: "2026-06-01T12:00:00.000Z",
      km_inicial: 0,
      km_final: 200,
    });
    const trip2 = peer({
      id: "2",
      folio: "V2",
      salida: "2026-06-02T08:00:00.000Z",
      llegada: "2026-06-02T12:00:00.000Z",
      km_inicial: 200,
      km_final: 400,
    });
    const plan = planKmInicialCascade(
      {
        tripId: "2",
        folio: "V2",
        fecha_salida: trip2.fecha_salida,
        fecha_llegada: trip2.fecha_llegada,
        km_inicial: 150,
        km_final: 400,
      },
      [trip1, trip2],
      200,
    );
    assert.ok(plan);
    assert.equal(plan!.previousDistance, 200);
    assert.equal(plan!.newDistance, 150);
    assert.equal(plan!.newKmFinal, 150);
  });

  it("findPreviousTripPeer devuelve el inmediato anterior", () => {
    const prev = findPreviousTripPeer(
      {
        tripId: "b",
        folio: "TLO-2",
        fecha_salida: new Date("2026-06-02T08:00:00.000Z"),
        fecha_llegada: new Date("2026-06-02T12:00:00.000Z"),
        km_inicial: 200,
        km_final: 300,
      },
      [closedA, closedB],
    );
    assert.equal(prev?.id, "a");
  });

  it("cascada inversa ancla al eslabón de odómetro aunque la fecha del medio esté desordenada", () => {
    const trip4 = peer({
      id: "4",
      folio: "TLO12-4",
      salida: "2026-07-15T15:00:00.000Z",
      llegada: "2026-07-15T23:00:00.000Z",
      km_inicial: 380849,
      km_final: 380886,
    });
    const trip5 = peer({
      id: "5",
      folio: "TLO12-5",
      salida: "2026-07-14T12:00:00.000Z",
      llegada: "2026-07-17T17:00:00.000Z",
      km_inicial: 380886,
      km_final: 382038,
    });
    const trip6 = peer({
      id: "6",
      folio: "TLO12-6",
      salida: "2026-07-17T23:00:00.000Z",
      llegada: null,
      km_inicial: 382038,
      km_final: null,
    });
    const peers = [trip4, trip5, trip6];
    const candidate = {
      tripId: "5",
      folio: "TLO12-5",
      fecha_salida: trip5.fecha_salida,
      fecha_llegada: trip5.fecha_llegada,
      km_inicial: 380900,
      km_final: 382038,
    };

    assert.equal(findPreviousTripPeer(candidate, peers), null);
    assert.equal(
      findCascadePredecessorPeer(candidate, peers, 380886)?.folio,
      "TLO12-4",
    );

    const plan = planKmInicialCascade(candidate, peers, 380886);
    assert.ok(plan);
    assert.equal(plan!.prevFolio, "TLO12-4");
    assert.equal(plan!.newKmFinal, 380900);
    assert.equal(plan!.previousDistance, 380886 - 380849);
    assert.equal(plan!.newDistance, 380900 - 380849);
  });

  it("ambas propagaciones activas validan hacia atrás y hacia adelante", () => {
    const trip1 = peer({
      id: "1",
      folio: "V1",
      salida: "2026-06-01T08:00:00.000Z",
      llegada: "2026-06-01T12:00:00.000Z",
      km_inicial: 0,
      km_final: 100,
    });
    const trip2 = peer({
      id: "2",
      folio: "V2",
      salida: "2026-06-02T08:00:00.000Z",
      llegada: "2026-06-02T12:00:00.000Z",
      km_inicial: 100,
      km_final: 200,
    });
    const trip3 = peer({
      id: "3",
      folio: "V3",
      salida: "2026-06-03T08:00:00.000Z",
      llegada: "2026-06-03T12:00:00.000Z",
      km_inicial: 200,
      km_final: 300,
    });
    assert.doesNotThrow(() =>
      validateTripScheduleAndOdometer(
        {
          tripId: "2",
          folio: "V2",
          fecha_salida: trip2.fecha_salida,
          fecha_llegada: trip2.fecha_llegada,
          km_inicial: 80,
          km_final: 220,
        },
        [trip1, trip2, trip3],
        { propagateKmInicialToPrev: true, propagateKmFinalToNext: true },
      ),
    );
    assert.throws(
      () =>
        validateTripScheduleAndOdometer(
          {
            tripId: "2",
            folio: "V2",
            fecha_salida: trip2.fecha_salida,
            fecha_llegada: trip2.fecha_llegada,
            km_inicial: -1,
            km_final: 220,
          },
          [trip1, trip2, trip3],
          { propagateKmInicialToPrev: true, propagateKmFinalToNext: true },
        ),
      /mínimo permitido/,
    );
    assert.throws(
      () =>
        validateTripScheduleAndOdometer(
          {
            tripId: "2",
            folio: "V2",
            fecha_salida: trip2.fecha_salida,
            fecha_llegada: trip2.fecha_llegada,
            km_inicial: 80,
            km_final: 301,
          },
          [trip1, trip2, trip3],
          { propagateKmInicialToPrev: true, propagateKmFinalToNext: true },
        ),
      /máximo permitido/,
    );
  });

  it("findNextTripPeer devuelve el inmediato siguiente", () => {
    const next = findNextTripPeer(
      {
        tripId: "a",
        folio: "TLO-1",
        fecha_salida: new Date("2026-06-01T08:00:00.000Z"),
        fecha_llegada: new Date("2026-06-01T12:00:00.000Z"),
        km_inicial: 100,
        km_final: 200,
      },
      [closedA, closedB],
    );
    assert.equal(next?.id, "b");
  });

  it("cascada ancla al eslabón de odómetro aunque la fecha del medio esté desordenada", () => {
    const trip4 = peer({
      id: "4",
      folio: "TLO12-4",
      salida: "2026-07-15T15:00:00.000Z",
      llegada: "2026-07-15T23:00:00.000Z",
      km_inicial: 380849,
      km_final: 380886,
    });
    const trip5 = peer({
      id: "5",
      folio: "TLO12-5",
      salida: "2026-07-14T12:00:00.000Z",
      llegada: "2026-07-17T17:00:00.000Z",
      km_inicial: 380886,
      km_final: 382038,
    });
    const trip6 = peer({
      id: "6",
      folio: "TLO12-6",
      salida: "2026-07-17T23:00:00.000Z",
      llegada: null,
      km_inicial: 382038,
      km_final: null,
    });
    const peers = [trip4, trip5, trip6];
    const candidate = {
      tripId: "4",
      folio: "TLO12-4",
      fecha_salida: trip4.fecha_salida,
      fecha_llegada: trip4.fecha_llegada,
      km_inicial: 380849,
      km_final: 380950,
    };

    assert.equal(findNextTripPeer(candidate, peers)?.folio, "TLO12-6");
    assert.equal(
      findCascadeSuccessorPeer(candidate, peers, 380886)?.folio,
      "TLO12-5",
    );

    const plan = planKmFinalCascade(candidate, peers, 380886);
    assert.ok(plan);
    assert.equal(plan!.nextFolio, "TLO12-5");
    assert.equal(plan!.newKmInicial, 380950);
    assert.equal(plan!.previousDistance, 382038 - 380886);
    assert.equal(plan!.newDistance, 382038 - 380950);
  });

  it("cascada por odómetro ignora fecha de salida movida en el candidato", () => {
    const trip4 = peer({
      id: "4",
      folio: "TLO12-4",
      salida: "2026-07-15T15:00:00.000Z",
      llegada: "2026-07-15T23:00:00.000Z",
      km_inicial: 380849,
      km_final: 380886,
    });
    const trip5 = peer({
      id: "5",
      folio: "TLO12-5",
      salida: "2026-07-15T23:30:00.000Z",
      llegada: "2026-07-17T17:00:00.000Z",
      km_inicial: 380886,
      km_final: 382038,
    });
    const trip6 = peer({
      id: "6",
      folio: "TLO12-6",
      salida: "2026-07-17T23:00:00.000Z",
      llegada: null,
      km_inicial: 382038,
      km_final: null,
    });
    const candidate = {
      tripId: "4",
      folio: "TLO12-4",
      fecha_salida: new Date("2026-07-16T12:00:00.000Z"),
      fecha_llegada: trip4.fecha_llegada,
      km_inicial: 380849,
      km_final: 380950,
    };
    assert.equal(findNextTripPeer(candidate, [trip4, trip5, trip6])?.folio, "TLO12-6");
    const plan = planKmFinalCascade(candidate, [trip4, trip5, trip6], 380886);
    assert.equal(plan?.nextFolio, "TLO12-5");
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
      /fecha anterior al último viaje/,
    );
    assert.throws(
      () =>
        validateTripScheduleAndOdometer(
          {
            tripId: "open-old",
            folio: "TLO-0",
            fecha_salida: new Date("2026-06-01T06:00:00.000Z"),
            fecha_llegada: null,
            km_inicial: 50,
            km_final: null,
          },
          [
            peer({
              id: "open-old",
              folio: "TLO-0",
              salida: "2026-06-01T06:00:00.000Z",
              llegada: null,
              km_inicial: 50,
              km_final: null,
            }),
            closedA,
          ],
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
