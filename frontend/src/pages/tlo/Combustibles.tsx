import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTlo } from "@/context/TloContext";
import { useAuth } from "@/context/AuthContext";
import {
  createFuelTicket,
  deleteFuelTicket,
  fetchFuelProration,
  fetchFuelSummary,
  fetchFuelTickets,
  importFuelTickets,
  syncFuelTickets,
  updateFuelTicket,
} from "@/lib/tloApi";
import type { FuelImportResult, FuelProrationReport, FuelSummaryRow, FuelTicket } from "@/types/tlo";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { fmtMXN, fmtNumber, formatTripRoute } from "@/lib/format";
import { Download, Fuel, Pencil, Plus, RefreshCw, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

function monthRange(): { inicio: string; fin: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const last = new Date(y, now.getMonth() + 1, 0).getDate();
  return { inicio: `${y}-${m}-01`, fin: `${y}-${m}-${String(last).padStart(2, "0")}` };
}

function formatIsoDateEs(iso: string): string {
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

const emptyTicket = (): Omit<FuelTicket, "id" | "numero_economico" | "placas"> => ({
  truck_id: "",
  fecha: new Date().toISOString().slice(0, 10),
  hora: "",
  folio: "",
  tag: "",
  odometro: 0,
  litros: 0,
  precio_litro: 0,
  importe_total: 0,
  ubicacion: "Gasolinera",
  origen: "manual",
});

function downloadImportTemplate() {
  const headers = [
    "folio",
    "tag",
    "numero_economico",
    "fecha",
    "hora",
    "ruta",
    "odometro",
    "litros",
    "precio_litro",
    "importe_total",
  ];
  const sample = [
    "2758",
    "00B1E80D",
    "TN04",
    "2025-05-27",
    "08:09:19",
    "TLO",
    "589912",
    "259.101",
    "29.46",
    "7633.12",
  ];
  const csv = [headers.join(","), sample.join(",")].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "plantilla_combustibles.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export default function Combustibles() {
  const { trucks } = useTlo();
  const { hasPermission } = useAuth();
  const canCreate = hasPermission("combustibles.crear");
  const canImport = hasPermission("combustibles.importar");
  const canDelete = hasPermission("combustibles.eliminar");

  const defaultRange = monthRange();
  const [inicio, setInicio] = useState(defaultRange.inicio);
  const [fin, setFin] = useState(defaultRange.fin);
  const [truckFilter, setTruckFilter] = useState<string>("all");

  const [tickets, setTickets] = useState<FuelTicket[]>([]);
  const [loadingTickets, setLoadingTickets] = useState(false);

  const [proration, setProration] = useState<FuelProrationReport | null>(null);
  const [loadingProration, setLoadingProration] = useState(false);

  const [summary, setSummary] = useState<FuelSummaryRow[]>([]);
  const [loadingSummary, setLoadingSummary] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(emptyTicket());
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const [importOpen, setImportOpen] = useState(false);
  const [importResult, setImportResult] = useState<FuelImportResult | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const activeTrucks = useMemo(() => trucks.filter((t) => t.estatus !== "baja"), [trucks]);

  const loadTickets = useCallback(
    async (range?: { inicio: string; fin: string }) => {
      const from = range?.inicio ?? inicio;
      const to = range?.fin ?? fin;
      setLoadingTickets(true);
      try {
        const rows = await fetchFuelTickets({
          truck_id: truckFilter === "all" ? undefined : truckFilter,
          inicio: from,
          fin: to,
        });
        setTickets(rows);
      } catch {
        toast.error("No se pudieron cargar los tickets");
      } finally {
        setLoadingTickets(false);
      }
    },
    [truckFilter, inicio, fin],
  );

  useEffect(() => {
    void loadTickets();
  }, [loadTickets]);

  const loadProration = useCallback(async () => {
    setLoadingProration(true);
    try {
      const report = await fetchFuelProration(inicio, fin);
      setProration(report);
    } catch {
      toast.error("No se pudo calcular el prorrateo");
    } finally {
      setLoadingProration(false);
    }
  }, [inicio, fin]);

  useEffect(() => {
    void loadProration();
  }, [loadProration]);

  const loadSummary = useCallback(async () => {
    setLoadingSummary(true);
    try {
      const data = await fetchFuelSummary(inicio, fin);
      setSummary(data.unidades);
    } catch {
      toast.error("No se pudo cargar el resumen");
    } finally {
      setLoadingSummary(false);
    }
  }, [inicio, fin]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  const openNew = () => {
    setEditId(null);
    setForm({ ...emptyTicket(), truck_id: activeTrucks[0]?.id ?? "" });
    setDialogOpen(true);
  };

  const openEdit = (t: FuelTicket) => {
    setEditId(t.id);
    setForm({
      truck_id: t.truck_id,
      fecha: t.fecha,
      hora: t.hora ?? "",
      folio: t.folio ?? "",
      tag: t.tag ?? "",
      odometro: t.odometro,
      litros: t.litros,
      precio_litro: t.precio_litro,
      importe_total: t.importe_total,
      ubicacion: t.ubicacion,
      origen: t.origen,
    });
    setDialogOpen(true);
  };

  const saveTicket = async () => {
    if (!form.truck_id || form.litros <= 0 || form.precio_litro <= 0) {
      toast.error("Completa camión, litros y precio");
      return;
    }
    try {
      const body = {
        ...form,
        hora: form.hora || null,
        folio: form.folio || null,
        tag: form.tag || null,
        importe_total: form.importe_total || form.litros * form.precio_litro,
      };
      if (editId) await updateFuelTicket(editId, body);
      else await createFuelTicket(body);
      toast.success(editId ? "Ticket actualizado" : "Ticket registrado");
      setDialogOpen(false);
      await loadTickets();
      void loadSummary();
      void loadProration();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar el ticket");
    }
  };

  const runDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteFuelTicket(deleteId);
      toast.success("Ticket eliminado");
      setDeleteId(null);
      await loadTickets();
      void loadSummary();
      void loadProration();
    } catch {
      toast.error("No se pudo eliminar");
    }
  };

  const onSyncProvider = async () => {
    setSyncing(true);
    try {
      const result = await syncFuelTickets({ inicio, fin });
      const imp = result.import;
      toast.success(
        imp
          ? `Sincronizado: ${imp.creados} nuevos, ${imp.duplicados} duplicados${result.unidades_con_tickets != null ? `, ${result.unidades_con_tickets} unidades` : ""}.`
          : "Sincronización completada.",
      );
      if (imp?.errores.length) {
        toast.warning(`${imp.errores.length} fila(s) con error en el archivo del proveedor.`);
      }
      await loadTickets();
      void loadSummary();
      void loadProration();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al sincronizar con el proveedor");
    } finally {
      setSyncing(false);
    }
  };

  const onImportFile = async (file: File) => {
    setImporting(true);
    setImportResult(null);
    try {
      const result = await importFuelTickets(file);
      setImportResult(result);

      const catalogError = result.errores.find(
        (e) => e.fila === 0 && e.mensaje.startsWith("Catálogo de camiones ambiguo"),
      );
      if (catalogError) {
        toast.error(catalogError.mensaje);
      } else if (result.creados > 0 || result.duplicados > 0) {
        toast.success(`Importación: ${result.creados} creados, ${result.duplicados} duplicados`);
      } else if (result.errores.length > 0) {
        toast.warning("Importación sin registros nuevos; revisa los errores.");
      }

      const range =
        result.inicio && result.fin ? { inicio: result.inicio, fin: result.fin } : undefined;
      if (range) {
        setInicio(range.inicio);
        setFin(range.fin);
        toast.info(
          `Filtro ajustado al periodo del reporte (${formatIsoDateEs(range.inicio)} – ${formatIsoDateEs(range.fin)})`,
        );
      }

      await loadTickets(range);
      if (range) {
        void fetchFuelSummary(range.inicio, range.fin).then((data) => setSummary(data.unidades));
        void fetchFuelProration(range.inicio, range.fin).then(setProration);
      } else {
        void loadSummary();
        void loadProration();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al importar archivo");
    } finally {
      setImporting(false);
    }
  };

  const dateFilters = (
    <div className="flex flex-wrap gap-3 items-end">
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Desde</Label>
        <Input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Hasta</Label>
        <Input type="date" value={fin} onChange={(e) => setFin(e.target.value)} />
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Fuel className="h-5 w-5" /> Combustibles y prorrateo
          </h2>
          <p className="text-sm text-muted-foreground">
            Tickets de carga por unidad y reparto de litros entre viajes por kilómetros.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canImport && (
            <>
              <Button variant="outline" size="sm" onClick={() => void onSyncProvider()} disabled={syncing}>
                <RefreshCw className={`h-4 w-4 mr-1 ${syncing ? "animate-spin" : ""}`} />
                {syncing ? "Sincronizando…" : "Descargar del proveedor"}
              </Button>
              <Button variant="outline" size="sm" onClick={downloadImportTemplate}>
                <Download className="h-4 w-4 mr-1" /> Plantilla
              </Button>
              <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
                <Upload className="h-4 w-4 mr-1" /> Importar Excel
              </Button>
            </>
          )}
          {canCreate && (
            <Button size="sm" onClick={openNew}>
              <Plus className="h-4 w-4 mr-1" /> Agregar ticket
            </Button>
          )}
        </div>
      </div>

      <Tabs defaultValue="tickets">
        <TabsList>
          <TabsTrigger value="tickets">Tickets</TabsTrigger>
          <TabsTrigger value="prorrateo">Prorrateo</TabsTrigger>
          <TabsTrigger value="resumen">Resumen mensual</TabsTrigger>
        </TabsList>

        <TabsContent value="tickets" className="space-y-4 mt-4">
          <Card className="p-4 space-y-3">
            <div className="flex flex-wrap gap-3 items-end">
              {dateFilters}
              <div className="space-y-1 min-w-[160px]">
                <Label className="text-xs text-muted-foreground">Unidad</Label>
                <Select value={truckFilter} onValueChange={setTruckFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="Todas" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas las unidades</SelectItem>
                    {activeTrucks.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.numero_economico} — {t.placas}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button variant="secondary" onClick={() => void loadTickets()} disabled={loadingTickets}>
                Actualizar
              </Button>
            </div>
          </Card>

          <Card className="tlo-shadow-md overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-secondary/50">
                  <TableHead>Fecha</TableHead>
                  <TableHead>Folio/Tag</TableHead>
                  <TableHead>Unidad</TableHead>
                  <TableHead className="text-right">Odómetro</TableHead>
                  <TableHead className="text-right">Litros</TableHead>
                  <TableHead className="text-right">Precio/L</TableHead>
                  <TableHead className="text-right">Importe</TableHead>
                  <TableHead>Origen</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingTickets ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                      Cargando…
                    </TableCell>
                  </TableRow>
                ) : tickets.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                      Sin tickets en el período
                    </TableCell>
                  </TableRow>
                ) : (
                  tickets.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell>
                        {t.fecha}
                        {t.hora ? ` ${t.hora.slice(0, 5)}` : ""}
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {t.folio ?? "—"}
                        {t.tag ? (
                          <span className="text-muted-foreground text-xs block">{t.tag}</span>
                        ) : null}
                      </TableCell>
                      <TableCell className="font-mono font-medium">
                        {t.numero_economico ?? "—"}
                        <span className="text-muted-foreground text-xs block">{t.placas}</span>
                      </TableCell>
                      <TableCell className="text-right">{fmtNumber(t.odometro)}</TableCell>
                      <TableCell className="text-right">{fmtNumber(t.litros, 2)}</TableCell>
                      <TableCell className="text-right">{fmtMXN(t.precio_litro)}</TableCell>
                      <TableCell className="text-right">{fmtMXN(t.importe_total)}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{t.origen}</Badge>
                      </TableCell>
                      <TableCell className="text-right space-x-1">
                        {canCreate && (
                          <Button variant="ghost" size="icon" onClick={() => openEdit(t)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                        {canDelete && (
                          <Button variant="ghost" size="icon" onClick={() => setDeleteId(t.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="prorrateo" className="space-y-4 mt-4">
          <Card className="p-4">
            <div className="flex flex-wrap gap-3 items-end">
              {dateFilters}
              <Button variant="secondary" onClick={() => void loadProration()} disabled={loadingProration}>
                Actualizar prorrateo
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              Se prorratean automáticamente todas las unidades con tickets de combustible en el período.
            </p>
          </Card>

          {loadingProration && (
            <p className="text-sm text-muted-foreground text-center py-6">Calculando todas las unidades…</p>
          )}

          {proration && !loadingProration && proration.unidades.length === 0 && (
            <p className="text-muted-foreground text-center py-6">
              No hay tickets de combustible en el período seleccionado.
            </p>
          )}

          {proration &&
            !loadingProration &&
            proration.unidades.map((unit) => (
              <div key={unit.truck_id} className="space-y-3 mb-6">
                <Card className="p-4 flex flex-wrap gap-6 text-sm border-l-4 border-l-primary">
                  <div>
                    <span className="text-muted-foreground">Unidad</span>
                    <p className="font-semibold font-mono text-lg">{unit.numero_economico}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Litros (período)</span>
                    <p className="font-semibold">{fmtNumber(unit.resumen.total_litros, 2)} L</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Km viajes</span>
                    <p className="font-semibold">{fmtNumber(unit.resumen.total_km_viajes)} km</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Viajes</span>
                    <p className="font-semibold">{unit.resumen.total_viajes}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Rendimiento</span>
                    <p className="font-semibold">
                      {unit.resumen.rendimiento != null
                        ? `${fmtNumber(unit.resumen.rendimiento, 2)} km/L`
                        : "—"}
                    </p>
                  </div>
                </Card>

                {unit.tickets.map((block) => (
                  <Card key={block.ticket_id} className="overflow-hidden ml-2">
                    <div className="bg-secondary/40 px-4 py-3 flex flex-wrap justify-between gap-2 text-sm">
                      <div>
                        <span className="font-semibold">
                          Ticket {block.fecha}
                          {block.hora ? ` ${block.hora.slice(0, 5)}` : ""}
                        </span>
                        <span className="text-muted-foreground ml-2">
                          {fmtNumber(block.litros, 2)} L · {fmtMXN(block.importe_total)} · odómetro{" "}
                          {fmtNumber(block.odometro)}
                        </span>
                      </div>
                      <div className="flex gap-3">
                        {block.sin_asignar ? (
                          <Badge variant="destructive">Sin viajes asignados</Badge>
                        ) : (
                          <>
                            <span>{fmtNumber(block.km_total_periodo)} km</span>
                            <span className="font-medium">
                              {block.rendimiento_periodo != null
                                ? `${fmtNumber(block.rendimiento_periodo, 2)} km/L`
                                : "—"}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    {block.viajes.length > 0 && (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Folio</TableHead>
                            <TableHead>Ruta</TableHead>
                            <TableHead>Fecha</TableHead>
                            <TableHead className="text-right">Km</TableHead>
                            <TableHead className="text-right">L asignados</TableHead>
                            <TableHead className="text-right">Costo</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {block.viajes.map((v) => (
                            <TableRow key={v.trip_id}>
                              <TableCell className="font-mono">{v.folio}</TableCell>
                              <TableCell>
                                {formatTripRoute(v)}
                              </TableCell>
                              <TableCell>{v.fecha_salida}</TableCell>
                              <TableCell className="text-right">{fmtNumber(v.km_recorridos)}</TableCell>
                              <TableCell className="text-right">{fmtNumber(v.litros_asignados, 2)}</TableCell>
                              <TableCell className="text-right">{fmtMXN(v.costo_asignado)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </Card>
                ))}
              </div>
            ))}

        </TabsContent>

        <TabsContent value="resumen" className="space-y-4 mt-4">
          <Card className="p-4 flex flex-wrap gap-3 items-end">
            {dateFilters}
            <Button variant="secondary" onClick={() => void loadSummary()} disabled={loadingSummary}>
              Actualizar
            </Button>
          </Card>
          <Card className="tlo-shadow-md overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-secondary/50">
                  <TableHead>No. económico</TableHead>
                  <TableHead>Placas</TableHead>
                  <TableHead className="text-right">Viajes</TableHead>
                  <TableHead className="text-right">Km</TableHead>
                  <TableHead className="text-right">Litros</TableHead>
                  <TableHead className="text-right">Rendimiento</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingSummary ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      Cargando…
                    </TableCell>
                  </TableRow>
                ) : summary.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      Sin datos en el período
                    </TableCell>
                  </TableRow>
                ) : (
                  summary.map((row) => (
                    <TableRow key={row.truck_id}>
                      <TableCell className="font-mono font-semibold">{row.numero_economico}</TableCell>
                      <TableCell>{row.placas}</TableCell>
                      <TableCell className="text-right">{row.viajes}</TableCell>
                      <TableCell className="text-right">{fmtNumber(row.km_recorridos)}</TableCell>
                      <TableCell className="text-right">{fmtNumber(row.litros, 2)}</TableCell>
                      <TableCell className="text-right">
                        {row.rendimiento != null ? `${fmtNumber(row.rendimiento, 2)} km/L` : "—"}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editId ? "Editar ticket" : "Nuevo ticket de combustible"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            <div className="col-span-2 space-y-1">
              <Label>Unidad</Label>
              <Select value={form.truck_id} onValueChange={(v) => setForm({ ...form, truck_id: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {activeTrucks.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.numero_economico} — {t.placas}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Fecha</Label>
              <Input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Hora</Label>
              <Input type="time" value={form.hora ?? ""} onChange={(e) => setForm({ ...form, hora: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Odómetro</Label>
              <Input
                type="number"
                value={form.odometro || ""}
                onChange={(e) => setForm({ ...form, odometro: +e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Folio</Label>
              <Input value={form.folio ?? ""} onChange={(e) => setForm({ ...form, folio: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>TAG</Label>
              <Input value={form.tag ?? ""} onChange={(e) => setForm({ ...form, tag: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Litros</Label>
              <Input
                type="number"
                step="0.01"
                value={form.litros || ""}
                onChange={(e) => setForm({ ...form, litros: +e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Precio / L</Label>
              <Input
                type="number"
                step="0.0001"
                value={form.precio_litro || ""}
                onChange={(e) => setForm({ ...form, precio_litro: +e.target.value })}
              />
            </div>
            <div className="col-span-2 space-y-1">
              <Label>Ubicación</Label>
              <Input value={form.ubicacion} onChange={(e) => setForm({ ...form, ubicacion: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => void saveTicket()}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Importar consumos (Excel / CSV)</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Compatible con reporte Tothem: Folio, Tag, Numero Econ, Fecha, Hora, Ruta (ubicación), Odometro,
              Litros, Precio por litro, Importe. Se omiten Id Tothem, descripción corta y tag despachado.
            </p>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onImportFile(f);
                e.target.value = "";
              }}
            />
            <div
              className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:bg-muted/50"
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files[0];
                if (f) void onImportFile(f);
              }}
            >
              <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm">{importing ? "Importando…" : "Arrastra un archivo o haz clic"}</p>
            </div>
            {importResult && (
              <div className="text-sm space-y-2 rounded-md border p-3 bg-muted/30">
                <p>
                  <strong>{importResult.creados}</strong> creados · <strong>{importResult.duplicados}</strong>{" "}
                  duplicados
                  {importResult.inicio && importResult.fin && (
                    <>
                      {" "}
                      · periodo {formatIsoDateEs(importResult.inicio)} – {formatIsoDateEs(importResult.fin)}
                    </>
                  )}
                </p>
                {importResult.errores.some((e) => e.fila === 0) && (
                  <div className="rounded border border-destructive/50 bg-destructive/10 p-2 text-destructive text-xs">
                    {importResult.errores
                      .filter((e) => e.fila === 0)
                      .map((err, i) => (
                        <p key={i}>{err.mensaje}</p>
                      ))}
                  </div>
                )}
                {importResult.errores.some((e) => e.fila > 0) && (
                  <ul className="max-h-32 overflow-auto text-destructive text-xs list-disc pl-4">
                    {importResult.errores
                      .filter((e) => e.fila > 0)
                      .map((err, i) => (
                        <li key={i}>
                          Fila {err.fila}: {err.mensaje}
                        </li>
                      ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar ticket?</AlertDialogTitle>
            <AlertDialogDescription>Esta acción no se puede deshacer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <Button variant="destructive" onClick={() => void runDelete()}>
              Eliminar
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
