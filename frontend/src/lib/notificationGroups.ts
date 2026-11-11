import type { NotificationItem } from "@/types/tlo";

export type NotificationGroupKey = "documentos" | "mantenimiento" | "otros";

export const NOTIFICATIONS_CHANGED_EVENT = "tlo:notifications-changed";

const DOCUMENT_TYPES = new Set(["document.vencido", "document.por_vencer"]);
const MAINTENANCE_TYPES = new Set(["mantenimiento_km", "mantenimiento_tiempo"]);

export function notificationGroup(tipo: string): NotificationGroupKey {
  if (DOCUMENT_TYPES.has(tipo)) return "documentos";
  if (MAINTENANCE_TYPES.has(tipo)) return "mantenimiento";
  return "otros";
}

export function groupUnreadNotifications(items: NotificationItem[]): Record<NotificationGroupKey, NotificationItem[]> {
  const grouped: Record<NotificationGroupKey, NotificationItem[]> = {
    documentos: [],
    mantenimiento: [],
    otros: [],
  };
  for (const item of items) {
    if (item.leida) continue;
    grouped[notificationGroup(item.tipo)].push(item);
  }
  return grouped;
}

export function emitNotificationsChanged(): void {
  window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT));
}
