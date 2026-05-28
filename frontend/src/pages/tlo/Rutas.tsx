import { useCallback, useEffect, useMemo, useState } from "react";
import { useTlo } from "@/context/TloContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TripParadasEditor, type ParadaDraft } from "@/components/tlo/TripParadasEditor";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { RouteCatalog, TripType } from "@/types/tlo";
import {
  createRouteApi,
  deleteRouteApi,
  fetchRoutes,
  updateRouteApi,
} from "@/lib/tloApi";
import { hasApiConfigured } from "@/lib/api";

const emptyParadas = (): ParadaDraft[] => [{ etiqueta: "" }, { etiqueta: "" }];

export default function Rutas() {
  const { clients } = useTlo();
  const apiMode = hasApiConfigured();
  const [routes, setRoutes] = useState<RouteCatalog[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterScope, setFilterScope] = useState<"global" | "cliente" | "todos">("todos");
  const [filterClientId, setFilterClientId] = useState<string>("");

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<RouteCatalog | null>(null);
  const [nombre, setNombre] = useState("");
  const [clientId, setClientId] = useState<string>("");
  const [tipoViaje, setTipoViaje] = useState<TripType | "">("");
  const [paradas, setParadas] = useState<ParadaDraft[]>(emptyParadas);

  const reload = useCallback(async () => {
    if (!apiMode) return;
    setLoading(true);
    try {
      if (filterScope === "global") {
        setRoutes(await fetchRoutes());
      } else if (filterScope === "cliente" && filterClientId) {
        setRoutes(await fetchRoutes({ client_id: filterClientId }));
      } else if (filterScope === "todos" && filterClientId) {
        setRoutes(await fetchRoutes({ client_id: filterClientId, all: true }));
      } else {
        setRoutes(await fetchRoutes());
      }
    } catch {
      toast.error("No se pudieron cargar las rutas");
    } finally {
      setLoading(false);
    }
  }, [apiMode, filterScope, filterClientId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const rows = useMemo(() => routes.filter((r) => r.estatus === "activo"), [routes]);

  const openNew = () => {
    setEditing(null);
    setNombre("");
    setClientId("");
    setTipoViaje("");
    setParadas(emptyParadas());
    setOpen(true);
  };

  const openEdit = (r: RouteCatalog) => {
    setEditing(r);
    setNombre(r.nombre);
    setClientId(r.client_id ?? "");
    setTipoViaje(r.tipo_viaje ?? "");
    setParadas(
      r.paradas.length >= 2
        ? r.paradas.map((p) => ({ etiqueta: p.etiqueta, client_ubicacion_id: p.client_ubicacion_id }))
        : emptyParadas(),
    );
    setOpen(true);
  };

  const save = async () => {
    const valid = paradas.filter((p) => p.etiqueta.trim());
    if (!nombre.trim() || valid.length < 2) {
      toast.error("Nombre y al menos 2 paradas son requeridos");
      return;
    }
    if (!apiMode) {
      toast.error("Configura la API para usar el catálogo de rutas");
      return;
    }
    try {
      const body = {
        nombre: nombre.trim(),
        client_id: clientId || null,
        tipo_viaje: tipoViaje || null,
        paradas: valid.map((p) => ({
          etiqueta: p.etiqueta.trim(),
          client_ubicacion_id: p.client_ubicacion_id ?? null,
        })),
      };
      if (editing) {
        await updateRouteApi(editing.id, body);
        toast.success("Ruta actualizada");
      } else {
        await createRouteApi(body);
        toast.success("Ruta creada");
      }
      setOpen(false);
      void reload();
    } catch {
      toast.error("No se pudo guardar la ruta");
    }
  };

  const remove = async (id: string) => {
    if (!apiMode) return;
    try {
      await deleteRouteApi(id);
      toast.success("Ruta dada de baja");
      void reload();
    } catch {
      toast.error("No se pudo eliminar la ruta");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label className="text-xs">Ámbito</Label>
            <Select value={filterScope} onValueChange={(v) => setFilterScope(v as typeof filterScope)}>
              <SelectTrigger className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Globales + cliente</SelectItem>
                <SelectItem value="global">Solo globales</SelectItem>
                <SelectItem value="cliente">Solo del cliente</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {(filterScope === "cliente" || filterScope === "todos") && (
            <div>
              <Label className="text-xs">Cliente</Label>
              <Select value={filterClientId} onValueChange={setFilterClientId}>
                <SelectTrigger className="w-[220px]">
                  <SelectValue placeholder="Seleccionar cliente..." />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.razon_social}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <Button onClick={openNew} className="bg-primary text-primary-foreground">
          <Plus className="h-4 w-4 mr-2" /> Nueva ruta
        </Button>
      </div>

      <Card className="tlo-shadow-md overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-secondary/50">
              <TableHead>Nombre</TableHead>
              <TableHead>Recorrido</TableHead>
              <TableHead>Ámbito</TableHead>
              <TableHead>Tipo viaje</TableHead>
              <TableHead className="w-[100px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  Cargando...
                </TableCell>
              </TableRow>
            )}
            {!loading && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  Sin rutas en el catálogo
                </TableCell>
              </TableRow>
            )}
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.nombre}</TableCell>
                <TableCell className="text-sm">{r.ruta_resumen}</TableCell>
                <TableCell className="text-sm">
                  {r.client_id ? r.client_nombre ?? "Cliente" : "Global"}
                </TableCell>
                <TableCell className="text-sm capitalize">{r.tipo_viaje ?? "—"}</TableCell>
                <TableCell>
                  <div className="flex gap-1 justify-end">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(r)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => void remove(r.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar ruta" : "Nueva ruta"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nombre de la ruta</Label>
              <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Gdl / León / Mty" />
            </div>
            <div>
              <Label>Ámbito</Label>
              <Select
                value={clientId || "__global__"}
                onValueChange={(v) => setClientId(v === "__global__" ? "" : v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__global__">Global (todos los clientes)</SelectItem>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.razon_social}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Tipo de viaje sugerido</Label>
              <Select value={tipoViaje || "__none__"} onValueChange={(v) => setTipoViaje(v === "__none__" ? "" : (v as TripType))}>
                <SelectTrigger>
                  <SelectValue placeholder="Opcional" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Sin preferencia</SelectItem>
                  <SelectItem value="local">Local</SelectItem>
                  <SelectItem value="foraneo">Foráneo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <TripParadasEditor paradas={paradas} onChange={setParadas} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => void save()}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
