import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { FuelTicket as FuelTicketModel } from "../models/FuelTicket";
import type { Trip as TripModel } from "../models/Trip";
import {
  applyManualAssignments,
  buildProrationBlocks,
  partitionPeriodTrips,
  resumenFromBlocks,
  ticketTimestampMs,
  ticketWindowEndMs,
  tripKmRecorridos,
  tripTimestampMs,
  tripsInWindow,
  utcWallClockMs,
  type ProratedTicketBlock,
} from "./fuelProrationService";

function mockTicket(partial: {
  id: string;
  truck_id: string;
  fecha: string;
  hora?: string | null;
  litros?: string;
}): FuelTicketModel {
  return {
    id: partial.id,
    truck_id: partial.truck_id,
    fecha: partial.fecha as unknown as Date,
    hora: partial.hora ?? null,
    litros: partial.litros ?? "100",
    precio_litro: "30",
    importe_total: "3000",
    odometro: 0,
    ubicacion: "X",
  } as unknown as FuelTicketModel;
}

function mockTrip(partial: {
  id: string;
  truck_id: string;
  fecha_salida: string;
  km_inicial: number;
  km_final?: number | null;
  folio?: string;
}): TripModel {
  return {
    id: partial.id,
    truck_id: partial.truck_id,
    fecha_salida: new Date(partial.fecha_salida),
    km_inicial: partial.km_inicial,
    km_final: partial.km_final ?? null,
    folio: partial.folio ?? partial.id,
    origen: "A",
    destino: "B",
  } as TripModel;
}

describe("utcWallClockMs", () => {
  it("interpreta fecha y hora como reloj UTC", () => {
    assert.equal(utcWallClockMs("2026-06-02", "08:30:00"), Date.parse("2026-06-02T08:30:00.000Z"));
    assert.equal(utcWallClockMs("2026-06-02"), Date.parse("2026-06-02T00:00:00.000Z"));
  });
});

describe("ticketTimestampMs", () => {
  it("ordena dos tickets del mismo día por hora", () => {
    const morning = mockTicket({ id: "1", truck_id: "t1", fecha: "2026-06-02", hora: "08:00:00" });
    const afternoon = mockTicket({ id: "2", truck_id: "t1", fecha: "2026-06-02", hora: "14:00:00" });
    assert.ok(ticketTimestampMs(morning) < ticketTimestampMs(afternoon));
  });

  it("usa 00:00:00 cuando el ticket no tiene hora", () => {
    const noHora = mockTicket({ id: "1", truck_id: "t1", fecha: "2026-06-02" });
    assert.equal(ticketTimestampMs(noHora), utcWallClockMs("2026-06-02", "00:00:00"));
  });
});

describe("tripTimestampMs", () => {
  it("extrae hora del ISO del viaje con convención UTC", () => {
    const trip = mockTrip({
      id: "v1",
      truck_id: "t1",
      fecha_salida: "2026-06-02T15:30:00.000Z",
      km_inicial: 0,
      km_final: 10,
    });
    assert.equal(tripTimestampMs(trip), utcWallClockMs("2026-06-02", "15:30:00"));
  });

  it("usa medianoche UTC para viaje solo-fecha", () => {
    const trip = mockTrip({
      id: "v1",
      truck_id: "t1",
      fecha_salida: "2026-06-02T00:00:00.000Z",
      km_inicial: 0,
      km_final: 10,
    });
    assert.equal(tripTimestampMs(trip), utcWallClockMs("2026-06-02", "00:00:00"));
  });
});

