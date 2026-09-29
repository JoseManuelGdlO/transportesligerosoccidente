import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTlo } from "@/context/TloContext";
import { useAuth } from "@/context/AuthContext";
import type { SettlementSummary } from "@/lib/calc";
import { startOfWeek, endOfWeek, startOfMonth, endOfMonth, fmtDate, fmtMXN, isoDay } from "@/lib/format";
import { weekRowCountsInPayroll } from "@/lib/weekSettlement";
import { downloadSettlementPdf, loadPdfLogoDataUrl } from "@/lib/settlementPdf";
import { resolveSettlementDriver, snapshotToPdfSummary, applyTripInclusions, buildTripInclusionsFromTrips, tripInclusionsPayload, enrichSnapshotTripRoutes } from "@/lib/settlementSnapshot";
import { apiFetch, readJson } from "@/lib/api";
import type { Driver, DiscountType, CompensationType, SettlementRecord, SettlementSummaryApi, WeekSettlementSummaryApi, WeekSettlementEstado, WeekSettlementRow } from "@/types/tlo";
import { SettlementSummaryPanel } from "@/components/tlo/SettlementSummaryPanel";
import { DriverAccountPanel } from "@/components/tlo/DriverAccountPanel";
import { KpiCard } from "@/components/tlo/KpiCard";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FileText, Lock, Eye, Trash2, CircleDollarSign, Wallet, TrendingUp, Truck as TruckIcon, Users } from "lucide-react";
import { toast } from "sonner";

type SettlementTab = "resumen" | "actual" | "borradores" | "historico";
type SummarySource = "live" | "snapshot";

const WEEK_ESTADO_LABEL: Record<WeekSettlementEstado, string> = {
  abierta: "Abierta",
  preliquidacion: "Pre-liq.",
  cerrada: "Cerrada",
};

const weekEstadoBadgeVariant = (estado: WeekSettlementEstado): "default" | "secondary" | "outline" => {
  if (estado === "cerrada") return "default";
  if (estado === "preliquidacion") return "secondary";
  return "outline";
};

const clampDate = (day: string, inicio: string, fin: string) => {
  if (day < inicio) return inicio;
  if (day > fin) return fin;
  return day;
};

