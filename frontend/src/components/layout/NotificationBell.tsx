import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/context/AuthContext";
import type { NotificationItem } from "@/types/tlo";
import { fetchNotificationSummary, fetchNotifications, markNotificationRead, markAllNotificationsRead } from "@/lib/tloApi";
import { NOTIFICATIONS_CHANGED_EVENT } from "@/lib/notificationGroups";
import {
  POLL_FALLBACK_MS,
  isNotificationsPushMessage,
  shouldPollNotifications,
} from "@/lib/notificationPolling";
import { toast } from "sonner";

function notificationPermission(): NotificationPermission | "unsupported" {
  return typeof Notification === "undefined" ? "unsupported" : Notification.permission;
}

export function NotificationBell() {
  const { hasPermission, apiMode } = useAuth();
  const nav = useNavigate();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const openRef = useRef(false);
  const revisionRef = useRef("");

  const loadList = useCallback(async () => {
    if (!apiMode || !hasPermission("notificaciones.ver")) return;
    try {
      const list = await fetchNotifications();
      setItems(list);
    } catch {
      /* ignore poll errors */
    }
  }, [apiMode, hasPermission]);

  const loadSummary = useCallback(async () => {
    if (!apiMode || !hasPermission("notificaciones.ver")) return;
    try {
      const summary = await fetchNotificationSummary();
      const prevRevision = revisionRef.current;
      revisionRef.current = summary.revision;
      setUnread(summary.unread);
      if (openRef.current && prevRevision !== summary.revision) {
        await loadList();
      }
    } catch {
      /* ignore poll errors */
    }
  }, [apiMode, hasPermission, loadList]);

  useEffect(() => {
    openRef.current = open;
  }, [open]);

  useEffect(() => {
    void loadSummary();

    const startFallback = () => {
      if (!shouldPollNotifications(notificationPermission(), document.visibilityState === "visible")) {
        return undefined;
      }
      return window.setInterval(() => void loadSummary(), POLL_FALLBACK_MS);
    };

    let intervalId = startFallback();

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void loadSummary();
        if (intervalId != null) window.clearInterval(intervalId);
        intervalId = startFallback();
        return;
      }
      if (intervalId != null) {
        window.clearInterval(intervalId);
        intervalId = undefined;
      }
    };

    const onChanged = () => void loadSummary();
    const onPush = (event: MessageEvent) => {
      if (isNotificationsPushMessage(event.data)) void loadSummary();
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, onChanged);
    navigator.serviceWorker?.addEventListener("message", onPush);

    return () => {
      if (intervalId != null) window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, onChanged);
      navigator.serviceWorker?.removeEventListener("message", onPush);
    };
  }, [loadSummary]);

  if (!apiMode || !hasPermission("notificaciones.ver")) return null;

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) void loadList();
  };

  const onSelect = async (n: NotificationItem) => {
    try {
      if (!n.leida) {
        await markNotificationRead(n.id);
        setUnread((count) => Math.max(0, count - 1));
      }
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, leida: true } : x)));
      const url = typeof n.payload.url === "string" ? n.payload.url : "";
      if (url) {
        nav(url);
      } else {
        const dt = n.payload.documentable_type === "truck" ? "truck" : "driver";
        const id = String(n.payload.documentable_id ?? "");
        if (id) {
          nav(dt === "truck" ? `/camiones?open=${id}` : `/operadores?open=${id}`);
        }
      }
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    }
  };

  const markAll = async () => {
    try {
      await markAllNotificationsRead();
      setItems((prev) => prev.map((x) => ({ ...x, leida: true })));
      setUnread(0);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    }
  };

  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-9 w-9" aria-label="Notificaciones">
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-5 min-w-5 px-1 text-[10px] flex items-center justify-center p-0"
            >
              {unread > 99 ? "99+" : unread}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 max-h-96 overflow-y-auto">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>Avisos</span>
          {items.some((x) => !x.leida) && (
            <Button variant="link" className="h-auto p-0 text-xs" onClick={() => void markAll()}>
              Marcar todas leídas
            </Button>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {items.length === 0 && <div className="px-2 py-4 text-sm text-muted-foreground">Sin notificaciones</div>}
        {items.slice(0, 20).map((n) => (
          <DropdownMenuItem
            key={n.id}
            className={`flex flex-col items-start gap-0.5 cursor-pointer ${!n.leida ? "bg-muted/50" : ""}`}
            onClick={() => void onSelect(n)}
          >
            <span className="text-xs font-medium line-clamp-2">{String(n.payload.title ?? n.tipo)}</span>
            <span className="text-[11px] text-muted-foreground line-clamp-2">{String(n.payload.body ?? "")}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