describe("ticketWindowEndMs", () => {
  it("usa la hora del siguiente ticket cuando comparten día", () => {
    const am = mockTicket({ id: "1", truck_id: "t1", fecha: "2026-06-02", hora: "08:00:00" });
    const pm = mockTicket({ id: "2", truck_id: "t1", fecha: "2026-06-02", hora: "14:00:00" });
    assert.equal(ticketWindowEndMs(am, pm, "2026-06-30"), ticketTimestampMs(pm));
  });

  it("usa fin de día del ticket cuando el siguiente es otro día", () => {
    const t1 = mockTicket({ id: "1", truck_id: "t1", fecha: "2026-06-02", hora: "08:00:00" });
    const t2 = mockTicket({ id: "2", truck_id: "t1", fecha: "2026-06-05", hora: "10:00:00" });
    assert.equal(ticketWindowEndMs(t1, t2, "2026-06-30"), Date.parse("2026-06-02T23:59:59.999Z"));
  });

  it("usa fin de período cuando no hay siguiente ticket", () => {
    const t1 = mockTicket({ id: "1", truck_id: "t1", fecha: "2026-06-02", hora: "08:00:00" });
    assert.equal(ticketWindowEndMs(t1, null, "2026-06-30"), Date.parse("2026-06-30T23:59:59.999Z"));
  });
});

describe("tripsInWindow", () => {
  const truckId = "truck-1";
  const trips = [
    mockTrip({ id: "v1", truck_id: truckId, fecha_salida: "2026-06-02T09:00:00.000Z", km_inicial: 0, km_final: 50 }),
    mockTrip({ id: "v2", truck_id: truckId, fecha_salida: "2026-06-02T15:00:00.000Z", km_inicial: 50, km_final: 100 }),
    mockTrip({ id: "v3", truck_id: truckId, fecha_salida: "2026-06-15T10:00:00.000Z", km_inicial: 100, km_final: 200 }),
  ];

  it("asigna viajes distintos a dos tickets del mismo día", () => {
    const ticketAm = mockTicket({ id: "tk1", truck_id: truckId, fecha: "2026-06-02", hora: "08:00:00" });
    const ticketPm = mockTicket({ id: "tk2", truck_id: truckId, fecha: "2026-06-02", hora: "14:00:00" });
    const throughAm = ticketTimestampMs(ticketPm);
    const throughPm = Date.parse("2026-06-30T23:59:59.999Z");

    const window1 = tripsInWindow(trips, truckId, ticketTimestampMs(ticketAm), throughAm);
    assert.deepEqual(window1.map((t) => String(t.id)), ["v1"]);

    const window2 = tripsInWindow(trips, truckId, throughAm, throughPm);
    assert.deepEqual(window2.map((t) => String(t.id)), ["v2", "v3"]);
  });

  it("incluye viaje en el timestamp exacto del límite superior (through]", () => {
    const boundary = utcWallClockMs("2026-06-02", "14:00:00");
    const atBoundary = mockTrip({
      id: "vb",
      truck_id: truckId,
      fecha_salida: "2026-06-02T14:00:00.000Z",
      km_inicial: 100,
      km_final: 110,
    });
    const window = tripsInWindow([atBoundary], truckId, utcWallClockMs("2026-06-02", "08:00:00"), boundary);
    assert.deepEqual(window.map((t) => String(t.id)), ["vb"]);

    const nextWindow = tripsInWindow([atBoundary], truckId, boundary, Date.parse("2026-06-30T23:59:59.999Z"));
    assert.equal(nextWindow.length, 0);
  });

  it("incluye viajes posteriores al último ticket hasta fin de período", () => {
    const prevEnd = Date.parse("2026-06-02T23:59:59.999Z");
    const window = tripsInWindow(trips, truckId, prevEnd, Date.parse("2026-06-30T23:59:59.999Z"));
    assert.deepEqual(window.map((t) => String(t.id)), ["v3"]);
  });
});

