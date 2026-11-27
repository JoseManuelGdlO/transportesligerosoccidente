export const POLL_FALLBACK_MS = 900_000;

export function shouldPollNotifications(
  permission: NotificationPermission | "unsupported",
  visible: boolean,
): boolean {
  return visible && permission !== "granted";
}

export function isNotificationsPushMessage(data: unknown): boolean {
  return (
    typeof data === "object" &&
    data !== null &&
    "type" in data &&
    (data as { type: unknown }).type === "tlo:notifications-push"
  );
}
