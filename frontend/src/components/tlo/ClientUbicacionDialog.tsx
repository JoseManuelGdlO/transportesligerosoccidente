import { useEffect, useState } from "react";
import { DomicilioSatFields } from "@/components/tlo/DomicilioSatFields";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createClientUbicacion, updateClientUbicacion } from "@/lib/tloApi";
import {
  UBICACION_FORM_REQUIRED_TOAST,
  validateClientUbicacionForm,
  type ClientUbicacionFormErrors,
} from "@/lib/validateClientUbicacionForm";
import { hasFormErrors } from "@/lib/validateClientForm";
import { cn } from "@/lib/utils";
import type { ClientStatus, ClientUbicacion, ClientUbicacionTipo } from "@/types/tlo";
import { toast } from "sonner";

export const emptyClientUbicacionForm = (): Omit<ClientUbicacion, "id" | "client_id"> => ({
  nombre: "",
  rfc: "",
  razon_social: "",
  tipo: "Ambos",
  pais: "MEX",
  estatus: "activo",
});

type ClientUbicacionDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  initialValues?: Partial<Omit<ClientUbicacion, "id" | "client_id">>;
  editingId?: string | null;
  onSaved: (ubicacion: ClientUbicacion) => void;
};

export function ClientUbicacionDialog({
  open,
  onOpenChange,
  clientId,
  initialValues,
  editingId = null,
  onSaved,
}: ClientUbicacionDialogProps) {
  const [form, setForm] = useState<Omit<ClientUbicacion, "id" | "client_id">>(emptyClientUbicacionForm());
  const [fieldErrors, setFieldErrors] = useState<ClientUbicacionFormErrors>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setFieldErrors({});
    setForm({
      ...emptyClientUbicacionForm(),
      ...initialValues,
    });
  }, [open, initialValues, editingId]);

  const clearFieldError = (field: keyof ClientUbicacionFormErrors) => {
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const handleOpenChange = (next: boolean) => {
    onOpenChange(next);
    if (!next) setFieldErrors({});
  };

  const save = async () => {
    if (!clientId) {
      toast.error("Cliente no válido");
      return;
    }
    const errors = validateClientUbicacionForm(form);
    setFieldErrors(errors);
    if (hasFormErrors(errors)) {
      toast.error(errors.nombre ? UBICACION_FORM_REQUIRED_TOAST : "Revisa los datos de la ubicación");
      return;
    }
    setSaving(true);
    try {
      const ubicacion = editingId
        ? await updateClientUbicacion(clientId, editingId, form)
        : await createClientUbicacion(clientId, form);
      toast.success(editingId ? "Ubicación actualizada" : "Ubicación registrada");
      handleOpenChange(false);
      onSaved(ubicacion);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al guardar ubicación");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editingId ? "Editar ubicación" : "Nueva ubicación"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="ubic_nombre">
              Nombre de la ubicación<span className="text-destructive ml-0.5">*</span>
            </Label>
            <Input
              id="ubic_nombre"
              required
              value={form.nombre}
              aria-invalid={!!fieldErrors.nombre}
              className={cn(fieldErrors.nombre && "border-destructive")}
              onChange={(e) => {
                setForm({ ...form, nombre: e.target.value });
                clearFieldError("nombre");
              }}
            />
            {fieldErrors.nombre && (
              <p className="text-sm text-destructive mt-1">{fieldErrors.nombre}</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="ubic_rfc">RFC</Label>
              <Input
                id="ubic_rfc"
                value={form.rfc ?? ""}
                aria-invalid={!!fieldErrors.rfc}
                className={cn(fieldErrors.rfc && "border-destructive")}
                onChange={(e) => {
                  setForm({ ...form, rfc: e.target.value });
                  clearFieldError("rfc");
                }}
              />
              {fieldErrors.rfc && (
                <p className="text-sm text-destructive mt-1">{fieldErrors.rfc}</p>
              )}
            </div>
            <div>
              <Label htmlFor="ubic_razon_social">Razón social</Label>
              <Input
                id="ubic_razon_social"
                value={form.razon_social ?? ""}
                aria-invalid={!!fieldErrors.razon_social}
                className={cn(fieldErrors.razon_social && "border-destructive")}
                onChange={(e) => {
                  setForm({ ...form, razon_social: e.target.value });
                  clearFieldError("razon_social");
                }}
              />
              {fieldErrors.razon_social && (
                <p className="text-sm text-destructive mt-1">{fieldErrors.razon_social}</p>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Tipo</Label>
              <Select
                value={form.tipo}
                onValueChange={(v: ClientUbicacionTipo) => setForm({ ...form, tipo: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Origen">Origen</SelectItem>
                  <SelectItem value="Destino">Destino</SelectItem>
                  <SelectItem value="Ambos">Ambos</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Estatus</Label>
              <Select
                value={form.estatus ?? "activo"}
                onValueChange={(v: ClientStatus) => setForm({ ...form, estatus: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="activo">Activo</SelectItem>
                  <SelectItem value="inactivo">Inactivo</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DomicilioSatFields
            idPrefix="ubic"
            value={form}
            onChange={(patch) => setForm({ ...form, ...patch })}
            cpError={fieldErrors.cp}
            paisError={fieldErrors.pais}
            onClearCpError={() => clearFieldError("cp")}
            onClearPaisError={() => clearFieldError("pais")}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={() => void save()} disabled={saving}>
            {saving ? "Guardando…" : "Guardar ubicación"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