describe("buildProrationBlocks", () => {
  const truckId = "truck-1";
  const fin = "2026-06-30";

  it("sin ticket ancla no absorbe viajes históricos anteriores al primer viaje", () => {
    const trips = [
      mockTrip({ id: "old", truck_id: truckId, fecha_salida: "2024-01-15T10:00:00.000Z", km_inicial: 0, km_final: 100 }),
      mockTrip({ id: "first", truck_id: truckId, fecha_salida: "2026-05-01T00:00:00.000Z", km_inicial: 100, km_final: 200 }),
      mockTrip({ id: "after", truck_id: truckId, fecha_salida: "2026-06-02T09:00:00.000Z", km_inicial: 200, km_final: 250 }),
    ];
    const ticket = mockTicket({ id: "tk1", truck_id: truckId, fecha: "2026-06-02", hora: "08:00:00" });

    const blocks = buildProrationBlocks([ticket], trips, truckId, fin, null);
    assert.equal(blocks.length, 1);
    assert.deepEqual(blocks[0]!.viajes.map((v) => v.trip_id), ["after"]);
  });

  it("con ticket ancla arranca la ventana después de la carga previa", () => {
    const anchor = mockTicket({ id: "anchor", truck_id: truckId, fecha: "2026-05-15", hora: "10:00:00" });
    const ticket = mockTicket({ id: "tk1", truck_id: truckId, fecha: "2026-06-02", hora: "08:00:00" });
    const trips = [
      mockTrip({ id: "beforeAnchor", truck_id: truckId, fecha_salida: "2026-05-10T00:00:00.000Z", km_inicial: 0, km_final: 50 }),
      mockTrip({ id: "afterLoad", truck_id: truckId, fecha_salida: "2026-06-02T09:00:00.000Z", km_inicial: 50, km_final: 100 }),
    ];

    const blocks = buildProrationBlocks([ticket], trips, truckId, fin, anchor);
    assert.deepEqual(blocks[0]!.viajes.map((v) => v.trip_id), ["afterLoad"]);
  });

  it("parte dos tickets del mismo día por hora de carga", () => {
    const ticketAm = mockTicket({ id: "tk1", truck_id: truckId, fecha: "2026-06-02", hora: "08:00:00" });
    const ticketPm = mockTicket({ id: "tk2", truck_id: truckId, fecha: "2026-06-02", hora: "14:00:00" });
    const trips = [
      mockTrip({ id: "v0", truck_id: truckId, fecha_salida: "2026-05-01T00:00:00.000Z", km_inicial: 0, km_final: 40 }),
      mockTrip({ id: "v1", truck_id: truckId, fecha_salida: "2026-06-02T09:00:00.000Z", km_inicial: 40, km_final: 90 }),
      mockTrip({ id: "v2", truck_id: truckId, fecha_salida: "2026-06-02T15:00:00.000Z", km_inicial: 90, km_final: 140 }),
    ];

    const blocks = buildProrationBlocks([ticketAm, ticketPm], trips, truckId, fin, null);
    assert.deepEqual(blocks[0]!.viajes.map((v) => v.trip_id), ["v1"]);
    assert.deepEqual(blocks[1]!.viajes.map((v) => v.trip_id), ["v2"]);
  });

  it("excluye viajes del mismo día anteriores a la hora de carga", () => {
    const ticket = mockTicket({ id: "tk1", truck_id: truckId, fecha: "2026-06-02", hora: "14:00:00" });
    const trips = [
      mockTrip({ id: "before", truck_id: truckId, fecha_salida: "2026-06-02T09:00:00.000Z", km_inicial: 0, km_final: 50 }),
      mockTrip({ id: "after", truck_id: truckId, fecha_salida: "2026-06-02T15:00:00.000Z", km_inicial: 50, km_final: 100 }),
    ];

    const blocks = buildProrationBlocks([ticket], trips, truckId, fin, null);
    assert.deepEqual(blocks[0]!.viajes.map((v) => v.trip_id), ["after"]);
  });

  it("asigna viaje en timestamp exacto del siguiente ticket al ticket anterior", () => {
    const ticketAm = mockTicket({ id: "tk1", truck_id: truckId, fecha: "2026-06-02", hora: "08:00:00" });
    const ticketPm = mockTicket({ id: "tk2", truck_id: truckId, fecha: "2026-06-02", hora: "14:00:00" });
    const trips = [
      mockTrip({ id: "v0", truck_id: truckId, fecha_salida: "2026-05-01T00:00:00.000Z", km_inicial: 0, km_final: 10 }),
      mockTrip({ id: "atBoundary", truck_id: truckId, fecha_salida: "2026-06-02T14:00:00.000Z", km_inicial: 10, km_final: 30 }),
    ];

    const blocks = buildProrationBlocks([ticketAm, ticketPm], trips, truckId, fin, null);
    assert.deepEqual(blocks[0]!.viajes.map((v) => v.trip_id), ["atBoundary"]);
    assert.equal(blocks[1]!.viajes.length, 0);
  });

  it("ticket sin hora incluye viajes del mismo día después de medianoche UTC", () => {
    const ticket = mockTicket({ id: "tk1", truck_id: truckId, fecha: "2026-06-02" });
    const trips = [
      mockTrip({ id: "prior", truck_id: truckId, fecha_salida: "2026-05-01T00:00:00.000Z", km_inicial: 0, km_final: 10 }),
      mockTrip({ id: "sameDay", truck_id: truckId, fecha_salida: "2026-06-02T10:00:00.000Z", km_inicial: 10, km_final: 40 }),
    ];

    const blocks = buildProrationBlocks([ticket], trips, truckId, fin, null);
    assert.deepEqual(blocks[0]!.viajes.map((v) => v.trip_id), ["sameDay"]);
  });
});

