import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { fetchPushPublicKey, subscribePush } from "@/lib/tloApi";
import { apiBaseUrl } from "@/lib/api";
import { toast } from "sonner";
import { BellRing, X } from "lucide-react";

const DISMISSED_KEY = "tlo_push_banner_dismissed";

export function PushOptInBanner() {
  const { hasPermission, apiMode } = useAuth();
  const [dismissed, setDismissed] = useState(() => sessionStorage.getItem(DISMISSED_KEY) === "1");
  const [publicKey, setPublicKey] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!apiMode || !hasPermission("documentos.ver")) return;
    let cancel = false;
    void (async () => {
      const k = await fetchPushPublicKey();
      if (!cancel) setPublicKey(k);
    })();
    return () => {
      cancel = true;
    };
  }, [apiMode, hasPermission]);

  if (!apiMode || !hasPermission("documentos.ver") || dismissed) return null;
  if (publicKey === undefined) return null;
  if (publicKey === null) return null;
  if (typeof Notification === "undefined") return null;
  if (Notification.permission === "granted") return null;
  if (!apiBaseUrl()) return null;

  const urlOk =
    window.location.protocol === "https:" || window.location.hostname === "localhost";

  function dismiss() {
    sessionStorage.setItem(DISMISSED_KEY, "1");
    setDismissed(true);
  }

  const enable = async () => {
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        toast.message("Permiso de notificaciones denegado");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      const j = sub.toJSON();
      if (!j.endpoint || !j.keys?.p256dh || !j.keys?.auth) throw new Error("Suscripción incompleta");
      await subscribePush({
        endpoint: j.endpoint,
        keys: { p256dh: j.keys.p256dh, auth: j.keys.auth },
      });
      toast.success("Avisos del navegador activados");
      dismiss();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo activar");
    } finally {
      setBusy(false);
    }
  };

  if (!urlOk && Notification.permission === "default") {
    return (
      <div className="mx-4 mb-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
        Los avisos en el navegador requieren HTTPS. Seguirás viendo avisos en la campana del panel.
        <Button variant="link" className="h-auto p-0 ml-2 text-xs" onClick={() => dismiss()}>
          Cerrar
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-4 mb-2 flex flex-wrap items-center justify-between gap-2 rounded-md border bg-card px-3 py-2 text-sm">
      <div className="flex items-center gap-2 min-w-0">
        <BellRing className="h-4 w-4 shrink-0 text-primary" />
        <span className="text-muted-foreground">
          Recibe avisos de documentos por vencer también fuera de la app (navegador).
        </span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Button size="sm" disabled={busy} onClick={() => void enable()}>
          Activar
        </Button>
        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={dismiss} aria-label="Cerrar aviso">
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function urlBase64ToUint8Array(base64String: string): BufferSource {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
