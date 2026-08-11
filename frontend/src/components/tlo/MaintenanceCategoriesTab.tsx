import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil } from "lucide-react";
import type { MaintenanceCategory } from "@/types/tlo";
import {
  deleteMaintenanceCategoryApi,
  fetchMaintenanceCategories,
  upsertMaintenanceCategoryApi,
} from "@/lib/tloApi";
import { toast } from "sonner";

const empty: MaintenanceCategory = {
  id: "",
  nombre: "",
  estatus: "activo",
};

type Props = {
  canEdit: boolean;
  onChanged?: (rows: MaintenanceCategory[]) => void;
};

export function MaintenanceCategoriesTab({ canEdit, onChanged }: Props) {
  const [rows, setRows] = useState<MaintenanceCategory[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<MaintenanceCategory>(empty);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchMaintenanceCategories();
      setRows(data);
      onChanged?.(data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al cargar categorías");
    } finally {
      setLoading(false);
    }
  }, [onChanged]);

  useEffect(() => {
    void load();
  }, [load]);

  const openDialog = (row?: MaintenanceCategory) => {
    setForm(row ? { ...row } : { ...empty, id: "" });
    setOpen(true);
  };

  const save = async () => {
    if (!form.nombre.trim()) {
      toast.error("El nombre es requerido");
      return;
    }
    setSaving(true);
    try {
      await upsertMaintenanceCategoryApi(form);
      toast.success(form.id ? "Categoría actualizada" : "Categoría registrada");
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
        <p className="text-sm text-muted-foreground">
          {loading ? "Cargando…" : `${rows.length} categorías`}
        </p>
        {canEdit && (
          <Button size="sm" onClick={() => openDialog()}>
            <Plus className="h-4 w-4 mr-1" /> Nueva categoría
          </Button>
        )}
      </div>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Descripción</TableHead>
              <TableHead>Estatus</TableHead>
              <TableHead className="w-20" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.nombre}</TableCell>
                <TableCell className="text-muted-foreground">{r.descripcion || "—"}</TableCell>
                <TableCell>{r.estatus ?? "activo"}</TableCell>
                <TableCell>
                  {canEdit && (
                    <Button variant="ghost" size="icon" onClick={() => openDialog(r)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {!rows.length && !loading && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                  Sin categorías. Crea la primera para clasificar los servicios.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{form.id ? "Editar categoría" : "Nueva categoría"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nombre</Label>
              <Input
                value={form.nombre}
                onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              />
            </div>
            <div>
              <Label>Descripción</Label>
              <Textarea
                value={form.descripcion ?? ""}
                onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
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
          <DialogFooter>
            {form.id && canEdit && (
              <Button
                variant="destructive"
                onClick={async () => {
                  try {
                    await deleteMaintenanceCategoryApi(form.id);
                    toast.success("Categoría eliminada");
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