describe("tripKmRecorridos", () => {
  it("devuelve 0 si el viaje no tiene km_final", () => {
    const open = mockTrip({ id: "open", truck_id: "t1", fecha_salida: "2026-06-01T00:00:00.000Z", km_inicial: 10 });
    assert.equal(tripKmRecorridos(open), 0);
  });
});

describe("resumenFromBlocks", () => {
  it("cuenta todos los viajes prorrateados aunque su fecha quede antes del filtro", () => {
    const blocks: ProratedTicketBlock[] = [
      {
        ticket_id: "tk1",
        fecha: "2026-06-02",
        litros: 100,
        precio_litro: 30,
        importe_total: 3000,
        odometro: 0,
        ubicacion: "X",
        km_total_periodo: 151,
        rendimiento_periodo: 1.51,
        sin_asignar: false,
        viajes: [
          {
            trip_id: "v0",
            folio: "F0",
            origen: "A",
            destino: "B",
            fecha_salida: "2026-05-30",
            km_recorridos: 1,
            litros_asignados: 0.66,
            costo_asignado: 20,
          },
          {
            trip_id: "v1",
            folio: "F1",
            origen: "A",
            destino: "B",
            fecha_salida: "2026-06-02",
            km_recorridos: 100,
            litros_asignados: 66.67,
            costo_asignado: 2000,
          },
          {
            trip_id: "v2",
            folio: "F2",
            origen: "A",
            destino: "B",
            fecha_salida: "2026-06-15",
            km_recorridos: 50,
            litros_asignados: 33.33,
            costo_asignado: 1000,
          },
        ],
      },
    ];

    const periodTrips = [
      mockTrip({ id: "v1", truck_id: "t1", fecha_salida: "2026-06-02T00:00:00.000Z", km_inicial: 0, km_final: 100 }),
      mockTrip({ id: "v2", truck_id: "t1", fecha_salida: "2026-06-15T00:00:00.000Z", km_inicial: 100, km_final: 150 }),
    ];

    const resumen = resumenFromBlocks(blocks, 100, periodTrips, [], []);
    assert.equal(resumen.total_viajes, 3);
    assert.equal(resumen.total_km_viajes, 151);
    assert.equal(resumen.viajes_en_periodo, 2);
    assert.equal(resumen.rendimiento, 1.51);
  });
});

