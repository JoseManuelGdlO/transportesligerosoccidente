import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Pencil } from "lucide-react";
import type { Supplier } from "@/types/tlo";
import { deleteSupplierApi, fetchSuppliers, upsertSupplierApi } from "@/lib/tloApi";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";

const empty: Supplier = {
  id: "",
  razon_social: "",
  estatus: "activo",
};

export default function Proveedores() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission("proveedores.gestionar");
  const canList = hasPermission("proveedores.ver") || hasPermission("cuentas.ver");
  const [rows, setRows] = useState<Supplier[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Supplier>(empty);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setRows(await fetchSuppliers());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al cargar proveedores");
    }
  }, []);

  useEffect(() => {
    if (canList) void load();
  }, [canList, load]);

  if (!canList) {
    return <p className="text-sm text-muted-foreground">No tienes permiso para ver proveedores.</p>;
  }

  const openDialog = (row?: Supplier) => {
    setForm(row ? { ...row } : { ...empty, id: "" });
    setOpen(true);
  };

  const save = async () => {
    if (!form.razon_social.trim()) {
      toast.error("La razón social es requerida");
      return;
    }
    setSaving(true);
    try {
      await upsertSupplierApi(form);
      toast.success(form.id ? "Proveedor actualizado" : "Proveedor registrado");
      setOpen(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{rows.length} proveedores registrados</p>
        {canManage && (
          <Button size="sm" onClick={() => openDialog()}>
            <Plus className="h-4 w-4 mr-1" /> Nuevo proveedor
          </Button>
        )}
      </div>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Razón social</TableHead>
              <TableHead>RFC</TableHead>
              <TableHead>Contacto</TableHead>
              <TableHead>Teléfono</TableHead>
              <TableHead>Días crédito</TableHead>
              <TableHead>Estatus</TableHead>
              <TableHead className="w-20" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.razon_social}</TableCell>
                <TableCell>{r.rfc || "—"}</TableCell>
                <TableCell>{r.contacto || "—"}</TableCell>
                <TableCell>{r.telefono || "—"}</TableCell>
                <TableCell>{r.dias_credito != null ? r.dias_credito : "No especificado"}</TableCell>
                <TableCell>{r.estatus}</TableCell>
                <TableCell>
                  {canManage && (
                    <Button variant="ghost" size="icon" onClick={() => openDialog(r)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {!rows.length && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                  Sin proveedores
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{form.id ? "Editar proveedor" : "Nuevo proveedor"}</DialogTitle>
          </DialogHeader>
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
                <Input value={form.rfc ?? ""} onChange={(e) => setForm({ ...form, rfc: e.target.value })} />
              </div>
              <div>
                <Label>Días de crédito</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.dias_credito ?? ""}
                  placeholder="No especificado"
                  onChange={(e) =>
                    setForm({
                      ...form,
                      dias_credito: e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                />
              </div>
              <div>
                <Label>Contacto</Label>
                <Input
                  value={form.contacto ?? ""}
                  onChange={(e) => setForm({ ...form, contacto: e.target.value })}
                />
              </div>
              <div>
                <Label>Teléfono</Label>
                <Input
                  value={form.telefono ?? ""}
                  onChange={(e) => setForm({ ...form, telefono: e.target.value })}
                />
              </div>
              <div>
                <Label>Email</Label>
                <Input
                  value={form.email ?? ""}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
              <div>
                <Label>Estatus</Label>
                <Select
                  value={form.estatus ?? "activo"}
                  onValueChange={(v) => setForm({ ...form, estatus: v as "activo" | "inactivo" })}
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
            <div>
              <Label>Observaciones</Label>
              <Textarea
                value={form.observaciones ?? ""}
                onChange={(e) => setForm({ ...form, observaciones: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            {form.id && canManage && (
              <Button
                variant="destructive"
                onClick={async () => {
                  try {
                    await deleteSupplierApi(form.id);
                    toast.success("Proveedor eliminado");
                    setOpen(false);
                    await load();
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "No se pudo eliminar");
                  }
                }}
              >
                Eliminar
              </Button>
            )}
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => void save()} disabled={saving}>
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
