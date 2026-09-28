import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertAdjustmentChain,
  previewFromTrips,
  resolveLastKmForTruck,
  type AffectedTrip,
  type OdometerAdjustment,
} from "./odometerResetService";
import type { OdometerResetPeer } from "./odometerEpoch";

function trip(partial: {
  id: string;
  folio?: string;
  salida: string;
  llegada?: string | null;
  km_inicial: number;
  km_final: number | null;
  cerrado?: boolean;
  enCurso?: boolean;
}) {
  return {
    id: partial.id,
    folio: partial.folio ?? partial.id,
    origen: "A",
    destino: "B",
    fecha_salida: new Date(partial.salida),
    fecha_llegada: partial.llegada ? new Date(partial.llegada) : null,
    km_inicial: partial.km_inicial,
    km_final: partial.km_final,
    cerrado: partial.cerrado ?? partial.km_final != null,
    enCurso: partial.enCurso ?? false,
  };
}

const reset: OdometerResetPeer = {
  id: "r1",
  effective_at: new Date("2026-06-10T06:00:00.000Z"),
  old_km: 600000,
  new_km: 1221,
  motivo: "hubodómetro",
};

describe("resolveLastKmForTruck", () => {
  it("sin reinicio usa el mayor km final", () => {
    const km = resolveLastKmForTruck({
      resets: [],
      closedTrips: [
        {
          km_inicial: 100,
          km_final: 200,
          fecha_salida: new Date("2026-06-02T00:00:00.000Z"),
          fecha_llegada: null,
        },
        {
          km_inicial: 200,
          km_final: 150,
          fecha_salida: new Date("2026-06-03T00:00:00.000Z"),
          fecha_llegada: null,
        },
      ],
    });
    assert.equal(km, 200);
  });

  it("con reinicio y sin viajes posteriores sugiere el km nuevo", () => {
    const km = resolveLastKmForTruck({
      resets: [reset],
      closedTrips: [
        {
          km_inicial: 599000,
          km_final: 600000,
          fecha_salida: new Date("2026-06-01T00:00:00.000Z"),
          fecha_llegada: null,
        },
      ],
    });
    assert.equal(km, 1221);
  });

  it("con reinicio usa el último viaje cerrado de la época nueva", () => {
    const km = resolveLastKmForTruck({
      resets: [reset],
      closedTrips: [
        {
          km_inicial: 599000,
          km_final: 600000,
          fecha_salida: new Date("2026-06-01T00:00:00.000Z"),
          fecha_llegada: null,
        },
        {
          km_inicial: 1221,
          km_final: 1400,
          fecha_salida: new Date("2026-06-11T00:00:00.000Z"),
          fecha_llegada: null,
        },
        {
          km_inicial: 1400,
          km_final: 1550,
          fecha_salida: new Date("2026-06-12T00:00:00.000Z"),
          fecha_llegada: null,
        },
      ],
    });
    assert.equal(km, 1550);
  });
});

describe("previewFromTrips", () => {
  const at = new Date("2026-06-10T06:00:00.000Z");

  it("lista solo viajes cerrados o en curso desde la fecha", () => {
    const preview = previewFromTrips(
      [
        trip({ id: "1", salida: "2026-06-01T08:00:00.000Z", km_inicial: 100, km_final: 200 }),
        trip({
          id: "2",
          salida: "2026-06-11T08:00:00.000Z",
          llegada: "2026-06-11T18:00:00.000Z",
          km_inicial: 200,
          km_final: 250,
        }),
        trip({
          id: "3",
          salida: "2026-06-12T08:00:00.000Z",
          km_inicial: 250,
          km_final: null,
          cerrado: false,
          enCurso: true,
        }),
      ],
      at,
    );
    assert.equal(preview.blocked_reason, null);
    assert.deepEqual(
      preview.affected.map((t) => t.id),
      ["2", "3"],
    );
  });

  it("bloquea si hay un viaje en curso anterior a la fecha", () => {
    const preview = previewFromTrips(
      [
        trip({
          id: "open",
          folio: "TLO-9",
          salida: "2026-06-01T08:00:00.000Z",
          km_inicial: 100,
          km_final: null,
          cerrado: false,
          enCurso: true,
        }),
      ],
      at,
    );
    assert.match(preview.blocked_reason ?? "", /TLO-9/);
    assert.equal(preview.affected.length, 0);
  });
});

describe("assertAdjustmentChain", () => {
  const affected: AffectedTrip[] = [
    {
      id: "a",
      folio: "TLO-1",
      origen: "A",
      destino: "B",
      fecha_salida: "2026-06-11T08:00:00.000Z",
      fecha_llegada: "2026-06-11T18:00:00.000Z",
      km_inicial: 600000,
      km_final: 600100,
      cerrado: true,
    },
    {
      id: "b",
      folio: "TLO-2",
      origen: "B",
      destino: "C",
      fecha_salida: "2026-06-12T08:00:00.000Z",
      fecha_llegada: "2026-06-12T18:00:00.000Z",
      km_inicial: 600100,
      km_final: 600200,
      cerrado: true,
    },
  ];

  it("acepta la cadena que arranca en el km nuevo", () => {
    const adjustments: OdometerAdjustment[] = [
      { trip_id: "a", km_inicial: 1221, km_final: 1300 },
      { trip_id: "b", km_inicial: 1300, km_final: 1410 },
    ];
    assert.doesNotThrow(() => assertAdjustmentChain(affected, adjustments, 1221));
  });

  it("rechaza un eslabón que no continúa el km final anterior", () => {
    const adjustments: OdometerAdjustment[] = [
      { trip_id: "a", km_inicial: 1221, km_final: 1300 },
      { trip_id: "b", km_inicial: 1290, km_final: 1410 },
    ];
    assert.throws(() => assertAdjustmentChain(affected, adjustments, 1221), /km inicial de TLO-2/);
  });
});
