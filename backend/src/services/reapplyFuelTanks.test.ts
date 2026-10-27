import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import type { FuelTicket as FuelTicketModel } from "../models/FuelTicket";
import type { Trip as TripModel } from "../models/Trip";
import {
  applyTankReapply,
  compareTankReapplyMetrics,
  formatRendimientoLabel,
  fuelRendimientoEstado,
  planTankReapply,
  tankMetricReportRows,
  tankReapplyOps,
} from "./reapplyFuelTanks";
import { buildTankBlocks } from "./fuelProrationService";

function mockTicket(partial: {
  id: string;
  truck_id: string;
  fecha: string;
  hora?: string | null;
  litros?: string;
  precio_litro?: string;
  importe_total?: string;
  es_foraneo?: boolean;
  source_trip_id?: string | null;
  prorrateo_confirmado_at?: Date | null;
}): FuelTicketModel {
  return {
    id: partial.id,
    truck_id: partial.truck_id,
    fecha: partial.fecha as unknown as Date,
    hora: partial.hora ?? null,
    litros: partial.litros ?? "100",
    precio_litro: partial.precio_litro ?? "30",
    importe_total: partial.importe_total ?? "3000",
    es_foraneo: partial.es_foraneo ?? false,
    source_trip_id: partial.source_trip_id ?? null,
    prorrateo_confirmado_at: partial.prorrateo_confirmado_at ?? null,
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

function tlo11Fixtures() {
  const tickets = [
    mockTicket({
      id: "foraneo",
      truck_id: "t1",
      fecha: "2026-06-04",
      hora: "12:00:00",
      litros: "150",
      precio_litro: "27.1",
      importe_total: "4065",
      es_foraneo: true,
      source_trip_id: "ida",
    }),
    mockTicket({
      id: "patio",
      truck_id: "t1",
      fecha: "2026-06-02",
      hora: "08:00:00",
      litros: "343.59",
      precio_litro: "29.468",
      importe_total: "10125",
      es_foraneo: false,
      prorrateo_confirmado_at: new Date("2026-06-06T12:00:00.000Z"),
    }),
  ];
  const trips = [
    mockTrip({
      id: "regreso",
      truck_id: "t1",
      fecha_salida: "2026-06-05T08:00:00.000Z",
      km_inicial: 1273,
      km_final: 2159,
      folio: "TLO11-78",
    }),
    mockTrip({
      id: "ida",
      truck_id: "t1",
      fecha_salida: "2026-06-02T10:00:00.000Z",
      km_inicial: 0,
      km_final: 1273,
      folio: "TLO11-77",
    }),
  ];
  return { tickets, trips };
}

describe("planTankReapply", () => {
  it("reparte el patio confirmado y el foráneo pendiente del caso TLO11", () => {
    const { tickets, trips } = tlo11Fixtures();
    const lines = planTankReapply({ id: "t1", numero_economico: "TL011" }, tickets, trips);
    const patio = lines.find((l) => l.ticket_id === "patio")!;
    const foraneo = lines.find((l) => l.ticket_id === "foraneo")!;
    assert.equal(patio.confirmed, true);
    assert.equal(patio.skip_reason, null);
    assert.equal(patio.viajes.find((v) => v.folio === "TLO11-77")!.litros_asignados, 202.59);
    assert.equal(foraneo.confirmed, false);
    assert.equal(foraneo.viajes.find((v) => v.folio === "TLO11-78")!.litros_asignados, 61.56);
  });

  it("marca sin viajes con km cuando el tanque confirmado no tiene kilómetros", () => {
    const tickets = [
      mockTicket({
        id: "vacio",
        truck_id: "t1",
        fecha: "2026-06-02",
        hora: "08:00:00",
        litros: "100",
        prorrateo_confirmado_at: new Date("2026-06-03T00:00:00.000Z"),
      }),
    ];
    const lines = planTankReapply({ id: "t1", numero_economico: "TL011" }, tickets, []);
    assert.equal(lines[0]!.skip_reason, "sin viajes con km");
    assert.deepEqual(lines[0]!.viajes, []);
  });
});

describe("applyTankReapply", () => {
  it("reabre y confirma el patio, y solo guarda el borrador del foráneo", async () => {
    const calls: string[] = [];
    const reopen = mock.method(tankReapplyOps, "reopenTicketProration", async () => {
      calls.push("reopen");
    });
    const saveTicket = mock.method(
      tankReapplyOps,
      "saveTicketAssignments",
      async (_tenant: string, _ticketId: string, tripIds: string[]) => {
        calls.push(`save:${tripIds.join(",")}`);
      },
    );
    const confirm = mock.method(tankReapplyOps, "confirmTicketProration", async () => {
      calls.push("confirm");
    });
    const saveDraft = mock.method(
      tankReapplyOps,
      "saveDraftAssignmentsForTruck",
      async (_tenant: string, _truckId: string, pairs: { trip_id: string }[]) => {
        calls.push(`draft:${pairs.map((p) => p.trip_id).join(",")}`);
      },
    );

    const { tickets, trips } = tlo11Fixtures();
    const lines = planTankReapply({ id: "t1", numero_economico: "TL011" }, tickets, trips);
    const tx = { id: "outer-tx" };
    const result = await applyTankReapply("tenant-1", lines, tx as never);

    assert.equal(reopen.mock.calls[0]!.arguments[2], tx);
    assert.equal(saveTicket.mock.calls[0]!.arguments[3], tx);
    assert.equal(confirm.mock.calls[0]!.arguments[2], tx);
    assert.equal(saveDraft.mock.calls[0]!.arguments[3], tx);

    assert.deepEqual(calls, ["reopen", "save:ida,regreso", "confirm", "draft:ida,regreso"]);
    assert.equal(result.applied, 2);
    assert.equal(result.skipped, 0);

    reopen.mock.restore();
    saveTicket.mock.restore();
    confirm.mock.restore();
    saveDraft.mock.restore();
  });

  it("no reabre un ticket confirmado sin viajes con km", async () => {
    const reopen = mock.method(tankReapplyOps, "reopenTicketProration", async () => {});
    const saveTicket = mock.method(tankReapplyOps, "saveTicketAssignments", async () => {});
    const confirm = mock.method(tankReapplyOps, "confirmTicketProration", async () => {});
    const saveDraft = mock.method(tankReapplyOps, "saveDraftAssignmentsForTruck", async () => {});

    const tickets = [
      mockTicket({
        id: "vacio",
        truck_id: "t1",
        fecha: "2026-06-02",
        hora: "08:00:00",
        litros: "100",
        prorrateo_confirmado_at: new Date("2026-06-03T00:00:00.000Z"),
      }),
    ];
    const lines = planTankReapply({ id: "t1", numero_economico: "TL011" }, tickets, []);
    const result = await applyTankReapply("tenant-1", lines);

    assert.equal(reopen.mock.callCount(), 0);
    assert.equal(saveTicket.mock.callCount(), 0);
    assert.equal(confirm.mock.callCount(), 0);
    assert.equal(saveDraft.mock.callCount(), 0);
    assert.equal(result.skipped, 1);
    assert.equal(result.applied, 0);

    reopen.mock.restore();
    saveTicket.mock.restore();
    confirm.mock.restore();
    saveDraft.mock.restore();
  });
});

describe("compareTankReapplyMetrics", () => {
  it("muestra el km/L actual vs el de la regla de tanque sin escribir", () => {
    const { tickets, trips } = tlo11Fixtures();
    const lines = planTankReapply({ id: "t1", numero_economico: "TL011" }, tickets, trips);
    const pendingBlocks = buildTankBlocks(tickets, trips).filter((b) => b.ticket_id === "foraneo");
    const snapshot = compareTankReapplyMetrics({
      truck: { id: "t1", numero_economico: "TL011" },
      trips,
      lines,
      confirmedLitros: [{ trip_id: "ida", litros: 343.59 }],
      pendingBlocks,
      orphanLoads: [],
    });
    assert.equal(snapshot.km, 2159);
    assert.equal(snapshot.litros_antes, 493.59);
    assert.equal(snapshot.rendimiento_antes, 4.37);
    assert.equal(snapshot.litros_despues, 493.59);
    assert.equal(snapshot.rendimiento_despues, 4.37);
  });

  it("detecta cuando los litros guardados cambian el rendimiento", () => {
    const { tickets, trips } = tlo11Fixtures();
    const lines = planTankReapply({ id: "t1", numero_economico: "TL011" }, tickets, trips);
    const snapshot = compareTankReapplyMetrics({
      truck: { id: "t1", numero_economico: "TL011" },
      trips,
      lines,
      confirmedLitros: [{ trip_id: "ida", litros: 100 }],
      pendingBlocks: [],
      orphanLoads: [],
    });
    assert.equal(snapshot.litros_antes, 100);
    assert.equal(snapshot.rendimiento_antes, 21.59);
    assert.equal(snapshot.litros_despues, 493.59);
    assert.equal(snapshot.rendimiento_despues, 4.37);
  });
});

describe("formatRendimientoLabel", () => {
  it("copia el texto del reporte de combustible", () => {
    assert.equal(formatRendimientoLabel(4.5, 3), "Rendimiento 4.50 km/L / 3.0 esp.");
    assert.equal(fuelRendimientoEstado(4.5, 3), "OK");
    assert.equal(fuelRendimientoEstado(21.59, 3), "Faltan litros");
    assert.equal(fuelRendimientoEstado(2, 3), "Bajo rendimiento");
  });

  it("arma las filas del Excel con actual vs tanque", () => {
    const rows = tankMetricReportRows([
      {
        truck_id: "t1",
        numero_economico: "TL011",
        viajes: 2,
        km: 2159,
        litros_antes: 100,
        litros_despues: 493.59,
        rendimiento_esperado: 3,
        rendimiento_antes: 21.59,
        rendimiento_despues: 4.37,
      },
    ]);
    assert.equal(rows[0]!.rendimiento_antes, "Rendimiento 21.59 km/L / 3.0 esp.");
    assert.equal(rows[0]!.rendimiento_despues, "Rendimiento 4.37 km/L / 3.0 esp.");
    assert.equal(rows[0]!.estado_antes, "Faltan litros");
    assert.equal(rows[0]!.estado_despues, "OK");
  });
});
