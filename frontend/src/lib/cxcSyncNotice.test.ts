import { describe, expect, it } from "vitest";
import { cxcSyncNotice } from "./cxcSyncNotice";

describe("cxcSyncNotice", () => {
  it("devuelve null si no hay error", () => {
    expect(cxcSyncNotice(null)).toBeNull();
    expect(cxcSyncNotice("  ")).toBeNull();
    expect(cxcSyncNotice(undefined)).toBeNull();
  });

  it("devuelve el mensaje recortado", () => {
    expect(cxcSyncNotice("  falló CXC  ")).toBe("falló CXC");
  });
});
