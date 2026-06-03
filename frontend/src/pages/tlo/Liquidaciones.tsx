import { useCallback, useEffect, useMemo, useState } from "react";
import { useTlo } from "@/context/TloContext";
import { useAuth } from "@/context/AuthContext";
import { computeTrip } from "@/lib/calc";
import { startOfWeek, endOfWeek, fmtMXN, fmtDate, isoDay } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { downloadSettlementPdf, loadPdfLogoDataUrl } from "@/lib/settlementPdf";
import { apiFetch, readJson } from "@/lib/api";
import type { DriverAdvance, DriverDiscount, SettlementRecord, SettlementSummaryApi } from "@/types/tlo";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { KpiCard } from "@/components/tlo/KpiCard";
import { Wallet, FileText, Lock, Receipt, TrendingUp, Truck as TruckIcon, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

const clampDate = (day: string, inicio: string, fin: string) => {
  if (day < inicio) return inicio;
  if (day > fin) return fin;
  return day;
};

export default function Liquidaciones() {
  const { drivers, trucks } = useTlo();
  const { tenant, hasApiSession, permissions } = useAuth();
  const canClose = permissions.includes("liquidaciones.cerrar");
  const activeDrivers = drivers.filter((d) => d.estatus === "activo");

  const [driverId, setDriverId] = useState(activeDrivers[0]?.id || "");
  const today = new Date();
  const [inicio, setInicio] = useState(isoDay(startOfWeek(today)));
  const [fin, setFin] = useState(isoDay(endOfWeek(today)));
  const [summary, setSummary] = useState<SettlementSummaryApi | null>(null);
  const [history, setHistory] = useState<SettlementRecord[]>([]);
  const [drafts, setDrafts] = useState<SettlementRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [closing, setClosing] = useState(false);

  const defaultFechaEnPeriodo = () => clampDate(isoDay(today), inicio, fin);
  const [advForm, setAdvForm] = useState({ monto: 0, fecha: defaultFechaEnPeriodo(), descripcion: "" });
  const [discForm, setDiscForm] = useState({
    tipo: "otro" as const,
    monto: 0,
    fecha: defaultFechaEnPeriodo(),
    descripcion: "",
  });

  useEffect(() => {
    setAdvForm((a) => ({ ...a, fecha: clampDate(a.fecha, inicio, fin) }));
    setDiscForm((d) => ({ ...d, fecha: clampDate(d.fecha, inicio, fin) }));
  }, [inicio, fin]);

  useEffect(() => {
    if (activeDrivers.length === 0) return;
    if (!driverId || !activeDrivers.some((d) => d.id === driverId)) {
      setDriverId(activeDrivers[0].id);
    }
  }, [activeDrivers, driverId]);

  const loadSummary = useCallback(async () => {
    if (!hasApiSession || !driverId) return;
    setLoading(true);
    try {
      const q = new URLSearchParams({ driver_id: driverId, inicio, fin });
      const res = await apiFetch(`/settlements/summary?${q}`);
      const data = await readJson<SettlementSummaryApi>(res);
      setSummary(data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al cargar resumen");
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [driverId, inicio, fin, hasApiSession]);

  const loadLists = useCallback(async () => {
    if (!hasApiSession) return;
    try {
      const [allRes, draftRes] = await Promise.all([
        apiFetch("/settlements"),
        apiFetch("/settlements?driver_id=" + encodeURIComponent(driverId)),
      ]);
      const all = await readJson<SettlementRecord[]>(allRes);
      setHistory(all.filter((s) => s.cerrado));
      setDrafts(all.filter((s) => !s.cerrado && s.driver_id === driverId));
    } catch {
      setHistory([]);
      setDrafts([]);
    }
  }, [hasApiSession, driverId]);

  useEffect(() => {
    void loadSummary();
    void loadLists();
  }, [loadSummary, loadLists]);

  const driver = drivers.find((d) => d.id === driverId);

  const addAdvance = async () => {
    if (!driverId) return;
    if (advForm.monto <= 0) {
      toast.error("Captura un monto mayor a cero");
      return;
    }
    const fecha = clampDate(advForm.fecha, inicio, fin);
    try {
      const res = await apiFetch(`/drivers/${driverId}/advances`, {
        method: "POST",
        body: JSON.stringify({
          monto: advForm.monto,
          fecha,
          descripcion: advForm.descripcion.trim() || "Anticipo",
        }),
      });
      await readJson(res);
      setAdvForm({ monto: 0, fecha: clampDate(isoDay(today), inicio, fin), descripcion: "" });
      toast.success("Anticipo registrado");
      await loadSummary();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al registrar anticipo");
    }
  };

  const addDiscount = async () => {
    if (!driverId) return;
    if (discForm.monto <= 0) {
      toast.error("Captura un monto mayor a cero");
      return;
    }
    const fecha = clampDate(discForm.fecha, inicio, fin);
    try {
      const res = await apiFetch(`/drivers/${driverId}/discounts`, {
        method: "POST",
        body: JSON.stringify({
          ...discForm,
          fecha,
          descripcion: discForm.descripcion.trim() || "Descuento",
        }),
      });
      await readJson(res);
      setDiscForm({
        tipo: "otro",
        monto: 0,
        fecha: clampDate(isoDay(today), inicio, fin),
        descripcion: "",
      });
      toast.success("Descuento registrado");
      await loadSummary();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al registrar descuento");
    }
  };

  const removeAdvance = async (id: string) => {
    try {
      await apiFetch(`/drivers/${driverId}/advances/${id}`, { method: "DELETE" });
      await loadSummary();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo eliminar");
    }
  };

  const removeDiscount = async (id: string) => {
    try {
      await apiFetch(`/drivers/${driverId}/discounts/${id}`, { method: "DELETE" });
      await loadSummary();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo eliminar");
    }
  };

  const saveDraft = async () => {
    if (!driverId) return;
    try {
      await apiFetch("/settlements/draft", {
        method: "POST",
        body: JSON.stringify({ driver_id: driverId, fecha_inicio: inicio, fecha_fin: fin }),
      });
      toast.success("Pre-liquidación guardada");
      await loadLists();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al guardar borrador");
    }
  };

  const closeSettlement = async (settlementId?: string) => {
    if (!driverId) return;
    setClosing(true);
    try {
      if (settlementId) {
        await apiFetch(`/settlements/${settlementId}/close`, { method: "POST" });
      } else {
        await apiFetch("/settlements/close", {
          method: "POST",
          body: JSON.stringify({ driver_id: driverId, fecha_inicio: inicio, fecha_fin: fin }),
        });
      }
      toast.success("Liquidación cerrada");
      await loadSummary();
      await loadLists();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo cerrar");
    } finally {
      setClosing(false);
    }
  };

  const summaryForPdf = useMemo(() => {
    if (!summary || !driver) return null;
    return {
      trips: summary.trips,
      total_ingresos: summary.total_ingresos,
      total_comisiones: summary.total_comisiones,
      total_km: summary.total_km,
      viaticos_entregados: summary.viaticos_entregados,
      viaticos_comprobados: summary.viaticos_comprobados,
      saldo_viaticos: summary.saldo_viaticos,
      total_descuentos: summary.total_descuentos,
      total_anticipos: summary.total_anticipos,
      neto_pagar: summary.neto_pagar,
      advances: summary.advances ?? [],
      discounts: summary.discounts ?? [],
    };
  }, [summary, driver]);

  return (
    <div className="space-y-4">
      <Card className="p-4 tlo-shadow-md">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[240px]">
            <Label className="text-xs">Operador</Label>
            <Select value={driverId} onValueChange={setDriverId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {activeDrivers.map((d) => (
                  <SelectItem key={d.id} value={d.id}>{d.nombre}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div><Label className="text-xs">Desde</Label><Input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} /></div>
          <div><Label className="text-xs">Hasta</Label><Input type="date" value={fin} onChange={(e) => setFin(e.target.value)} /></div>
          <Button variant="outline" onClick={() => { setInicio(isoDay(startOfWeek(today))); setFin(isoDay(endOfWeek(today))); }}>Semana actual</Button>
          <Button variant="secondary" onClick={() => void loadSummary()} disabled={loading}>Recalcular</Button>
        </div>
      </Card>

      <Tabs defaultValue="actual">
        <TabsList>
          <TabsTrigger value="actual">Liquidación actual</TabsTrigger>
          <TabsTrigger value="borradores">Pre-liquidaciones ({drafts.length})</TabsTrigger>
          <TabsTrigger value="historico">Histórico ({history.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="actual" className="mt-4 space-y-4">
          {!hasApiSession ? (
            <p className="text-muted-foreground text-sm">Inicia sesión con API para liquidaciones en servidor.</p>
          ) : !summary || !driver ? (
            <p className="text-muted-foreground">{loading ? "Cargando…" : "Selecciona operador y periodo."}</p>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <KpiCard label="Viajes" value={String(summary.trips.length)} icon={TruckIcon} tone="default" />
                <KpiCard label="Comisiones" value={fmtMXN(summary.total_comisiones)} icon={Wallet} tone="accent" />
                <KpiCard label="Descuentos + anticipos" value={fmtMXN(summary.total_descuentos + summary.total_anticipos)} icon={Receipt} tone="default" />
                <KpiCard label="Neto a pagar" value={fmtMXN(summary.neto_pagar)} icon={TrendingUp} tone={summary.neto_pagar >= 0 ? "success" : "destructive"} />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card className="tlo-shadow-md">
                  <CardHeader><CardTitle className="text-base">Anticipos del periodo</CardTitle></CardHeader>
                  <CardContent className="space-y-3">
                    {canClose && (
                      <div className="grid grid-cols-3 gap-2">
                        <Input type="number" placeholder="Monto" value={advForm.monto || ""} onChange={(e) => setAdvForm({ ...advForm, monto: +e.target.value })} />
                        <Input type="date" value={advForm.fecha} onChange={(e) => setAdvForm({ ...advForm, fecha: e.target.value })} />
                        <Button size="sm" onClick={addAdvance}><Plus className="h-4 w-4" /></Button>
                        <Input className="col-span-3" placeholder="Descripción" value={advForm.descripcion} onChange={(e) => setAdvForm({ ...advForm, descripcion: e.target.value })} />
                      </div>
                    )}
                    <Table>
                      <TableBody>
                        {(summary.advances ?? []).length === 0 && (
                          <TableRow>
                            <TableCell colSpan={4} className="text-center text-muted-foreground py-4 text-sm">
                              Sin anticipos pendientes de liquidar
                            </TableCell>
                          </TableRow>
                        )}
                        {(summary.advances ?? []).map((a: DriverAdvance) => (
                          <TableRow key={a.id}>
                            <TableCell>{fmtDate(a.fecha)}</TableCell>
                            <TableCell className="text-sm">
                              {a.descripcion}
                              {a.en_periodo === false && (
                                <Badge variant="outline" className="ml-2 text-xs">Fuera del periodo</Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-right">{fmtMXN(a.monto)}</TableCell>
                            {canClose && !a.settlement_id && (
                              <TableCell><Button variant="ghost" size="sm" onClick={() => removeAdvance(a.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button></TableCell>
                            )}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>

                <Card className="tlo-shadow-md">
                  <CardHeader><CardTitle className="text-base">Descuentos del periodo</CardTitle></CardHeader>
                  <CardContent className="space-y-3">
                    {canClose && (
                      <div className="grid grid-cols-3 gap-2">
                        <Select value={discForm.tipo} onValueChange={(v) => setDiscForm({ ...discForm, tipo: v as typeof discForm.tipo })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="prestamo">Préstamo</SelectItem>
                            <SelectItem value="dano">Daño</SelectItem>
                            <SelectItem value="multa">Multa</SelectItem>
                            <SelectItem value="otro">Otro</SelectItem>
                          </SelectContent>
                        </Select>
                        <Input type="number" value={discForm.monto || ""} onChange={(e) => setDiscForm({ ...discForm, monto: +e.target.value })} />
                        <Button size="sm" onClick={addDiscount}><Plus className="h-4 w-4" /></Button>
                        <Input className="col-span-3" placeholder="Descripción" value={discForm.descripcion} onChange={(e) => setDiscForm({ ...discForm, descripcion: e.target.value })} />
                      </div>
                    )}
                    <Table>
                      <TableBody>
                        {(summary.discounts ?? []).length === 0 && (
                          <TableRow>
                            <TableCell colSpan={4} className="text-center text-muted-foreground py-4 text-sm">
                              Sin descuentos pendientes de liquidar
                            </TableCell>
                          </TableRow>
                        )}
                        {(summary.discounts ?? []).map((d: DriverDiscount) => (
                          <TableRow key={d.id}>
                            <TableCell>{d.tipo}</TableCell>
                            <TableCell className="text-sm">
                              {d.descripcion}
                              {d.en_periodo === false && (
                                <Badge variant="outline" className="ml-2 text-xs">Fuera del periodo</Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-right">{fmtMXN(d.monto)}</TableCell>
                            {canClose && !d.settlement_id && (
                              <TableCell><Button variant="ghost" size="sm" onClick={() => removeDiscount(d.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button></TableCell>
                            )}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </div>

              <Card className="tlo-shadow-md">
                <CardHeader><CardTitle className="text-base">Viajes del periodo</CardTitle></CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-secondary/50">
                        <TableHead>Folio</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Fecha</TableHead>
                        <TableHead className="text-right">Comisión</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {summary.trips.map((t) => {
                        const f = computeTrip(t, driver);
                        return (
                          <TableRow key={t.id}>
                            <TableCell className="font-mono text-sm">{t.folio}</TableCell>
                            <TableCell>{t.tipo_viaje === "foraneo" ? "Foráneo" : "Local"}</TableCell>
                            <TableCell>{fmtDate(t.fecha_salida)}</TableCell>
                            <TableCell className="text-right font-semibold text-accent">{fmtMXN(f.comision)}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              <Card className="tlo-shadow-md">
                <CardContent className="p-4 flex flex-wrap gap-2 justify-end">
                  <Button variant="outline" disabled={!summaryForPdf} onClick={() => {
                    void (async () => {
                      if (!driver || !summaryForPdf) return;
                      const logoDataUrl = tenant?.has_pdf_logo ? await loadPdfLogoDataUrl("settlement") : null;
                      await downloadSettlementPdf({
                        tenantNombre: tenant?.nombre ?? "TLO",
                        driver,
                        inicio,
                        fin,
                        summary: summaryForPdf,
                        trucks,
                        template: tenant?.pdf_config?.settlement,
                        logoDataUrl,
                      });
                      toast.success("PDF descargado");
                    })();
                  }}>
                    <FileText className="h-4 w-4 mr-2" /> PDF
                  </Button>
                  {canClose && (
                    <>
                      <Button variant="secondary" onClick={saveDraft}>Generar pre-liquidación</Button>
                      <Button className="bg-success text-success-foreground" disabled={closing} onClick={() => closeSettlement()}>
                        <Lock className="h-4 w-4 mr-2" /> {closing ? "Cerrando…" : "Cerrar liquidación"}
                      </Button>
                    </>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        <TabsContent value="borradores" className="mt-4">
          <Card>
            <Table>
              <TableHeader><TableRow><TableHead>Operador</TableHead><TableHead>Periodo</TableHead><TableHead className="text-right">Acción</TableHead></TableRow></TableHeader>
              <TableBody>
                {drafts.length === 0 && <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-6">Sin borradores</TableCell></TableRow>}
                {drafts.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>{drivers.find((d) => d.id === s.driver_id)?.nombre}</TableCell>
                    <TableCell>{s.fecha_inicio} — {s.fecha_fin}</TableCell>
                    <TableCell className="text-right">
                      {canClose && <Button size="sm" onClick={() => closeSettlement(s.id)}>Cerrar</Button>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="historico" className="mt-4">
          <Card>
            <Table>
              <TableHeader><TableRow><TableHead>Operador</TableHead><TableHead>Periodo</TableHead><TableHead className="text-right">Neto</TableHead></TableRow></TableHeader>
              <TableBody>
                {history.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>{drivers.find((d) => d.id === s.driver_id)?.nombre}</TableCell>
                    <TableCell>{s.fecha_inicio} — {s.fecha_fin}</TableCell>
                    <TableCell className="text-right font-mono">{fmtMXN(Number((s.snapshot as { neto_pagar?: number })?.neto_pagar ?? 0))}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