export default function Liquidaciones() {
  const nav = useNavigate();
  const { drivers, trucks, trips } = useTlo();
  const { tenant, hasApiSession, permissions, user } = useAuth();
  const canClose = permissions.includes("liquidaciones.cerrar");
  const canCancel = user?.role === "admin";
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
  const [activeTab, setActiveTab] = useState<SettlementTab>("actual");
  const [weekSummary, setWeekSummary] = useState<WeekSettlementSummaryApi | null>(null);
  const [weekLoading, setWeekLoading] = useState(false);
  const [weekPickOverrides, setWeekPickOverrides] = useState<Record<string, boolean>>({});
  const [appliedWeekPeriod, setAppliedWeekPeriod] = useState("");
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);
  const [summarySource, setSummarySource] = useState<SummarySource>("live");
  const [viewingHistory, setViewingHistory] = useState<SettlementRecord | null>(null);
  const [pendingDeleteDraftId, setPendingDeleteDraftId] = useState<string | null>(null);
  const [pendingCancelSettlementId, setPendingCancelSettlementId] = useState<string | null>(null);
  const [tripInclusions, setTripInclusions] = useState<Record<string, boolean>>({});
  const [accountOpen, setAccountOpen] = useState(false);

  const defaultFechaEnPeriodo = () => clampDate(isoDay(today), inicio, fin);
  const [advForm, setAdvForm] = useState({ monto: 0, fecha: defaultFechaEnPeriodo(), descripcion: "" });
  const [discForm, setDiscForm] = useState<{
    tipo: DiscountType;
    monto: number;
    fecha: string;
    descripcion: string;
  }>({
    tipo: "nomina",
    monto: 0,
    fecha: defaultFechaEnPeriodo(),
    descripcion: "",
  });
  const [compForm, setCompForm] = useState<{
    tipo: CompensationType;
    monto: number;
    fecha: string;
    descripcion: string;
  }>({
    tipo: "bono",
    monto: 0,
    fecha: defaultFechaEnPeriodo(),
    descripcion: "",
  });

  const resetToLiveMode = useCallback(() => {
    setActiveDraftId(null);
    setSummarySource("live");
  }, []);

  useEffect(() => {
    setAdvForm((a) => ({ ...a, fecha: clampDate(a.fecha, inicio, fin) }));
    setDiscForm((d) => ({ ...d, fecha: clampDate(d.fecha, inicio, fin) }));
    setCompForm((c) => ({ ...c, fecha: clampDate(c.fecha, inicio, fin) }));
  }, [inicio, fin]);

  useEffect(() => {
    if (activeDrivers.length === 0) return;
    if (summarySource === "snapshot" || activeDraftId) return;
    if (!driverId || !activeDrivers.some((d) => d.id === driverId)) {
      setDriverId(activeDrivers[0].id);
    }
  }, [activeDrivers, driverId, summarySource, activeDraftId]);

  const loadSummary = useCallback(async () => {
    if (!hasApiSession || !driverId) return;
    setLoading(true);
    try {
      const q = new URLSearchParams({ driver_id: driverId, inicio, fin });
      const res = await apiFetch(`/settlements/summary?${q}`);
      const data = await readJson<SettlementSummaryApi>(res);
      setSummary(data);
      setTripInclusions(buildTripInclusionsFromTrips(data.trips));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al cargar resumen");
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [driverId, inicio, fin, hasApiSession]);

  const loadWeekSummary = useCallback(async () => {
    if (!hasApiSession) return;
    setWeekLoading(true);
    try {
      const q = new URLSearchParams({ inicio, fin });
      const res = await apiFetch(`/settlements/week-summary?${q}`);
      const data = await readJson<WeekSettlementSummaryApi>(res);
      setWeekSummary(data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al cargar resumen de la semana");
      setWeekSummary(null);
    } finally {
      setWeekLoading(false);
    }
  }, [inicio, fin, hasApiSession]);

  const loadLists = useCallback(async (forDriverId?: string) => {
    if (!hasApiSession) return;
    const filterDriverId = forDriverId ?? driverId;
    try {
      const res = await apiFetch("/settlements");
      const all = await readJson<SettlementRecord[]>(res);
      setHistory(all.filter((s) => s.cerrado));
      setDrafts(all.filter((s) => !s.cerrado && s.driver_id === filterDriverId));
    } catch {
      setHistory([]);
      setDrafts([]);
    }
  }, [hasApiSession, driverId]);

  useEffect(() => {
    if (summarySource === "live") {
      void loadSummary();
    }
  }, [loadSummary, summarySource]);

  useEffect(() => {
    if (activeTab === "resumen") {
      void loadWeekSummary();
    }
  }, [activeTab, loadWeekSummary]);

  useEffect(() => {
    void loadLists();
  }, [loadLists]);

  const weekPeriodKey = weekSummary ? `${weekSummary.periodo.inicio}|${weekSummary.periodo.fin}` : "";
  if (weekPeriodKey !== appliedWeekPeriod) {
    setAppliedWeekPeriod(weekPeriodKey);
    setWeekPickOverrides({});
  }

  const isWeekRowCounted = useCallback(
    (row: WeekSettlementRow) =>
      weekRowCountsInPayroll(row.estado, weekPickOverrides[row.driver_id], Boolean(row.liquidada_otra_semana)),
    [weekPickOverrides],
  );

  const countedWeekRows = useMemo(
    () => (weekSummary?.rows ?? []).filter((row) => isWeekRowCounted(row)),
    [weekSummary, isWeekRowCounted],
  );

  const countedWeekTotals = useMemo(
    () => ({
      facturacion: countedWeekRows.reduce((sum, row) => sum + row.facturacion, 0),
      neto_pagar: countedWeekRows.reduce((sum, row) => sum + row.neto_pagar, 0),
      comisiones: countedWeekRows.reduce((sum, row) => sum + row.comisiones, 0),
      viajes: countedWeekRows.reduce((sum, row) => sum + row.viajes, 0),
      operadores: countedWeekRows.length,
      cerradas: countedWeekRows.filter((row) => row.estado === "cerrada").length,
    }),
    [countedWeekRows],
  );

  const toggleWeekRow = (driverRowId: string, counted: boolean) => {
    setWeekPickOverrides((prev) => ({ ...prev, [driverRowId]: counted }));
  };

  const toggleAllWeekRows = (counted: boolean) => {
    if (!weekSummary) return;
    setWeekPickOverrides(Object.fromEntries(weekSummary.rows.map((row) => [row.driver_id, counted])));
  };

  const driver = useMemo(() => {
    if (summarySource === "snapshot" && summary) {
      return resolveSettlementDriver(summary, drivers) ?? undefined;
    }
    return drivers.find((d) => d.id === driverId) ?? undefined;
  }, [summarySource, summary, drivers, driverId]);

  const selectDrivers = useMemo(() => {
    if (!driverId || activeDrivers.some((d) => d.id === driverId)) {
      return activeDrivers;
    }
    const current = drivers.find((d) => d.id === driverId);
    if (current) return [...activeDrivers, current];
    const fromSummary = summary?.driver;
    if (fromSummary?.id === driverId) {
      return [...activeDrivers, fromSummary as Driver];
    }
    return activeDrivers;
  }, [activeDrivers, drivers, driverId, summary?.driver]);

  const handleDriverChange = (id: string) => {
    resetToLiveMode();
    setDriverId(id);
  };

  const handleInicioChange = (value: string) => {
    resetToLiveMode();
    setInicio(value);
  };

  const handleFinChange = (value: string) => {
    resetToLiveMode();
    setFin(value);
  };

  const handleRecalcular = () => {
    if (activeTab === "resumen") {
      void loadWeekSummary();
      return;
    }
    if (summarySource === "snapshot") {
      resetToLiveMode();
    } else {
      void loadSummary();
    }
  };

  const openWeekRow = (driverRowId: string) => {
    resetToLiveMode();
    setDriverId(driverRowId);
    setActiveTab("actual");
  };

  const openDraft = async (draft: SettlementRecord) => {
    if (!draft.snapshot) {
      toast.error("La pre-liquidación no tiene datos guardados");
      return;
    }
    setLoading(true);
    try {
      const inclusions = buildTripInclusionsFromTrips(draft.snapshot.trips);
      const res = await apiFetch(`/settlements/${draft.id}/draft`, {
        method: "PATCH",
        body: JSON.stringify({ trip_inclusions: tripInclusionsPayload(inclusions) }),
      });
      const row = await readJson<SettlementRecord>(res);
      setActiveDraftId(row.id);
      setSummarySource("snapshot");
      setDriverId(row.driver_id);
      setInicio(row.fecha_inicio);
      setFin(row.fecha_fin);
      if (row.snapshot) {
        setSummary(row.snapshot);
        setTripInclusions(buildTripInclusionsFromTrips(row.snapshot.trips));
      }
      setActiveTab("actual");
      toast.success("Pre-liquidación cargada con datos actualizados");
      await loadLists(row.driver_id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al cargar pre-liquidación");
    } finally {
      setLoading(false);
    }
  };

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
      setSummarySource("live");
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
        tipo: "nomina",
        monto: 0,
        fecha: clampDate(isoDay(today), inicio, fin),
        descripcion: "",
      });
      toast.success("Descuento registrado");
      setSummarySource("live");
      await loadSummary();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al registrar descuento");
    }
  };

  const addCompensation = async () => {
    if (!driverId) return;
    if (compForm.monto <= 0) {
      toast.error("Captura un monto mayor a cero");
      return;
    }
    const fecha = clampDate(compForm.fecha, inicio, fin);
    try {
      const res = await apiFetch(`/drivers/${driverId}/compensations`, {
        method: "POST",
        body: JSON.stringify({
          ...compForm,
          fecha,
          descripcion: compForm.descripcion.trim() || "Compensación",
        }),
      });
      await readJson(res);
      setCompForm({
        tipo: "bono",
        monto: 0,
        fecha: clampDate(isoDay(today), inicio, fin),
        descripcion: "",
      });
      toast.success("Compensación registrada");
      setSummarySource("live");
      await loadSummary();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al registrar compensación");
    }
  };

  const removeAdvance = async (id: string) => {
    try {
      await apiFetch(`/drivers/${driverId}/advances/${id}`, { method: "DELETE" });
      setSummarySource("live");
      await loadSummary();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo eliminar");
    }
  };

  const removeDiscount = async (id: string) => {
    try {
      await apiFetch(`/drivers/${driverId}/discounts/${id}`, { method: "DELETE" });
      setSummarySource("live");
      await loadSummary();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo eliminar");
    }
  };

  const removeCompensation = async (id: string) => {
    try {
      await apiFetch(`/drivers/${driverId}/compensations/${id}`, { method: "DELETE" });
      setSummarySource("live");
      await loadSummary();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo eliminar");
    }
  };

  const saveDraft = async () => {
    if (!driverId) return;
    const payload = tripInclusionsPayload(tripInclusions);
    try {
      let row: SettlementRecord;
      if (activeDraftId) {
        const res = await apiFetch(`/settlements/${activeDraftId}/draft`, {
          method: "PATCH",
          body: JSON.stringify({ trip_inclusions: payload }),
        });
        row = await readJson<SettlementRecord>(res);
      } else {
        const res = await apiFetch("/settlements/draft", {
          method: "POST",
          body: JSON.stringify({
            driver_id: driverId,
            fecha_inicio: inicio,
            fecha_fin: fin,
            trip_inclusions: payload,
          }),
        });
        row = await readJson<SettlementRecord>(res);
        setActiveDraftId(row.id);
      }
      if (row.snapshot) {
        setSummary(row.snapshot);
        setTripInclusions(buildTripInclusionsFromTrips(row.snapshot.trips));
        setSummarySource("snapshot");
      }
      toast.success("Pre-liquidación guardada");
      await loadLists();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al guardar borrador");
    }
  };

  const deleteDraft = async (settlementId: string) => {
    try {
      await apiFetch(`/settlements/${settlementId}`, { method: "DELETE" });
      if (activeDraftId === settlementId) {
        resetToLiveMode();
        setSummary(null);
        await loadSummary();
      }
      toast.success("Pre-liquidación eliminada");
      await loadLists();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo eliminar");
    } finally {
      setPendingDeleteDraftId(null);
    }
  };

  const cancelClosedSettlement = async (settlementId: string) => {
    try {
      const res = await apiFetch(`/settlements/${settlementId}/cancel`, { method: "POST" });
      const row = await readJson<SettlementRecord>(res);
      setViewingHistory(null);
      toast.success("Liquidación cancelada; vuelve a Pre-liquidaciones");
      setDriverId(row.driver_id);
      setActiveTab("borradores");
      // Pasar driver_id explícito: setState es async y loadLists cerraría sobre el id anterior.
      await loadLists(row.driver_id);
      if (row.snapshot) {
        await openDraft(row);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo cancelar");
    } finally {
      setPendingCancelSettlementId(null);
    }
  };

  const closeSettlement = async (settlementId?: string) => {
    if (!driverId) return;
    setClosing(true);
    try {
      const idToClose = settlementId ?? activeDraftId ?? undefined;
      const inclusionsBody = { trip_inclusions: tripInclusionsPayload(tripInclusions) };
      if (idToClose) {
        await apiFetch(`/settlements/${idToClose}/close`, {
          method: "POST",
          body: JSON.stringify(inclusionsBody),
        });
      } else {
        await apiFetch("/settlements/close", {
          method: "POST",
          body: JSON.stringify({
            driver_id: driverId,
            fecha_inicio: inicio,
            fecha_fin: fin,
            ...inclusionsBody,
          }),
        });
      }
      toast.success("Liquidación cerrada");
      resetToLiveMode();
      await loadSummary();
      await loadLists();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo cerrar");
    } finally {
      setClosing(false);
    }
  };

  const downloadSettlementPdfSafe = async (params: {
    driver: Driver;
    inicio: string;
    fin: string;
    summary: SettlementSummary;
  }) => {
    try {
      const logoDataUrl = tenant?.has_pdf_logo ? await loadPdfLogoDataUrl("settlement") : null;
      await downloadSettlementPdf({
        tenantNombre: tenant?.nombre ?? "TLO",
        driver: params.driver,
        inicio: params.inicio,
        fin: params.fin,
        summary: params.summary,
        trucks,
        template: tenant?.pdf_config?.settlement,
        logoDataUrl,
      });
      toast.success("PDF descargado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al generar PDF");
    }
  };

  const downloadPdfForRecord = async (record: SettlementRecord) => {
    if (!record.snapshot) {
      toast.error("No hay datos para generar el PDF");
      return;
    }
    const enriched = enrichSnapshotTripRoutes(record.snapshot, trips);
    const recordDriver = resolveSettlementDriver(enriched, drivers);
    if (!recordDriver) {
      toast.error("Operador no encontrado");
      return;
    }
    await downloadSettlementPdfSafe({
      driver: recordDriver,
      inicio: record.fecha_inicio,
      fin: record.fecha_fin,
      summary: snapshotToPdfSummary(enriched),
    });
  };

  const downloadCurrentSettlementPdf = async () => {
    if (!driver || !summaryForPdf) return;
    await downloadSettlementPdfSafe({
      driver,
      inicio,
      fin,
      summary: summaryForPdf,
    });
  };

  const effectiveSummary = useMemo(() => {
    if (!summary || !driver) return null;
    if (summarySource === "snapshot") return summary;
    return applyTripInclusions(summary, driver, tripInclusions);
  }, [summary, driver, tripInclusions, summarySource]);

  const summaryForPdf = useMemo(() => {
    if (!effectiveSummary) return null;
    return snapshotToPdfSummary(enrichSnapshotTripRoutes(effectiveSummary, trips));
  }, [effectiveSummary, trips]);

  const viewingHistoryDriver = viewingHistory?.snapshot
    ? resolveSettlementDriver(viewingHistory.snapshot, drivers)
    : null;

  const viewingHistorySummary = useMemo(() => {
    if (!viewingHistory?.snapshot) return null;
    return enrichSnapshotTripRoutes(viewingHistory.snapshot, trips);
  }, [viewingHistory, trips]);

  return (
    <div className="space-y-4">
      <Card className="p-4 tlo-shadow-md">
        <div className="flex flex-wrap items-end gap-3">
          {activeTab !== "resumen" && (
            <div className="flex-1 min-w-[240px]">
              <Label className="text-xs">Operador</Label>
              <Select value={driverId} onValueChange={handleDriverChange}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {selectDrivers.map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div><Label className="text-xs">Desde</Label><Input type="date" value={inicio} onChange={(e) => handleInicioChange(e.target.value)} /></div>
          <div><Label className="text-xs">Hasta</Label><Input type="date" value={fin} onChange={(e) => handleFinChange(e.target.value)} /></div>
          <Button
            variant="outline"
            onClick={() => {
              resetToLiveMode();
              setInicio(isoDay(startOfWeek(today)));
              setFin(isoDay(endOfWeek(today)));
            }}
          >
            Semana actual
          </Button>
          {activeTab === "resumen" && (
            <Button
              variant="outline"
              onClick={() => {
                resetToLiveMode();
                setInicio(isoDay(startOfMonth(today)));
                setFin(isoDay(endOfMonth(today)));
              }}
            >
              Mes actual
            </Button>
          )}
          {activeTab !== "resumen" && (
            <Button variant="secondary" onClick={handleRecalcular} disabled={loading}>Recalcular</Button>
          )}
        </div>
      </Card>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as SettlementTab)}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <TabsList>
            <TabsTrigger value="resumen">Resumen semana</TabsTrigger>
            <TabsTrigger value="actual">Liquidación actual</TabsTrigger>
            <TabsTrigger value="borradores">Pre-liquidaciones ({drafts.length})</TabsTrigger>
            <TabsTrigger value="historico">Histórico ({history.length})</TabsTrigger>
          </TabsList>
          {activeTab !== "resumen" && (
            <Button
              variant="outline"
              size="sm"
              disabled={!driverId}
              onClick={() => setAccountOpen(true)}
            >
              <CircleDollarSign className="h-4 w-4 mr-2" />
              Cuenta del operador
            </Button>
          )}
        </div>

        <TabsContent value="resumen" className="mt-4 space-y-4">
          {!hasApiSession ? (
            <p className="text-muted-foreground text-sm">Inicia sesión con API para liquidaciones en servidor.</p>
          ) : weekLoading && !weekSummary ? (
            <p className="text-muted-foreground">Cargando resumen…</p>
          ) : !weekSummary ? (
            <p className="text-muted-foreground">No se pudo cargar el resumen de la semana.</p>
          ) : (
            <>
              <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,160px),1fr))] gap-3">
                <KpiCard
                  label="Facturación semana"
                  labelClassName="text-[10px] leading-tight"
                  value={fmtMXN(countedWeekTotals.facturacion)}
                  icon={Wallet}
                  tone="accent"
                />
                <KpiCard
                  label="Neto a pagar"
                  labelClassName="text-[10px] leading-tight"
                  value={fmtMXN(countedWeekTotals.neto_pagar)}
                  icon={TrendingUp}
                  tone={countedWeekTotals.neto_pagar >= 0 ? "success" : "destructive"}
                />
                <KpiCard
                  label="Operadores"
                  labelClassName="text-[10px] leading-tight"
                  value={`${countedWeekTotals.operadores} / ${weekSummary.rows.length}`}
                  icon={Users}
                  tone="default"
                />
                <KpiCard
                  label="Cerradas"
                  labelClassName="text-[10px] leading-tight"
                  value={`${countedWeekTotals.cerradas} / ${countedWeekTotals.operadores}`}
                  icon={Lock}
                  tone="default"
                />
                <KpiCard
                  label="Viajes"
                  labelClassName="text-[10px] leading-tight"
                  value={String(countedWeekTotals.viajes)}
                  icon={TruckIcon}
                  tone="default"
                />
              </div>

              <Card>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        <Checkbox
                          checked={
                            weekSummary.rows.length > 0 && countedWeekTotals.operadores === weekSummary.rows.length
                              ? true
                              : countedWeekTotals.operadores > 0
                                ? "indeterminate"
                                : false
                          }
                          onCheckedChange={(value) => toggleAllWeekRows(value === true)}
                          aria-label="Seleccionar operadores del conteo"
                          onClick={(event) => event.stopPropagation()}
                        />
                      </TableHead>
                      <TableHead>Operador</TableHead>
                      <TableHead className="text-right">Viajes</TableHead>
                      <TableHead className="text-right">Facturación</TableHead>
                      <TableHead className="text-right">Comisiones</TableHead>
                      <TableHead className="text-right">Neto a pagar</TableHead>
                      <TableHead className="text-right">Estado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {weekSummary.rows.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground py-6">
                          Sin operadores activos
                        </TableCell>
                      </TableRow>
                    )}
                    {weekSummary.rows.map((row) => {
                      const counted = isWeekRowCounted(row);
                      const otraSemana = row.liquidada_otra_semana;
                      return (
                        <TableRow
                          key={row.driver_id}
                          className={`cursor-pointer hover:bg-muted/50 ${
                            otraSemana ? "text-muted-foreground" : counted ? "" : "opacity-50"
                          }`}
                          onClick={() => openWeekRow(row.driver_id)}
                        >
                          <TableCell className="w-10" onClick={(event) => event.stopPropagation()}>
                            <Checkbox
                              checked={counted}
                              onCheckedChange={(value) => toggleWeekRow(row.driver_id, value === true)}
                              aria-label={`Incluir a ${row.driver_nombre} en el conteo`}
                            />
                          </TableCell>
                          <TableCell className="font-medium">
                            {row.driver_nombre}
                            {otraSemana ? (
                              <p className="mt-0.5 text-xs font-normal text-muted-foreground">
                                Viajes ya se liquidaron en otra semana ({fmtDate(otraSemana.inicio)} –{" "}
                                {fmtDate(otraSemana.fin)})
                              </p>
                            ) : null}
                          </TableCell>
                          <TableCell className="text-right font-mono">{row.viajes}</TableCell>
                          <TableCell className="text-right font-mono">{fmtMXN(row.facturacion)}</TableCell>
                          <TableCell className="text-right font-mono">{fmtMXN(row.comisiones)}</TableCell>
                          <TableCell
                            className={`text-right font-mono font-semibold ${
                              otraSemana ? "" : row.neto_pagar >= 0 ? "text-success" : "text-destructive"
                            }`}
                          >
                            {fmtMXN(row.neto_pagar)}
                          </TableCell>
                          <TableCell className="text-right">
                            <Badge variant={weekEstadoBadgeVariant(row.estado)}>
                              {WEEK_ESTADO_LABEL[row.estado]}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                  {weekSummary.rows.length > 0 && (
                    <TableFooter>
                      <TableRow>
                        <TableCell />
                        <TableCell>Totales</TableCell>
                        <TableCell className="text-right font-mono">{countedWeekTotals.viajes}</TableCell>
                        <TableCell className="text-right font-mono">
                          {fmtMXN(countedWeekTotals.facturacion)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {fmtMXN(countedWeekTotals.comisiones)}
                        </TableCell>
                        <TableCell className="text-right font-mono font-semibold">
                          {fmtMXN(countedWeekTotals.neto_pagar)}
                        </TableCell>
                        <TableCell />
                      </TableRow>
                    </TableFooter>
                  )}
                </Table>
              </Card>
              <p className="text-xs text-muted-foreground">
                El total es lo que se pagará al cerrar el día por esta semana. Cerradas y preliquidaciones usan
                el monto guardado; las abiertas, el cálculo en vivo. Si un operador sale en gris, sus viajes ya
                se liquidaron en otra semana: se muestra ese monto y no entra al pago de esta. Desmarca a quien
                no entre en el pago. Clic en un operador para abrir su liquidación del periodo.
              </p>
            </>
          )}
        </TabsContent>

        <TabsContent value="actual" className="mt-4 space-y-4">
          {!hasApiSession ? (
            <p className="text-muted-foreground text-sm">Inicia sesión con API para liquidaciones en servidor.</p>
          ) : !summary || !driver ? (
            <p className="text-muted-foreground">{loading ? "Cargando…" : "Selecciona operador y periodo."}</p>
          ) : (
            <>
              {summarySource === "snapshot" && (
                <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm text-amber-900 dark:text-amber-200">
                  Viendo pre-liquidación guardada. Usa Recalcular para datos actuales.
                </div>
              )}

              <SettlementSummaryPanel
                summary={effectiveSummary ?? summary}
                driver={driver}
                readOnly={summarySource === "snapshot"}
                canEditFinance={canClose}
                canSelectTrips={canClose && summarySource === "live"}
                tripInclusions={tripInclusions}
                onTripInclusionChange={(tripId, included) => {
                  setTripInclusions((prev) => ({ ...prev, [tripId]: included }));
                }}
                onSelectAllTrips={(included) => {
                  if (!summary) return;
                  setTripInclusions(
                    Object.fromEntries(summary.trips.map((t) => [t.id, included])),
                  );
                }}
                advForm={advForm}
                discForm={discForm}
                compForm={compForm}
                onAdvFormChange={setAdvForm}
                onDiscFormChange={setDiscForm}
                onCompFormChange={setCompForm}
                onAddAdvance={addAdvance}
                onAddDiscount={addDiscount}
                onAddCompensation={addCompensation}
                onRemoveAdvance={removeAdvance}
                onRemoveDiscount={removeDiscount}
                onRemoveCompensation={removeCompensation}
                onEditTrip={(tripId) => nav(`/viajes/${tripId}`)}
              />

              <Card className="tlo-shadow-md">
                <CardContent className="p-4 flex flex-wrap gap-2 justify-end">
                  <Button variant="outline" disabled={!summaryForPdf || !driver} onClick={() => void downloadCurrentSettlementPdf()}>
                    <FileText className="h-4 w-4 mr-2" /> PDF
                  </Button>
                  {canClose && (
                    <>
                      <Button variant="secondary" onClick={saveDraft}>Generar pre-liquidación</Button>
                      <Button
                        className="bg-success text-success-foreground"
                        disabled={closing}
                        onClick={() => closeSettlement()}
                      >
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
              <TableHeader>
                <TableRow>
                  <TableHead>Operador</TableHead>
                  <TableHead>Periodo</TableHead>
                  <TableHead className="text-right">Acción</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {drafts.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground py-6">
                      Sin borradores
                    </TableCell>
                  </TableRow>
                )}
                {drafts.map((s) => (
                  <TableRow
                    key={s.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => openDraft(s)}
                  >
                    <TableCell>{s.driver_nombre ?? drivers.find((d) => d.id === s.driver_id)?.nombre ?? "—"}</TableCell>
                    <TableCell>{s.fecha_inicio} — {s.fecha_fin}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                        {canClose && (
                          <>
                            <Button size="sm" variant="outline" onClick={() => openDraft(s)}>Abrir</Button>
                            <Button size="sm" onClick={() => closeSettlement(s.id)}>Cerrar</Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-destructive hover:text-destructive"
                              onClick={() => setPendingDeleteDraftId(s.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                      </div>
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
              <TableHeader>
                <TableRow>
                  <TableHead>Operador</TableHead>
                  <TableHead>Periodo</TableHead>
                  <TableHead className="text-right">Neto</TableHead>
                  <TableHead className="text-right">Acción</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground py-6">
                      Sin liquidaciones cerradas
                    </TableCell>
                  </TableRow>
                )}
                {history.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>{s.driver_nombre ?? drivers.find((d) => d.id === s.driver_id)?.nombre ?? "—"}</TableCell>
                    <TableCell>{s.fecha_inicio} — {s.fecha_fin}</TableCell>
                    <TableCell className="text-right font-mono">
                      {fmtMXN(Number(s.snapshot?.neto_pagar ?? 0))}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button size="sm" variant="outline" onClick={() => setViewingHistory(s)}>
                          <Eye className="h-4 w-4 mr-1" /> Ver
                        </Button>
                        {canCancel && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive hover:text-destructive"
                            onClick={() => setPendingCancelSettlementId(s.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog
        open={accountOpen}
        onOpenChange={(open) => {
          setAccountOpen(open);
          if (!open && summarySource === "live") void loadSummary();
        }}
      >
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Cuenta del operador{driver ? ` — ${driver.nombre}` : ""}
            </DialogTitle>
          </DialogHeader>
          {driverId ? (
            <DriverAccountPanel driverId={driverId} canEdit={canClose} />
          ) : (
            <p className="text-muted-foreground text-sm py-4">Selecciona un operador.</p>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={viewingHistory !== null} onOpenChange={(open) => !open && setViewingHistory(null)}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto sm:max-w-5xl">
          {viewingHistory && viewingHistorySummary && viewingHistoryDriver && (
            <>
              <DialogHeader>
                <DialogTitle>
                  Liquidación — {viewingHistoryDriver.nombre} ({viewingHistory.fecha_inicio} — {viewingHistory.fecha_fin})
                </DialogTitle>
              </DialogHeader>
              <SettlementSummaryPanel
                summary={viewingHistorySummary}
                driver={viewingHistoryDriver}
                readOnly
              />
              <div className="flex justify-end pt-2">
                <Button variant="outline" onClick={() => void downloadPdfForRecord(viewingHistory)}>
                  <FileText className="h-4 w-4 mr-2" /> PDF
                </Button>
              </div>
            </>
          )}
          {viewingHistory && (!viewingHistorySummary || !viewingHistoryDriver) && (
            <p className="text-muted-foreground text-sm py-4">No hay datos guardados para esta liquidación.</p>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={pendingDeleteDraftId !== null} onOpenChange={(open) => !open && setPendingDeleteDraftId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar pre-liquidación?</AlertDialogTitle>
            <AlertDialogDescription>
              Se borrará el borrador guardado. Los viajes y movimientos del periodo no se verán afectados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={() => pendingDeleteDraftId && void deleteDraft(pendingDeleteDraftId)}
            >
              Eliminar
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={pendingCancelSettlementId !== null}
        onOpenChange={(open) => !open && setPendingCancelSettlementId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Cancelar liquidación?</AlertDialogTitle>
            <AlertDialogDescription>
              La liquidación volverá a Pre-liquidaciones para corregirla. Se desvinculan los viajes y
              movimientos del periodo y se revierten los abonos de cuenta aplicados en este cierre.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>No</AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={() =>
                pendingCancelSettlementId && void cancelClosedSettlement(pendingCancelSettlementId)
              }
            >
              Sí, cancelar
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
