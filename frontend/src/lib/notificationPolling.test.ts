import { describe, expect, it } from "vitest";
import { isNotificationsPushMessage, shouldPollNotifications } from "./notificationPolling";

describe("shouldPollNotifications", () => {
  it("no hace polling si el permiso ya está granted aunque la pestaña esté visible", () => {
    expect(shouldPollNotifications("granted", true)).toBe(false);
  });

  it("hace el respaldo con denied o default solo si la pestaña está visible", () => {
    expect(shouldPollNotifications("denied", true)).toBe(true);
    expect(shouldPollNotifications("default", true)).toBe(true);
    expect(shouldPollNotifications("denied", false)).toBe(false);
    expect(shouldPollNotifications("default", false)).toBe(false);
  });

  it("hace el respaldo visible cuando Notification no existe", () => {
    expect(shouldPollNotifications("unsupported", true)).toBe(true);
    expect(shouldPollNotifications("unsupported", false)).toBe(false);
  });
});

describe("isNotificationsPushMessage", () => {
  it("acepta el mensaje del service worker", () => {
    expect(isNotificationsPushMessage({ type: "tlo:notifications-push" })).toBe(true);
  });

  it("rechaza otro type y valores que no son objeto", () => {
    expect(isNotificationsPushMessage({ type: "otro" })).toBe(false);
    expect(isNotificationsPushMessage(null)).toBe(false);
    expect(isNotificationsPushMessage("tlo:notifications-push")).toBe(false);
  });
});
