import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { notificationRevision } from "./notificationSummary";

describe("notificationRevision", () => {
  it("arma unread con MAX(updated_at) en ISO", () => {
    assert.equal(notificationRevision(3, new Date("2026-11-27T16:00:00.000Z")), "3:2026-11-27T16:00:00.000Z");
  });

  it("usa iso vacío cuando no hay filas", () => {
    assert.equal(notificationRevision(0, null), "0:");
  });
});
