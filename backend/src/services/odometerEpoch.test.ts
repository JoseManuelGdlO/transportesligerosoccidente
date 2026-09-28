import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { findApplicableReset, peersInSameEpoch, type OdometerResetPeer } from "./odometerEpoch";

function reset(id: string, at: string, newKm: number): OdometerResetPeer {
  return {
    id,
    effective_at: new Date(at),
    old_km: 600000,
    new_km: newKm,
    motivo: "hubodómetro",
  };
}

describe("odometer epoch", () => {
  const resets = [reset("r1", "2026-06-10T06:00:00.000Z", 1221)];

  it("elige el reinicio vigente y no uno futuro", () => {
    assert.equal(findApplicableReset(resets, new Date("2026-06-09T00:00:00.000Z")), null);
    assert.equal(findApplicableReset(resets, new Date("2026-06-10T06:00:00.000Z"))?.id, "r1");
    assert.equal(findApplicableReset(resets, new Date("2026-07-01T00:00:00.000Z"))?.new_km, 1221);
  });

  it("deja fuera de la época los viajes anteriores al corte", () => {
    const peers = [
      { id: "a", fecha_salida: new Date("2026-06-01T08:00:00.000Z") },
      { id: "b", fecha_salida: new Date("2026-06-10T08:00:00.000Z") },
    ];
    const scoped = peersInSameEpoch(peers, resets, new Date("2026-06-11T08:00:00.000Z"));
    assert.deepEqual(scoped.map((p) => p.id), ["b"]);
  });
});