describe("applyManualAssignments", () => {
  const truckId = "truck-1";
  const fin = "2026-06-30";

  it("asigna manualmente viajes fuera de ventana al ticket del período (caso TL004)", () => {
    const ticket = mockTicket({
      id: "tk1",
      truck_id: truckId,
      fecha: "2026-06-02",
      hora: "08:00:00",
      litros: "191.33",
    });
    const trips = [
      mockTrip({
        id: "v1",
        truck_id: truckId,
        fecha_salida: "2026-06-02T09:00:00.000Z",
        km_inicial: 0,
        km_final: 1,
        folio: "TL004-1",
      }),
      mockTrip({
        id: "v2",
        truck_id: truckId,
        fecha_salida: "2026-06-02T10:00:00.000Z",
        km_inicial: 1,
        km_final: 88,
        folio: "TL004-2",
      }),
      mockTrip({
        id: "v3",
        truck_id: truckId,
        fecha_salida: "2026-06-03T09:00:00.000Z",
        km_inicial: 88,
        km_final: 190,
        folio: "TL004-3",
      }),
      mockTrip({
        id: "v4",
        truck_id: truckId,
        fecha_salida: "2026-06-03T11:00:00.000Z",
        km_inicial: 190,
        km_final: 330,
        folio: "TL004-4",
      }),
    ];

    const anchor = mockTicket({
      id: "anchor",
      truck_id: truckId,
      fecha: "2026-06-02",
      hora: "18:00:00",
    });
    const autoBlocks = buildProrationBlocks([ticket], trips, truckId, fin, anchor);
    assert.deepEqual(autoBlocks[0]!.viajes.map((v) => v.trip_id), ["v3", "v4"]);

    const manualMap = new Map([
      ["v1", "tk1"],
      ["v2", "tk1"],
    ]);
    const blocks = applyManualAssignments(autoBlocks, [ticket], manualMap, trips);

    assert.deepEqual(blocks[0]!.viajes.map((v) => v.trip_id), ["v3", "v4", "v1", "v2"]);
    assert.equal(blocks[0]!.viajes.find((v) => v.trip_id === "v1")?.asignacion_manual, true);
    assert.equal(blocks[0]!.viajes.find((v) => v.trip_id === "v3")?.asignacion_manual, undefined);
    assert.equal(blocks[0]!.km_total_periodo, 330);
    const litrosSum = blocks[0]!.viajes.reduce((s, v) => s + v.litros_asignados, 0);
    assert.ok(Math.abs(litrosSum - 191.33) < 0.1);
  });

  it("devuelve bloques sin cambios cuando no hay overrides", () => {
    const ticket = mockTicket({ id: "tk1", truck_id: truckId, fecha: "2026-06-02", hora: "08:00:00" });
    const trips = [
      mockTrip({ id: "v1", truck_id: truckId, fecha_salida: "2026-06-02T09:00:00.000Z", km_inicial: 0, km_final: 50 }),
    ];
    const autoBlocks = buildProrationBlocks([ticket], trips, truckId, fin, null);
    const blocks = applyManualAssignments(autoBlocks, [ticket], new Map(), trips);
    assert.deepEqual(blocks, autoBlocks);
  });

  it("ignora override manual a ticket fuera del período (viaje permanece en bloque auto)", () => {
    const ticket = mockTicket({
      id: "tk1",
      truck_id: truckId,
      fecha: "2026-06-02",
      hora: "08:00:00",
      litros: "100",
    });
    const trips = [
      mockTrip({
        id: "v1",
        truck_id: truckId,
        fecha_salida: "2026-06-02T09:00:00.000Z",
        km_inicial: 0,
        km_final: 50,
        folio: "V1",
      }),
    ];
    const autoBlocks = buildProrationBlocks([ticket], trips, truckId, fin, null);
    assert.deepEqual(autoBlocks[0]!.viajes.map((v) => v.trip_id), ["v1"]);

    const manualMap = new Map([["v1", "tk-outside-period"]]);
    const blocks = applyManualAssignments(autoBlocks, [ticket], manualMap, trips);

    assert.deepEqual(blocks[0]!.viajes.map((v) => v.trip_id), ["v1"]);
    assert.equal(blocks[0]!.viajes[0]?.asignacion_manual, undefined);
  });
});

describe("partitionPeriodTrips", () => {
  it("separa viajes sin ticket y sin km", () => {
    const periodTrips = [
      mockTrip({ id: "a", truck_id: "t1", fecha_salida: "2026-06-01T00:00:00.000Z", km_inicial: 0, km_final: 10 }),
      mockTrip({ id: "b", truck_id: "t1", fecha_salida: "2026-06-02T00:00:00.000Z", km_inicial: 10, km_final: 50 }),
      mockTrip({ id: "c", truck_id: "t1", fecha_salida: "2026-06-03T00:00:00.000Z", km_inicial: 50 }),
    ];
    const assigned = new Set(["a"]);

    const { sinAsignar, sinKm } = partitionPeriodTrips(periodTrips, assigned);
    assert.deepEqual(sinAsignar.map((t) => t.trip_id), ["b"]);
    assert.deepEqual(sinKm.map((t) => t.trip_id), ["c"]);
  });
});
