import { useEffect, useState, useCallback } from "react";
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
import { fetchNotifications, markNotificationRead, markAllNotificationsRead } from "@/lib/tloApi";
import { toast } from "sonner";

export function NotificationBell() {
  const { hasPermission, apiMode } = useAuth();
  const nav = useNavigate();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    if (!apiMode || !hasPermission("notificaciones.ver")) return;
    try {
      const list = await fetchNotifications();
      setItems(list);
    } catch {
      /* ignore poll errors */
    }
  }, [apiMode, hasPermission]);

  useEffect(() => {
    void load();
    const t = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(t);
  }, [load]);

  if (!apiMode || !hasPermission("notificaciones.ver")) return null;

  const unread = items.filter((x) => !x.leida).length;

  const onSelect = async (n: NotificationItem) => {
    try {
      if (!n.leida) await markNotificationRead(n.id);
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, leida: true } : x)));
      const dt = n.payload.documentable_type === "truck" ? "truck" : "driver";
      const id = String(n.payload.documentable_id ?? "");
      if (id) {
        nav(dt === "truck" ? `/camiones?open=${id}` : `/operadores?open=${id}`);
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
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    }
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
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
