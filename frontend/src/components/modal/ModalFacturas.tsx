import { useEffect, useState } from "react";
import { useTlo } from "@/context/TloContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Client, ClientStatus } from "@/types/tlo";
import { fetchClient } from "@/lib/tloApi";
import { toast } from "sonner";

interface ModalFacturasProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string | undefined;
}

export function ModalFacturas({ open, onOpenChange, clientId }: ModalFacturasProps) {
  const { upsertClient } = useTlo();
  const [form, setForm] = useState<Client | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) {
      setForm(null);
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

  const save = () => {
    if (!form) return;
    if (!form.razon_social.trim() || !form.rfc.trim() || !form.contacto.trim() || !form.telefono.trim()) {
      toast.error("Completa razón social, RFC, contacto y teléfono");
      return;
    }
    upsertClient(form);
    toast.success("Cliente actualizado");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Facturar</DialogTitle>
        </DialogHeader>
        {loading || !form ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Cargando datos del cliente…</p>
        ) : (
          <div className="space-y-3">
            <div>
              <Label>Razón social</Label>
              <Input
                value={form.razon_social}
                onChange={(e) => setForm({ ...form, razon_social: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>RFC</Label>
                <Input value={form.rfc} onChange={(e) => setForm({ ...form, rfc: e.target.value })} />
              </div>
              <div>
                <Label>Teléfono</Label>
                <Input value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} />
              </div>
              <div>
                <Label>Contacto</Label>
                <Input value={form.contacto} onChange={(e) => setForm({ ...form, contacto: e.target.value })} />
              </div>
              <div>
                <Label>Correo electrónico</Label>
                <Input
                  type="email"
                  value={form.email ?? ""}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
              <div>
                <Label>Régimen fiscal</Label>
                <Input
                  value={form.regimen_fiscal ?? ""}
                  onChange={(e) => setForm({ ...form, regimen_fiscal: e.target.value })}
                  placeholder="601"
                />
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
            <div className="rounded-md border border-dashed p-3 space-y-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Domicilio fiscal (Carta Porte)
              </p>
              <div>
                <Label>Calle</Label>
                <Input value={form.calle ?? ""} onChange={(e) => setForm({ ...form, calle: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>No. exterior</Label>
                  <Input
                    value={form.numero_exterior ?? ""}
                    onChange={(e) => setForm({ ...form, numero_exterior: e.target.value })}
                  />
                </div>
                <div>
                  <Label>No. interior</Label>
                  <Input
                    value={form.numero_interior ?? ""}
                    onChange={(e) => setForm({ ...form, numero_interior: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Colonia</Label>
                  <Input value={form.colonia ?? ""} onChange={(e) => setForm({ ...form, colonia: e.target.value })} />
                </div>
                <div>
                  <Label>Localidad</Label>
                  <Input
                    value={form.localidad ?? ""}
                    onChange={(e) => setForm({ ...form, localidad: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Municipio</Label>
                  <Input
                    value={form.municipio ?? ""}
                    onChange={(e) => setForm({ ...form, municipio: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Estado</Label>
                  <Input value={form.estado ?? ""} onChange={(e) => setForm({ ...form, estado: e.target.value })} />
                </div>
                <div>
                  <Label>C.P.</Label>
                  <Input
                    value={form.cp ?? ""}
                    onChange={(e) => setForm({ ...form, cp: e.target.value })}
                    maxLength={5}
                  />
                </div>
                <div>
                  <Label>País</Label>
                  <Input
                    value={form.pais ?? "MEX"}
                    onChange={(e) => setForm({ ...form, pais: e.target.value })}
                    maxLength={3}
                  />
                </div>
              </div>
            </div>
            <div>
              <Label>Observaciones</Label>
              <Textarea
                value={form.observaciones ?? ""}
                onChange={(e) => setForm({ ...form, observaciones: e.target.value })}
                rows={3}
              />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={loading || !form} className="bg-primary text-primary-foreground hover:bg-primary-glow">
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
