import { useCallback, useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, Search, Trash2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import type { TenantDocumentType } from "@/types/tlo";
import {
  fetchTenantDocumentTypes,
  createDocumentType,
  updateDocumentType,
  deleteDocumentType,
} from "@/lib/tloApi";
import { documentTypeMatchesSearch } from "@/lib/tableFilters";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";

const empty: TenantDocumentType = {
  id: "",
  tenant_id: "",
  slug: "",
  nombre: "",
  aplica_a: "operador",
  dias_aviso: 30,
  requiere_vigencia: true,
  activo: true,
};

export default function TiposDocumento() {
  const { hasPermission, apiMode } = useAuth();
  const canManage = hasPermission("tipos_documento.gestionar");
  const canList = hasPermission("catalogos.ver") || hasPermission("tipos_documento.gestionar");
  const [rows, setRows] = useState<TenantDocumentType[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<TenantDocumentType>(empty);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    if (!apiMode || !canList) return;
    setLoading(true);
    try {
      setRows(await fetchTenantDocumentTypes());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al cargar");
    } finally {
      setLoading(false);
    }
  }, [apiMode, canList]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!apiMode || !canList) {
    return (
      <p className="text-sm text-muted-foreground">
        Conecta la API (y permisos de catálogo o tipos de documento) para ver esta pantalla.
      </p>
    );
  }

  const filteredRows = useMemo(
    () => rows.filter((r) => documentTypeMatchesSearch(r, search)),
    [rows, search],
  );

  const openNew = () => {
    setForm({ ...empty, id: "" });
    setOpen(true);
  };

  const openEdit = (r: TenantDocumentType) => {
    setForm(r);
    setOpen(true);
  };

  const save = async () => {
    try {
      if (!form.slug.trim() || !form.nombre.trim()) {
        toast.error("Slug y nombre son obligatorios");
        return;
      }
      if (form.id) {
        await updateDocumentType(form.id, {
          slug: form.slug,
          nombre: form.nombre,
          aplica_a: form.aplica_a,
          dias_aviso: form.dias_aviso,
          requiere_vigencia: form.requiere_vigencia,
          activo: form.activo,
        });
        toast.success("Tipo actualizado");
      } else {
        await createDocumentType({
          slug: form.slug.trim(),
          nombre: form.nombre.trim(),
          aplica_a: form.aplica_a,
          dias_aviso: form.dias_aviso,
          requiere_vigencia: form.requiere_vigencia,
          activo: form.activo,
        });
        toast.success("Tipo creado");
      }
      setOpen(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al guardar");
    }
  };

  const remove = async (r: TenantDocumentType) => {
    if (!window.confirm(`¿Eliminar "${r.nombre}"?`)) return;
    try {
      await deleteDocumentType(r.id);
      toast.success("Eliminado");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al eliminar");
    }
  };

  return (
    <div className="space-y-4">
      {!canManage && (
        <p className="text-sm text-muted-foreground">
          Solo lectura. Un administrador puede otorgar el permiso “Gestionar tipos de documento” para crear o editar.
        </p>
      )}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            {loading ? "Cargando…" : `${rows.length} tipos configurados`}
          </p>
          {!loading && search.trim() && (
            <p className="text-xs text-muted-foreground">
              Coincidencias: {filteredRows.length}
              {filteredRows.length !== rows.length ? ` de ${rows.length}` : ""}
            </p>
          )}
        </div>
        {canManage && (
          <Button onClick={openNew} className="bg-primary text-primary-foreground hover:bg-primary-glow shrink-0">
            <Plus className="h-4 w-4 mr-2" /> Nuevo tipo
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Label htmlFor="tipos-documento-buscar" className="sr-only">
          Buscar tipos de documento
        </Label>
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="tipos-documento-buscar"
            placeholder="Buscar por nombre, slug, operador, unidad, vigencia…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            aria-label="Buscar tipos de documento"
          />
        </div>
      </div>
      <Card className="tlo-shadow-md overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-secondary/50">
              <TableHead>Nombre</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead>Aplica a</TableHead>
              <TableHead className="text-right">Días aviso</TableHead>
              <TableHead>Vigencia</TableHead>
              <TableHead>Activo</TableHead>
              {canManage && (
                <TableHead className="w-[1%] whitespace-nowrap text-right pr-2">Acciones</TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredRows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={canManage ? 7 : 6}
                  className="text-center text-muted-foreground py-8"
                >
                  {loading
                    ? "Cargando…"
                    : rows.length === 0
                      ? "No hay tipos configurados."
                      : "Sin resultados para la búsqueda actual."}
                </TableCell>
              </TableRow>
            ) : (
              filteredRows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.nombre}</TableCell>
                <TableCell className="font-mono text-xs">{r.slug}</TableCell>
                <TableCell>{r.aplica_a === "unidad" ? "Unidad" : "Operador"}</TableCell>
                <TableCell className="text-right">{r.dias_aviso}</TableCell>
                <TableCell>
                  {r.requiere_vigencia ? (
                    <Badge variant="outline">Sí</Badge>
                  ) : (
                    <Badge variant="secondary">No (archivo)</Badge>
                  )}
                </TableCell>
                <TableCell>{r.activo ? "Sí" : "No"}</TableCell>
                {canManage && (
                  <TableCell className="text-right align-middle">
                    <div className="inline-flex items-center justify-end gap-0.5">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        onClick={() => openEdit(r)}
                        aria-label={`Editar ${r.nombre}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0 text-destructive hover:text-destructive"
                        onClick={() => void remove(r)}
                        aria-label={`Eliminar ${r.nombre}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                )}
              </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {canManage && (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{form.id ? "Editar tipo" : "Nuevo tipo"}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-3">
              <div>
                <Label>Slug (interno, sin espacios)</Label>
                <Input
                  value={form.slug}
                  onChange={(e) => setForm({ ...form, slug: e.target.value })}
                  disabled={!!form.id}
                />
              </div>
              <div>
                <Label>Nombre visible</Label>
                <Input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
              </div>
              <div>
                <Label>Aplica a</Label>
                <Select
                  value={form.aplica_a}
                  onValueChange={(v: "operador" | "unidad") => setForm({ ...form, aplica_a: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="operador">Operador</SelectItem>
                    <SelectItem value="unidad">Unidad</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Días de aviso antes del vencimiento</Label>
                <Input
                  type="number"
                  min={0}
                  max={3650}
                  value={form.dias_aviso}
                  onChange={(e) => setForm({ ...form, dias_aviso: +e.target.value })}
                />
              </div>
              <div className="flex items-center justify-between rounded-md border p-3">
                <Label>Requiere vigencia (fechas)</Label>
                <Switch
                  checked={form.requiere_vigencia}
                  onCheckedChange={(c) => setForm({ ...form, requiere_vigencia: c })}
                />
              </div>
              <div className="flex items-center justify-between rounded-md border p-3">
                <Label>Activo</Label>
                <Switch checked={form.activo} onCheckedChange={(c) => setForm({ ...form, activo: c })} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={() => void save()}>Guardar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
