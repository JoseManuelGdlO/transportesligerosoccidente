import { useEffect, useState } from "react";
import { useTlo } from "@/context/TloContext";
import { ClientFormFields } from "@/components/tlo/ClientFormFields";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import type { Client } from "@/types/tlo";
import { fetchClient } from "@/lib/tloApi";
import {
  CLIENT_FORM_REQUIRED_TOAST,
  hasFormErrors,
  validateClientForm,
  type ClientFormErrors,
} from "@/lib/validateClientForm";
import { toast } from "sonner";

interface ModalFacturasProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string | undefined;
}

export function ModalFacturas({ open, onOpenChange, clientId }: ModalFacturasProps) {
  const { upsertClient } = useTlo();
  const [form, setForm] = useState<Client | null>(null);
  const [fieldErrors, setFieldErrors] = useState<ClientFormErrors>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setForm(null);
      setFieldErrors({});
      return;
    }
    if (!clientId) {
      toast.error("El viaje no tiene cliente asignado");
      onOpenChange(false);
      return;
    }
    setLoading(true);
    void fetchClient(clientId)
      .then((c) => setForm(c))
      .catch((e) => {
        toast.error(e instanceof Error ? e.message : "Error al cargar cliente");
        onOpenChange(false);
      })
      .finally(() => setLoading(false));
  }, [open, clientId, onOpenChange]);

  const handleOpenChange = (next: boolean) => {
    onOpenChange(next);
    if (!next) setFieldErrors({});
  };

  const clearFieldError = (field: keyof ClientFormErrors) => {
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const save = async () => {
    if (!form) return;
    const errors = validateClientForm(form);
    setFieldErrors(errors);
    if (hasFormErrors(errors)) {
      toast.error(CLIENT_FORM_REQUIRED_TOAST);
      return;
    }
    setSaving(true);
    try {
      await upsertClient(form);
      toast.success("Cliente actualizado");
      onOpenChange(false);
      setFieldErrors({});
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al guardar cliente");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Facturar</DialogTitle>
        </DialogHeader>
        {loading || !form ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Cargando datos del cliente…</p>
        ) : (
          <ClientFormFields
            form={form}
            onChange={(patch) => setForm({ ...form, ...patch })}
            fieldErrors={fieldErrors}
            onClearError={clearFieldError}
          />
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button
            onClick={() => void save()}
            disabled={loading || !form || saving}
            className="bg-primary text-primary-foreground hover:bg-primary-glow"
          >
            {saving ? "Guardando…" : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
