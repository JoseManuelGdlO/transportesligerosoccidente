import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/context/AuthContext";
import type { NotificationItem } from "@/types/tlo";
import { fetchNotifications, markNotificationRead } from "@/lib/tloApi";
import {
  emitNotificationsChanged,
  groupUnreadNotifications,
  type NotificationGroupKey,
} from "@/lib/notificationGroups";
import { toast } from "sonner";

const GROUP_ORDER: { key: NotificationGroupKey; label: string }[] = [
  { key: "documentos", label: "Documentos" },
  { key: "mantenimiento", label: "Mantenimiento" },
  { key: "otros", label: "Otros" },
];

export function LoginNoticeDialog() {
  const { apiMode, loginNoticePending, dismissLoginNotice, hasPermission } = useAuth();
  const [items, setItems] = useState<NotificationItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [revealed, setRevealed] = useState(false);

  const canShow = apiMode && loginNoticePending && hasPermission("notificaciones.ver");

  useEffect(() => {
    if (!canShow) {
      setItems(null);
      setError(null);
      setRevealed(false);
      return;
    }

    let cancelled = false;
    setItems(null);
    setError(null);
    setRevealed(false);

    void fetchNotifications()
      .then((list) => {
        if (cancelled) return;
        const unread = list.filter((x) => !x.leida);
        if (unread.length === 0) {
          dismissLoginNotice();
          return;
        }
        setItems(unread);
        setRevealed(true);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "No se pudieron cargar los avisos");
        setItems([]);
        setRevealed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [canShow, dismissLoginNotice]);

  const markOne = useCallback(async (id: string) => {
    setBusy(true);
    try {
      await markNotificationRead(id);
      setItems((prev) => (prev ?? []).filter((x) => x.id !== id));
      emitNotificationsChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }, []);

  const markVisible = useCallback(async () => {
    const current = items ?? [];
    if (current.length === 0) return;
    setBusy(true);
    try {
      await Promise.all(current.map((n) => markNotificationRead(n.id)));
      setItems([]);
      emitNotificationsChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }, [items]);

  const grouped = groupUnreadNotifications(items ?? []);
  const open = canShow && revealed;

  return (
    <AlertDialog open={open} onOpenChange={() => undefined}>
      <AlertDialogContent
        className="max-w-lg max-h-[90vh] overflow-hidden"
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>Avisos pendientes</AlertDialogTitle>
          <AlertDialogDescription>
            Revisa los avisos. Márcalos como leídos si ya no deben aparecer al iniciar sesión.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {items && items.length > 0 && (
          <div className="max-h-[60vh] overflow-y-auto pr-1 space-y-4">
            <div className="flex justify-end">
              <Button variant="link" className="h-auto p-0 text-xs" disabled={busy} onClick={() => void markVisible()}>
                Marcar todas
              </Button>
            </div>
            {GROUP_ORDER.map(({ key, label }) => {
              const groupItems = grouped[key];
              if (groupItems.length === 0) return null;
              return (
                <section key={key}>
                  <h3 className="text-sm font-semibold mb-2">{label}</h3>
                  <ul className="space-y-2">
                    {groupItems.map((n) => (
                      <li key={n.id} className="rounded-md border bg-muted/40 px-3 py-2">
                        <p className="text-sm font-medium leading-snug">{String(n.payload.title ?? n.tipo)}</p>
                        {n.payload.body != null && String(n.payload.body) !== "" && (
                          <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                            {String(n.payload.body)}
                          </p>
                        )}
                        <Button
                          variant="link"
                          className="h-auto p-0 mt-1 text-xs"
                          disabled={busy}
                          onClick={() => void markOne(n.id)}
                        >
                          Marcar leída
                        </Button>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        )}

        {items && items.length === 0 && !error && (
          <p className="text-sm text-muted-foreground">No quedan avisos pendientes.</p>
        )}

        <AlertDialogFooter>
          <Button type="button" onClick={() => dismissLoginNotice()} disabled={busy}>
            Aceptar
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
