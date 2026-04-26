import { useMemo, useState, useEffect } from "react";
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
import { fmtMXN, fmtDate } from "@/lib/format";
import { Plus, Search, ArrowRight } from "lucide-react";
import { toast } from "sonner";

export default function Viajes() {
  const { trips, drivers, trucks, clients, createTrip } = useTlo();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();

  const [filterStatus, setFilterStatus] = useState<string>("todos");
  const [filterDriver, setFilterDriver] = useState<string>("todos");
  const [filterTruck, setFilterTruck] = useState<string>("todos");
  const [search, setSearch] = useState("");

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    truck_id: "", driver_id: "", client_id: "",
    origen: "", destino: "",
    fecha_salida: new Date().toISOString().slice(0, 16),
    km_inicial: 0, tarifa: 0, viaticos_entregados: 0,
  });

  useEffect(() => {
    if (params.get("nuevo")) { setOpen(true); params.delete("nuevo"); setParams(params, { replace: true }); }
  }, [params, setParams]);

  const rows = useMemo(() => {
    return trips
      .filter(t => filterStatus === "todos" || t.estatus === filterStatus)
      .filter(t => filterDriver === "todos" || t.driver_id === filterDriver)
      .filter(t => filterTruck === "todos" || t.truck_id === filterTruck)
      .filter(t => {
        if (!search.trim()) return true;
        const s = search.toLowerCase();
        return t.folio.toLowerCase().includes(s)
          || t.origen.toLowerCase().includes(s)
          || t.destino.toLowerCase().includes(s);
      })
      .map(t => ({ trip: t, fin: computeTrip(t, driverById(drivers, t.driver_id)) }));
  }, [trips, drivers, filterStatus, filterDriver, filterTruck, search]);

  const submit = () => {
    if (!form.truck_id || !form.driver_id || !form.client_id) {
      toast.error("Selecciona camión, operador y cliente"); return;
    }
    const t = createTrip({
      truck_id: form.truck_id, driver_id: form.driver_id, client_id: form.client_id,
      origen: form.origen, destino: form.destino,
      fecha_salida: new Date(form.fecha_salida).toISOString(),
      km_inicial: +form.km_inicial, tarifa: +form.tarifa,
      viaticos_entregados: +form.viaticos_entregados,
    });
    toast.success(`Viaje ${t.folio} abierto`);
    setOpen(false);
    nav(`/viajes/${t.id}`);
  };

  return (
    <div className="space-y-4">
      <Card className="p-4 tlo-shadow-md">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[200px]">
            <Label className="text-xs">Buscar folio o ruta</Label>
            <div className="relative">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={e => setSearch(e.target.value)} className="pl-9" placeholder="V-2026-0142, Monterrey..." />
            </div>
          </div>
          <div>
            <Label className="text-xs">Estado</Label>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
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
              <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {drivers.map(d => <SelectItem key={d.id} value={d.id}>{d.nombre}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Camión</Label>
            <Select value={filterTruck} onValueChange={setFilterTruck}>
              <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {trucks.map(t => <SelectItem key={t.id} value={t.id}>{t.numero_economico}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={() => setOpen(true)} className="bg-primary text-primary-foreground hover:bg-primary-glow">
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
              <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-8">Sin resultados</TableCell></TableRow>
            )}
            {rows.map(({ trip: t, fin }) => {
              const dr = driverById(drivers, t.driver_id);
              const tk = truckById(trucks, t.truck_id);
              return (
                <TableRow key={t.id} className="cursor-pointer hover:bg-muted/30" onClick={() => nav(`/viajes/${t.id}`)}>
                  <TableCell className="font-mono font-semibold">{t.folio}</TableCell>
                  <TableCell className="text-sm">{fmtDate(t.fecha_salida)}</TableCell>
                  <TableCell className="text-sm">{t.origen} → {t.destino}</TableCell>
                  <TableCell className="text-sm">{dr?.nombre}</TableCell>
                  <TableCell className="font-mono text-sm">{tk?.numero_economico}</TableCell>
                  <TableCell className="text-right">{fmtMXN(t.tarifa)}</TableCell>
                  <TableCell className={`text-right font-semibold ${fin.utilidad >= 0 ? "text-success" : "text-destructive"}`}>
                    {t.estatus === "cerrado" ? fmtMXN(fin.utilidad) : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    {t.estatus === "cerrado" ? <MarginBadge pct={fin.margen_pct} /> : <span className="text-muted-foreground text-xs">—</span>}
                  </TableCell>
                  <TableCell><TripStatusBadge status={t.estatus} /></TableCell>
                  <TableCell><ArrowRight className="h-4 w-4 text-muted-foreground" /></TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Abrir nuevo viaje</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Camión</Label>
              <Select value={form.truck_id} onValueChange={v => setForm({ ...form, truck_id: v })}>
                <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                <SelectContent>
                  {trucks.filter(t => t.estatus === "activo").map(t => (
                    <SelectItem key={t.id} value={t.id}>{t.numero_economico} · {t.placas}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Operador</Label>
              <Select value={form.driver_id} onValueChange={v => setForm({ ...form, driver_id: v })}>
                <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                <SelectContent>
                  {drivers.filter(d => d.estatus === "activo").map(d => (
                    <SelectItem key={d.id} value={d.id}>{d.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <Label>Cliente</Label>
              <Select value={form.client_id} onValueChange={v => setForm({ ...form, client_id: v })}>
                <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                <SelectContent>
                  {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.razon_social}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Origen</Label><Input value={form.origen} onChange={e => setForm({ ...form, origen: e.target.value })} placeholder="Guadalajara, JAL" /></div>
            <div><Label>Destino</Label><Input value={form.destino} onChange={e => setForm({ ...form, destino: e.target.value })} placeholder="Monterrey, NL" /></div>
            <div><Label>Fecha y hora salida</Label><Input type="datetime-local" value={form.fecha_salida} onChange={e => setForm({ ...form, fecha_salida: e.target.value })} /></div>
            <div><Label>Kilometraje inicial</Label><Input type="number" value={form.km_inicial} onChange={e => setForm({ ...form, km_inicial: +e.target.value })} /></div>
            <div><Label>Tarifa pactada (MXN)</Label><Input type="number" value={form.tarifa} onChange={e => setForm({ ...form, tarifa: +e.target.value })} /></div>
            <div><Label>Viáticos entregados</Label><Input type="number" value={form.viaticos_entregados} onChange={e => setForm({ ...form, viaticos_entregados: +e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={submit} className="bg-primary text-primary-foreground hover:bg-primary-glow">Abrir viaje</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}