import { useMemo, useState, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTlo } from "@/context/TloContext";
import { computeTrip, driverById, truckById } from "@/lib/calc";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TripStatusBadge, MarginBadge } from "@/components/tlo/StatusBadge";
import {
  TripParadasEditor,
  paradasToTripStops,
  type ParadaDraft,
} from "@/components/tlo/TripParadasEditor";
import { fmtMXN, fmtDate, formatTripRoute } from "@/lib/format";
import { fetchRoutes } from "@/lib/tloApi";
import { hasApiConfigured } from "@/lib/api";
import type { RouteCatalog } from "@/types/tlo";
import { Plus, Search, ArrowRight } from "lucide-react";
import { toast } from "sonner";

const emptyParadas = (): ParadaDraft[] => [{ etiqueta: "" }, { etiqueta: "" }];

export default function Viajes() {
  const { trips, drivers, trucks, clients, createTrip } = useTlo();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const apiMode = hasApiConfigured();

  const [filterStatus, setFilterStatus] = useState<string>("todos");
  const [filterDriver, setFilterDriver] = useState<string>("todos");
  const [filterTruck, setFilterTruck] = useState<string>("todos");
  const [search, setSearch] = useState("");

  const [open, setOpen] = useState(false);
  const [catalogRoutes, setCatalogRoutes] = useState<RouteCatalog[]>([]);
  const [selectedRouteId, setSelectedRouteId] = useState<string>("__custom__");
  const [paradas, setParadas] = useState<ParadaDraft[]>(emptyParadas);
  const [form, setForm] = useState({
    truck_id: "",
    driver_id: "",
    client_id: "",
    num_factura: "",
    fecha_salida: new Date().toISOString().slice(0, 16),
    km_inicial: 0,
    tarifa: 0,
    viaticos_entregados: 0,
    tipo_viaje: "local" as const,
  });

  const loadRoutes = useCallback(async (clientId: string) => {
    if (!apiMode || !clientId) {
      setCatalogRoutes([]);
      return;
    }
    try {
      const rows = await fetchRoutes({ client_id: clientId, all: true });
      setCatalogRoutes(rows.filter((r) => r.estatus === "activo"));
    } catch {
      setCatalogRoutes([]);
    }
  }, [apiMode]);

  useEffect(() => {
    if (params.get("nuevo")) {
      setOpen(true);
      params.delete("nuevo");
      setParams(params, { replace: true });
    }
  }, [params, setParams]);

  useEffect(() => {
    if (form.client_id) void loadRoutes(form.client_id);
    else setCatalogRoutes([]);
  }, [form.client_id, loadRoutes]);

  const applyRoute = (routeId: string) => {
    setSelectedRouteId(routeId);
    if (routeId === "__custom__") return;
    const r = catalogRoutes.find((x) => x.id === routeId);
    if (!r) return;
    setParadas(
      r.paradas.map((p) => ({
        etiqueta: p.etiqueta,
        client_ubicacion_id: p.client_ubicacion_id,
      })),
    );
    if (r.tipo_viaje) setForm((f) => ({ ...f, tipo_viaje: r.tipo_viaje! }));
  };

  const rows = useMemo(() => {
    return trips
      .filter((t) => filterStatus === "todos" || t.estatus === filterStatus)
      .filter((t) => filterDriver === "todos" || t.driver_id === filterDriver)
      .filter((t) => filterTruck === "todos" || t.truck_id === filterTruck)
      .filter((t) => {
        if (!search.trim()) return true;
        const s = search.toLowerCase();
        const ruta = formatTripRoute(t).toLowerCase();
        return (
          t.folio.toLowerCase().includes(s) ||
          t.origen.toLowerCase().includes(s) ||
          t.destino.toLowerCase().includes(s) ||
          ruta.includes(s)
        );
      })
      .map((t) => ({ trip: t, fin: computeTrip(t, driverById(drivers, t.driver_id)) }));
  }, [trips, drivers, filterStatus, filterDriver, filterTruck, search]);

  const submit = async () => {
    if (!form.truck_id || !form.driver_id || !form.client_id) {
      toast.error("Selecciona camión, operador y cliente");
      return;
    }
    const validParadas = paradas.filter((p) => p.etiqueta.trim());
    if (validParadas.length < 2) {
      toast.error("Indica al menos 2 paradas en la ruta");
      return;
    }
    const stops = paradasToTripStops(validParadas);
    try {
      const t = await createTrip({
        truck_id: form.truck_id,
        driver_id: form.driver_id,
        client_id: form.client_id,
        origen: stops[0].etiqueta,
        destino: stops[stops.length - 1].etiqueta,
        paradas: stops,
        route_id: selectedRouteId !== "__custom__" ? selectedRouteId : undefined,
        num_factura: form.num_factura.trim() || undefined,
        fecha_salida: new Date(form.fecha_salida).toISOString(),
        km_inicial: +form.km_inicial,
        tarifa: +form.tarifa,
        viaticos_entregados: +form.viaticos_entregados,
        tipo_viaje: form.tipo_viaje,
        fuel: [],
        expenses: [],
      });
      toast.success(`Viaje ${t.folio} abierto`);
      setOpen(false);
      nav(`/viajes/${t.id}`);
    } catch {
      toast.error("No se pudo crear el viaje");
    }
  };

  return (
    <div className="space-y-4">
      <Card className="p-4 tlo-shadow-md">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[200px]">
            <Label className="text-xs">Buscar folio o ruta</Label>
            <div className="relative">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
                placeholder="V-2026-0142, Gdl → Mty..."
              />
            </div>
          </div>
          <div>
            <Label className="text-xs">Estado</Label>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="en_curso">En curso</SelectItem>
                <SelectItem value="cerrado">Cerrados</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Operador</Label>
            <Select value={filterDriver} onValueChange={setFilterDriver}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {drivers.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Camión</Label>
            <Select value={filterTruck} onValueChange={setFilterTruck}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {trucks.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.numero_economico}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            onClick={() => {
              setParadas(emptyParadas());
              setSelectedRouteId("__custom__");
              setOpen(true);
            }}
            className="bg-primary text-primary-foreground hover:bg-primary-glow"
          >
            <Plus className="h-4 w-4 mr-2" /> Abrir viaje
          </Button>
        </div>
      </Card>

      <Card className="tlo-shadow-md overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-secondary/50">
              <TableHead>Folio</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead>Ruta</TableHead>
              <TableHead>Factura</TableHead>
              <TableHead>Operador</TableHead>
              <TableHead>Camión</TableHead>
              <TableHead className="text-right">Tarifa</TableHead>
              <TableHead className="text-right">Utilidad</TableHead>
              <TableHead className="text-right">Margen</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={11} className="text-center text-muted-foreground py-8">
                  Sin resultados
                </TableCell>
              </TableRow>
            )}
            {rows.map(({ trip: t, fin }) => {
              const dr = driverById(drivers, t.driver_id);
              const tk = truckById(trucks, t.truck_id);
              return (
                <TableRow
                  key={t.id}
                  className="cursor-pointer hover:bg-muted/30"
                  onClick={() => nav(`/viajes/${t.id}`)}
                >
                  <TableCell className="font-mono font-semibold">{t.folio}</TableCell>
                  <TableCell className="text-sm">{fmtDate(t.fecha_salida)}</TableCell>
                  <TableCell className="text-sm">{formatTripRoute(t)}</TableCell>
                  <TableCell className="font-mono text-sm">{t.num_factura || "—"}</TableCell>
                  <TableCell className="text-sm">{dr?.nombre}</TableCell>
                  <TableCell className="font-mono text-sm">{tk?.numero_economico}</TableCell>
                  <TableCell className="text-right">{fmtMXN(t.tarifa)}</TableCell>
                  <TableCell
                    className={`text-right font-semibold ${fin.utilidad >= 0 ? "text-success" : "text-destructive"}`}
                  >
                    {t.estatus === "cerrado" ? fmtMXN(fin.utilidad) : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    {t.estatus === "cerrado" ? (
                      <MarginBadge pct={fin.margen_pct} />
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <TripStatusBadge status={t.estatus} />
                  </TableCell>
                  <TableCell>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Abrir nuevo viaje</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Camión</Label>
              <Select value={form.truck_id} onValueChange={(v) => setForm({ ...form, truck_id: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar..." />
                </SelectTrigger>
                <SelectContent>
                  {trucks
                    .filter((t) => t.estatus === "activo")
                    .map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.numero_economico} · {t.placas}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Operador</Label>
              <Select value={form.driver_id} onValueChange={(v) => setForm({ ...form, driver_id: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar..." />
                </SelectTrigger>
                <SelectContent>
                  {drivers
                    .filter((d) => d.estatus === "activo")
                    .map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.nombre}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <Label>Cliente</Label>
              <Select
                value={form.client_id}
                onValueChange={(v) => {
                  setForm({ ...form, client_id: v });
                  setSelectedRouteId("__custom__");
                  setParadas(emptyParadas());
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar..." />
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
            {form.client_id && apiMode && (
              <div className="col-span-2">
                <Label>Ruta del catálogo</Label>
                <Select value={selectedRouteId} onValueChange={applyRoute}>
                  <SelectTrigger>
                    <SelectValue placeholder="Personalizada o del catálogo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__custom__">Personalizada (editar paradas)</SelectItem>
                    {catalogRoutes.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.nombre} — {r.ruta_resumen}
                        {r.client_id ? "" : " (global)"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="col-span-2">
              <TripParadasEditor
                paradas={paradas}
                onChange={(p) => {
                  setParadas(p);
                  setSelectedRouteId("__custom__");
                }}
              />
            </div>
            <div className="col-span-2">
              <Label>Número de factura</Label>
              <Input
                value={form.num_factura}
                onChange={(e) => setForm({ ...form, num_factura: e.target.value })}
                placeholder="F-8826 (opcional)"
              />
            </div>
            <div>
              <Label>Fecha y hora salida</Label>
              <Input
                type="datetime-local"
                value={form.fecha_salida}
                onChange={(e) => setForm({ ...form, fecha_salida: e.target.value })}
              />
            </div>
            <div>
              <Label>Kilometraje inicial</Label>
              <Input
                type="number"
                value={form.km_inicial}
                onChange={(e) => setForm({ ...form, km_inicial: +e.target.value })}
              />
            </div>
            <div>
              <Label>Tarifa pactada (MXN)</Label>
              <Input
                type="number"
                value={form.tarifa}
                onChange={(e) => setForm({ ...form, tarifa: +e.target.value })}
              />
            </div>
            <div>
              <Label>Tipo de viaje</Label>
              <Select
                value={form.tipo_viaje}
                onValueChange={(v) => setForm({ ...form, tipo_viaje: v as "local" | "foraneo" })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="local">Local</SelectItem>
                  <SelectItem value="foraneo">Foráneo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Viáticos entregados</Label>
              <Input
                type="number"
                value={form.viaticos_entregados}
                onChange={(e) => setForm({ ...form, viaticos_entregados: +e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={submit} className="bg-primary text-primary-foreground hover:bg-primary-glow">
              Abrir viaje
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
