import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTlo } from "@/context/TloContext";
import { computeTrip, driverById, truckById, driverCommissionRate } from "@/lib/calc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { TripStatusBadge } from "@/components/tlo/StatusBadge";
import { fmtMXN, fmtDate, fmtDateTime, fmtNumber } from "@/lib/format";
import { ArrowLeft, Fuel, Receipt, DollarSign, CheckCircle2, Plus, Trash2, Lock, TrendingUp, TrendingDown, MapPin, Calendar } from "lucide-react";
import type { ExpenseCategory, Trip } from "@/types/tlo";
import { apiFetch, hasApiConfigured, readJson } from "@/lib/api";
import { normalizeTrip } from "@/lib/tloApi";
import { toast } from "sonner";

export default function ViajeDetalle() {
  const { id } = useParams();
  const nav = useNavigate();
  const { trips, drivers, trucks, clients, addFuel, removeFuel, addExpense, removeExpense, closeTrip, updateTrip } = useTlo();
  const tripCtx = trips.find(t => t.id === id);
  const [tripOverride, setTripOverride] = useState<Trip | null>(null);
  const trip = tripOverride ?? tripCtx;
  useEffect(() => {
    setTripOverride(null);
  }, [tripCtx]);

  const reloadTrip = async () => {
    if (!id || !hasApiConfigured()) return;
    const r = await apiFetch(`/trips/${id}`);
    if (r.ok) {
      const j = await readJson<Record<string, unknown>>(r);
      setTripOverride(normalizeTrip(j));
    }
  };

  useEffect(() => {
    void reloadTrip();
  }, [id]);

  const [fuelOpen, setFuelOpen] = useState(false);
  const [expOpen, setExpOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [fuel, setFuel] = useState({
    litros: 0,
    precio_litro: 26,
    ubicacion: "",
    es_foraneo: false,
    estacion_nombre: "",
  });
  const [fuelReceipt, setFuelReceipt] = useState<File | null>(null);
  const [exp, setExp] = useState<{ categoria: ExpenseCategory; descripcion: string; monto: number; comprobado: boolean }>({ categoria: "casetas", descripcion: "", monto: 0, comprobado: true });
  const [closeData, setCloseData] = useState({ km_final: 0, fecha_llegada: new Date().toISOString().slice(0, 16), num_factura: "" });

  if (!trip) {
    return (
      <div className="text-center py-20">
        <p className="text-muted-foreground">Viaje no encontrado</p>
        <Button variant="link" onClick={() => nav("/viajes")}>Volver a viajes</Button>
      </div>
    );
  }

  const driver = driverById(drivers, trip.driver_id);
  const truck = truckById(trucks, trip.truck_id);
  const client = clients.find(c => c.id === trip.client_id);
  const fin = computeTrip(trip, driver);
  const isClosed = trip.estatus === "cerrado";

  const onAddFuel = async () => {
    if (fuel.litros <= 0 || fuel.precio_litro <= 0) { toast.error("Captura litros y precio"); return; }
    if (!fuel.ubicacion.trim()) { toast.error("Captura la estación o ubicación"); return; }
    let comprobante_url: string | undefined;
    if (fuelReceipt && hasApiConfigured()) {
      const fd = new FormData();
      fd.append("file", fuelReceipt);
      const r = await apiFetch(`/trips/${trip.id}/fuel-receipt`, { method: "POST", body: fd });
      if (!r.ok) {
        toast.error("No se pudo subir el comprobante");
        return;
      }
      const j = await readJson<{ comprobante_url: string }>(r);
      comprobante_url = j.comprobante_url;
    }
    addFuel(trip.id, {
      litros: fuel.litros,
      precio_litro: fuel.precio_litro,
      ubicacion: fuel.ubicacion,
      fecha: new Date().toISOString(),
      es_foraneo: fuel.es_foraneo,
      estacion_nombre: fuel.estacion_nombre || fuel.ubicacion,
      es_estacion_empresa: !fuel.es_foraneo,
      comprobante_url,
    });
    setFuel({ litros: 0, precio_litro: 26, ubicacion: "", es_foraneo: false, estacion_nombre: "" });
    setFuelReceipt(null);
    setFuelOpen(false);
    toast.success(fuel.es_foraneo ? "Ticket foráneo registrado" : "Carga de diesel registrada");
    await reloadTrip();
  };
  const onAddExp = async () => {
    if (exp.monto <= 0) { toast.error("Captura el monto"); return; }
    addExpense(trip.id, { ...exp, fecha: new Date().toISOString() });
    setExp({ categoria: "casetas", descripcion: "", monto: 0, comprobado: true });
    setExpOpen(false);
    toast.success("Gasto registrado");
    await reloadTrip();
  };
  const onClose = () => {
    if (closeData.km_final <= trip.km_inicial) { toast.error("El km final debe ser mayor al inicial"); return; }
    if (!closeData.num_factura) { toast.error("Captura número de factura"); return; }
    closeTrip(trip.id, {
      km_final: +closeData.km_final,
      fecha_llegada: new Date(closeData.fecha_llegada).toISOString(),
      num_factura: closeData.num_factura,
    });
    setCloseOpen(false);
    toast.success("Viaje cerrado");
  };

  const catLabel: Record<ExpenseCategory, string> = {
    casetas: "Casetas", refacciones: "Refacciones", hospedaje: "Hospedaje", comidas: "Comidas", otros: "Otros",
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => nav("/viajes")}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Viajes
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold font-mono">{trip.folio}</h2>
              <TripStatusBadge status={trip.estatus} />
              <Badge variant="outline">{trip.tipo_viaje === "foraneo" ? "Foráneo" : "Local"}</Badge>
            </div>
            <p className="text-sm text-muted-foreground flex items-center gap-1">
              <MapPin className="h-3 w-3" /> {trip.origen} → {trip.destino}
            </p>
          </div>
        </div>
        {!isClosed && (
          <Button onClick={() => { setCloseData({ km_final: trip.km_inicial, fecha_llegada: new Date().toISOString().slice(0,16), num_factura: "" }); setCloseOpen(true); }}
            className="bg-success text-success-foreground hover:bg-success/90">
            <Lock className="h-4 w-4 mr-2" /> Cerrar viaje
          </Button>
        )}
      </div>

      {isClosed && (
        <div className="rounded-md border border-primary/30 bg-primary/5 px-4 py-3 text-sm text-foreground">
          Viaje cerrado: puedes seguir registrando <strong>gastos</strong> y <strong>diesel</strong> (incluye tickets foráneos de estaciones externas).
        </div>
      )}

      {/* Tarjeta de rentabilidad siempre visible */}
      <Card className="tlo-shadow-lg border-0 tlo-gradient-primary text-primary-foreground">
        <CardContent className="p-5">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div>
              <p className="text-xs uppercase tracking-wider opacity-70">Ingreso</p>
              <p className="text-xl font-bold mt-1">{fmtMXN(fin.ingreso)}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider opacity-70">Diesel</p>
              <p className="text-xl font-bold mt-1 text-warning">−{fmtMXN(fin.diesel_total)}</p>
              <p className="text-[10px] opacity-60">{fmtNumber(fin.diesel_litros, 1)} L</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider opacity-70">Gastos</p>
              <p className="text-xl font-bold mt-1 text-warning">−{fmtMXN(fin.gastos_total)}</p>
              <p className="text-[10px] opacity-60">{fmtMXN(fin.gastos_comprobados)} comprobados</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider opacity-70">Comisión</p>
              <p className="text-xl font-bold mt-1 text-warning">−{fmtMXN(fin.comision)}</p>
            </div>
            <div className="border-l border-white/20 pl-4">
              <p className="text-xs uppercase tracking-wider opacity-70">Utilidad neta</p>
              <p className={`text-2xl font-bold mt-1 ${fin.utilidad >= 0 ? "text-success" : "text-destructive"}`}>
                {fmtMXN(fin.utilidad)}
              </p>
              <div className="flex items-center gap-1 mt-0.5">
                {fin.margen_pct >= 0 ? <TrendingUp className="h-3 w-3 text-success" /> : <TrendingDown className="h-3 w-3 text-destructive" />}
                <span className="text-xs opacity-80">Margen {fin.margen_pct.toFixed(1)}%</span>
              </div>
            </div>
          </div>
          {isClosed && fin.km_recorridos > 0 && (
            <div className="mt-4 pt-4 border-t border-white/20 grid grid-cols-2 md:grid-cols-4 gap-4">
              <div><p className="text-[11px] uppercase opacity-70">Km recorridos</p><p className="font-bold">{fmtNumber(fin.km_recorridos)} km</p></div>
              <div><p className="text-[11px] uppercase opacity-70">$/km</p><p className="font-bold">{fmtMXN(fin.costo_por_km)}</p></div>
              <div>
                <p className="text-[11px] uppercase opacity-70">Rendimiento real</p>
                <p className="font-bold">{fmtNumber(fin.rendimiento_real, 2)} km/l <span className="text-xs opacity-60">vs {truck?.rendimiento_esperado} esperado</span></p>
              </div>
              <div><p className="text-[11px] uppercase opacity-70">Costo diesel/km</p><p className="font-bold">{fmtMXN(fin.costo_diesel_por_km)}</p></div>
            </div>
          )}
        </CardContent>
      </Card>

      <Tabs defaultValue="resumen">
        <TabsList>
          <TabsTrigger value="resumen">Resumen</TabsTrigger>
          <TabsTrigger value="diesel">Diesel ({trip.fuel.length})</TabsTrigger>
          <TabsTrigger value="gastos">Gastos ({trip.expenses.length})</TabsTrigger>
          <TabsTrigger value="comision">Comisión</TabsTrigger>
        </TabsList>

        <TabsContent value="resumen" className="mt-4">
          <Card className="tlo-shadow-md">
            <CardContent className="p-5 grid md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <div><p className="text-xs uppercase text-muted-foreground">Cliente</p><p className="font-medium">{client?.razon_social}</p></div>
                <div><p className="text-xs uppercase text-muted-foreground">Operador</p><p className="font-medium">{driver?.nombre}</p></div>
                <div><p className="text-xs uppercase text-muted-foreground">Camión</p><p className="font-medium">{truck?.numero_economico} · {truck?.marca} {truck?.modelo} · {truck?.placas}</p></div>
                <div><p className="text-xs uppercase text-muted-foreground">Tipo de viaje</p><p className="font-medium">{trip.tipo_viaje === "foraneo" ? "Foráneo" : "Local"}</p></div>
                <div><p className="text-xs uppercase text-muted-foreground">Viáticos entregados</p><p className="font-medium">{fmtMXN(trip.viaticos_entregados)}</p></div>
              </div>
              <div className="space-y-3">
                <div className="flex items-start gap-2"><Calendar className="h-4 w-4 mt-0.5 text-muted-foreground" /><div><p className="text-xs uppercase text-muted-foreground">Salida</p><p className="font-medium">{fmtDateTime(trip.fecha_salida)}</p></div></div>
                <div className="flex items-start gap-2"><Calendar className="h-4 w-4 mt-0.5 text-muted-foreground" /><div><p className="text-xs uppercase text-muted-foreground">Llegada</p><p className="font-medium">{fmtDateTime(trip.fecha_llegada)}</p></div></div>
                <div><p className="text-xs uppercase text-muted-foreground">Km inicial → final</p><p className="font-medium font-mono">{fmtNumber(trip.km_inicial)} → {trip.km_final ? fmtNumber(trip.km_final) : "—"}</p></div>
                {!isClosed ? (
                  <>
                    <div>
                      <Label>Ubicación de salida</Label>
                      <Input
                        defaultValue={trip.origen}
                        placeholder="Ciudad, estado — ej. Guadalajara, JAL"
                        onBlur={e => {
                          const v = e.target.value.trim();
                          if (v && v !== trip.origen) {
                            updateTrip(trip.id, { origen: v });
                            toast.success('Ubicación de salida actualizada');
                          }
                        }}
                      />
                    </div>
                    <div>
                      <Label>Ubicación destino</Label>
                      <Input
                        defaultValue={trip.destino}
                        placeholder="Ciudad, estado — ej. Monterrey, NL"
                        onBlur={e => {
                          const v = e.target.value.trim();
                          if (v && v !== trip.destino) {
                            updateTrip(trip.id, { destino: v });
                            toast.success('Ubicación destino actualizada');
                          }
                        }}
                      />
                    </div>
                    <div>
                      <Label>Número de factura</Label>
                      <Input
                        defaultValue={trip.num_factura || ''}
                        placeholder='F-8826'
                        onBlur={e => {
                          const v = e.target.value.trim();
                          if (v !== (trip.num_factura || '')) {
                            updateTrip(trip.id, { num_factura: v || undefined });
                            toast.success('Número de factura guardado');
                          }
                        }}
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div><p className='text-xs uppercase text-muted-foreground'>Ubicación de salida</p><p className='font-medium'>{trip.origen}</p></div>
                    <div><p className='text-xs uppercase text-muted-foreground'>Ubicación destino</p><p className='font-medium'>{trip.destino}</p></div>
                    <div>
                      <Label>Número de factura</Label>
                      <Input
                        defaultValue={trip.num_factura || ""}
                        placeholder="F-8826"
                        onBlur={async (e) => {
                          const v = e.target.value.trim();
                          if (v !== (trip.num_factura || "")) {
                            updateTrip(trip.id, { num_factura: v || undefined });
                            toast.success("Número de factura guardado");
                            await reloadTrip();
                          }
                        }}
                      />
                    </div>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="diesel" className="mt-4">
          <Card className="tlo-shadow-md">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2"><Fuel className="h-4 w-4" /> Cargas de diesel</CardTitle>
              <Button size="sm" onClick={() => setFuelOpen(true)}><Plus className="h-4 w-4 mr-1" /> Agregar</Button>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader><TableRow className="bg-secondary/50"><TableHead>Fecha</TableHead><TableHead>Ubicación</TableHead><TableHead>Tipo</TableHead><TableHead className="text-right">Litros</TableHead><TableHead className="text-right">$/L</TableHead><TableHead className="text-right">Total</TableHead><TableHead></TableHead></TableRow></TableHeader>
                <TableBody>
                  {trip.fuel.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">Sin cargas registradas</TableCell></TableRow>}
                  {trip.fuel.map(f => (
                    <TableRow key={f.id}>
                      <TableCell className="text-sm">{fmtDate(f.fecha)}</TableCell>
                      <TableCell className="text-sm">{f.estacion_nombre || f.ubicacion}</TableCell>
                      <TableCell>{f.es_foraneo ? <Badge variant="outline" className="text-warning-foreground border-warning/40">Foráneo</Badge> : <Badge variant="outline">Empresa</Badge>}</TableCell>
                      <TableCell className="text-right font-mono">{fmtNumber(f.litros, 1)}</TableCell>
                      <TableCell className="text-right font-mono">{fmtMXN(f.precio_litro)}</TableCell>
                      <TableCell className="text-right font-semibold">{fmtMXN(f.litros * f.precio_litro)}</TableCell>
                      <TableCell className="text-right"><Button variant="ghost" size="sm" onClick={async () => { removeFuel(trip.id, f.id); await reloadTrip(); }}><Trash2 className="h-4 w-4 text-destructive" /></Button></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="gastos" className="mt-4">
          <Card className="tlo-shadow-md">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2"><Receipt className="h-4 w-4" /> Gastos del viaje</CardTitle>
              <Button size="sm" onClick={() => setExpOpen(true)}><Plus className="h-4 w-4 mr-1" /> Agregar</Button>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader><TableRow className="bg-secondary/50"><TableHead>Fecha</TableHead><TableHead>Categoría</TableHead><TableHead>Descripción</TableHead><TableHead>Comprobado</TableHead><TableHead className="text-right">Monto</TableHead><TableHead></TableHead></TableRow></TableHeader>
                <TableBody>
                  {trip.expenses.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">Sin gastos registrados</TableCell></TableRow>}
                  {trip.expenses.map(e => (
                    <TableRow key={e.id}>
                      <TableCell className="text-sm">{fmtDate(e.fecha)}</TableCell>
                      <TableCell><Badge variant="outline">{catLabel[e.categoria]}</Badge></TableCell>
                      <TableCell className="text-sm">{e.descripcion}</TableCell>
                      <TableCell>
                        {e.comprobado
                          ? <Badge className="bg-success/15 text-success border-success/30" variant="outline"><CheckCircle2 className="h-3 w-3 mr-1" />Sí</Badge>
                          : <Badge variant="outline" className="bg-warning/20 text-warning-foreground border-warning/40">No</Badge>}
                      </TableCell>
                      <TableCell className="text-right font-semibold">{fmtMXN(e.monto)}</TableCell>
                      <TableCell className="text-right"><Button variant="ghost" size="sm" onClick={async () => { removeExpense(trip.id, e.id); await reloadTrip(); }}><Trash2 className="h-4 w-4 text-destructive" /></Button></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="comision" className="mt-4">
          <Card className="tlo-shadow-md">
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><DollarSign className="h-4 w-4" /> Comisión del operador</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><p className="text-muted-foreground">Esquema configurado</p><p className="font-semibold">{driver?.comision_tipo === "porcentaje" ? `Local ${driver.comision_valor_local}% · Foráneo ${driver.comision_valor_foraneo}%` : `Local ${fmtMXN(driver?.comision_valor_local || 0)} · Foráneo ${fmtMXN(driver?.comision_valor_foraneo || 0)}`}</p></div>
                <div><p className="text-muted-foreground">Aplica en este viaje</p><p className="font-semibold">{driver && driver.comision_tipo === "porcentaje" ? `${driverCommissionRate(trip, driver)}%` : fmtMXN(driver ? driverCommissionRate(trip, driver) : 0)}</p></div>
                <div><p className="text-muted-foreground">Tarifa del viaje</p><p className="font-semibold">{fmtMXN(trip.tarifa)}</p></div>
              </div>
              <div className="bg-secondary p-4 rounded-md">
                <p className="text-xs uppercase text-muted-foreground">Comisión calculada</p>
                <p className="text-2xl font-bold">{fmtMXN(fin.comision)}</p>
              </div>
              <div>
                <Label>Ajustar manualmente (opcional)</Label>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    placeholder="Monto override"
                    defaultValue={trip.comision_override ?? ""}
                    onBlur={async (e) => {
                      const v = e.target.value === "" ? null : +e.target.value;
                      const prev = trip.comision_override ?? null;
                      if (v === prev) return;
                      updateTrip(trip.id, { comision_override: v });
                      toast.success("Comisión actualizada");
                      await reloadTrip();
                    }}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Modal agregar diesel */}
      <Dialog open={fuelOpen} onOpenChange={setFuelOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Agregar carga de diesel</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <label className="col-span-2 flex items-center gap-2 text-sm cursor-pointer border rounded-md p-3">
              <Checkbox checked={fuel.es_foraneo} onCheckedChange={c => setFuel({ ...fuel, es_foraneo: !!c })} />
              Ticket foráneo / estación externa (fuera de red empresa)
            </label>
            <div><Label>Litros</Label><Input type="number" step="0.1" value={fuel.litros} onChange={e => setFuel({ ...fuel, litros: +e.target.value })} /></div>
            <div><Label>Precio por litro</Label><Input type="number" step="0.1" value={fuel.precio_litro} onChange={e => setFuel({ ...fuel, precio_litro: +e.target.value })} /></div>
            <div className="col-span-2"><Label>Estación / ubicación</Label><Input value={fuel.ubicacion} onChange={e => setFuel({ ...fuel, ubicacion: e.target.value, estacion_nombre: e.target.value })} placeholder={fuel.es_foraneo ? "Gasolinera en ruta" : "Pemex GDL Norte"} /></div>
            <div className="col-span-2"><Label>Comprobante (opcional)</Label><Input type="file" accept="image/*,application/pdf" onChange={e => setFuelReceipt(e.target.files?.[0] ?? null)} /></div>
            <div className="col-span-2 bg-secondary p-3 rounded text-sm">Total: <span className="font-bold">{fmtMXN(fuel.litros * fuel.precio_litro)}</span></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setFuelOpen(false)}>Cancelar</Button><Button onClick={onAddFuel}>Registrar</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal agregar gasto */}
      <Dialog open={expOpen} onOpenChange={setExpOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Agregar gasto</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Categoría</Label>
              <Select value={exp.categoria} onValueChange={(v: ExpenseCategory) => setExp({ ...exp, categoria: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="casetas">Casetas</SelectItem>
                  <SelectItem value="refacciones">Refacciones</SelectItem>
                  <SelectItem value="hospedaje">Hospedaje</SelectItem>
                  <SelectItem value="comidas">Comidas</SelectItem>
                  <SelectItem value="otros">Otros</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Descripción</Label><Input value={exp.descripcion} onChange={e => setExp({ ...exp, descripcion: e.target.value })} /></div>
            <div><Label>Monto (MXN)</Label><Input type="number" value={exp.monto} onChange={e => setExp({ ...exp, monto: +e.target.value })} /></div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox checked={exp.comprobado} onCheckedChange={c => setExp({ ...exp, comprobado: !!c })} />
              Comprobado con ticket / factura
            </label>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setExpOpen(false)}>Cancelar</Button><Button onClick={onAddExp}>Registrar</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal cerrar viaje */}
      <Dialog open={closeOpen} onOpenChange={setCloseOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Cerrar viaje {trip.folio}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Kilometraje final</Label><Input type="number" value={closeData.km_final} onChange={e => setCloseData({ ...closeData, km_final: +e.target.value })} /><p className="text-xs text-muted-foreground mt-1">Inicial: {fmtNumber(trip.km_inicial)} km</p></div>
            <div><Label>Fecha y hora de llegada</Label><Input type="datetime-local" value={closeData.fecha_llegada} onChange={e => setCloseData({ ...closeData, fecha_llegada: e.target.value })} /></div>
            <div><Label>Número de factura</Label><Input value={closeData.num_factura} onChange={e => setCloseData({ ...closeData, num_factura: e.target.value })} placeholder="F-8826" /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setCloseOpen(false)}>Cancelar</Button><Button onClick={onClose} className="bg-success text-success-foreground hover:bg-success/90"><Lock className="h-4 w-4 mr-2" />Cerrar viaje</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}