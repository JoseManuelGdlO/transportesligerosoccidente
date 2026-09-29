import { describe, expect, it } from "vitest";
import { endOfMonth, endOfWeek, isoDay, startOfMonth, startOfWeek } from "@/lib/format";

describe("isoDay", () => {
  it("conserva el domingo local aunque en UTC ya sea lunes", () => {
    const wednesday = new Date(2026, 8, 23, 12, 0, 0);
    expect(isoDay(startOfWeek(wednesday))).toBe("2026-09-21");
    expect(isoDay(endOfWeek(wednesday))).toBe("2026-09-27");
  });
});

describe("mes actual", () => {
  it("va del día 1 al último día del mes, en hora local", () => {
    const mid = new Date(2026, 8, 29, 23, 59, 59, 999);
    expect(isoDay(startOfMonth(mid))).toBe("2026-09-01");
    expect(isoDay(endOfMonth(mid))).toBe("2026-09-30");
  });
});
