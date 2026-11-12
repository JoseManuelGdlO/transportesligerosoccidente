import { useCallback, useEffect, useRef, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  openAuthenticatedFile,
  openBlobInNewTab,
  releaseBlobUrlLater,
  type AuthenticatedBlob,
} from "@/lib/tloApi";

type PendingFile = AuthenticatedBlob & { hardBlocked: boolean };

export function useAuthenticatedFileOpen() {
  const [pending, setPending] = useState<PendingFile | null>(null);
  const pendingRef = useRef<PendingFile | null>(null);

  useEffect(() => {
    return () => {
      const current = pendingRef.current;
      if (current) URL.revokeObjectURL(current.blobUrl);
    };
  }, []);

  const remember = (next: PendingFile | null) => {
    pendingRef.current = next;
    setPending(next);
  };

  const dismiss = useCallback(() => {
    const current = pendingRef.current;
    if (!current) return;
    URL.revokeObjectURL(current.blobUrl);
    remember(null);
  }, []);

  const openFile = useCallback(async (fileUrlPath: string) => {
    const file = await openAuthenticatedFile(fileUrlPath);
    if (!file) return;
    const previous = pendingRef.current;
    if (previous) URL.revokeObjectURL(previous.blobUrl);
    remember({ ...file, hardBlocked: false });
  }, []);

  const openFromDialog = () => {
    const current = pendingRef.current;
    if (!current || current.hardBlocked) return;
    if (openBlobInNewTab(current.blobUrl)) {
      const url = current.blobUrl;
      remember(null);
      releaseBlobUrlLater(url);
      return;
    }
    remember({ ...current, hardBlocked: true });
  };

  const downloadPending = () => {
    const current = pendingRef.current;
    if (!current) return;
    const a = document.createElement("a");
    a.href = current.blobUrl;
    a.download = current.filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const dialog = (
    <Dialog
      open={pending !== null}
      onOpenChange={(open) => {
        if (!open) dismiss();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Tu navegador bloqueó la pestaña.</DialogTitle>
          <DialogDescription>
            {pending?.hardBlocked
              ? "Las ventanas emergentes están bloqueadas en la configuración de este sitio. En la barra de direcciones, abre el icono de ventana bloqueada y permite las pestañas de esta página. Puedes descargar el archivo para verlo ahora."
              : "Pulsa Abrir documento para ver el archivo en una pestaña."}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          {pending?.hardBlocked ? (
            <Button type="button" onClick={downloadPending}>
              <Download className="h-4 w-4 mr-2" />
              Descargar
            </Button>
          ) : (
            <Button type="button" onClick={openFromDialog}>
              Abrir documento
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return { openFile, dialog };
}
