import { describe, expect, it } from "vitest";
import type { NotificationItem } from "@/types/tlo";
import { groupUnreadNotifications, notificationGroup } from "./notificationGroups";

function item(partial: Partial<NotificationItem> & Pick<NotificationItem, "id" | "tipo">): NotificationItem {
  return {
    payload: {},
    alert_date: "2026-11-11",
    leida: false,
    ...partial,
  };
}

describe("notificationGroup", () => {
  it("clasifica vencimientos de documentos", () => {
    expect(notificationGroup("document.vencido")).toBe("documentos");
    expect(notificationGroup("document.por_vencer")).toBe("documentos");
  });

  it("clasifica avisos de mantenimiento", () => {
    expect(notificationGroup("mantenimiento_km")).toBe("mantenimiento");
    expect(notificationGroup("mantenimiento_tiempo")).toBe("mantenimiento");
  });

  it("clasifica combustibles y tipos desconocidos en otros", () => {
    expect(notificationGroup("combustible.sync_ok")).toBe("otros");
    expect(notificationGroup("combustible.sync_error")).toBe("otros");
    expect(notificationGroup("algo.nuevo")).toBe("otros");
  });
});

describe("groupUnreadNotifications", () => {
  it("omite las ya leídas y agrupa el resto", () => {
    const grouped = groupUnreadNotifications([
      item({ id: "d1", tipo: "document.vencido" }),
      item({ id: "read", tipo: "document.por_vencer", leida: true }),
      item({ id: "m1", tipo: "mantenimiento_km" }),
      item({ id: "o1", tipo: "combustible.sync_error" }),
    ]);

    expect(grouped.documentos.map((n) => n.id)).toEqual(["d1"]);
    expect(grouped.mantenimiento.map((n) => n.id)).toEqual(["m1"]);
    expect(grouped.otros.map((n) => n.id)).toEqual(["o1"]);
  });

  it("deja vacíos los grupos sin avisos", () => {
    const grouped = groupUnreadNotifications([item({ id: "m1", tipo: "mantenimiento_tiempo" })]);
    expect(grouped.documentos).toEqual([]);
    expect(grouped.otros).toEqual([]);
    expect(grouped.mantenimiento).toHaveLength(1);
  });
});
