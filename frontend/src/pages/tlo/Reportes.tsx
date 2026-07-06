import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useTlo } from "@/context/TloContext";
import { fetchFuelSummary, fetchReportsOverview } from "@/lib/tloApi";
import { exportCsv, exportCsvSections } from "@/lib/exportCsv";
import { fmtMXN, fmtNumber, fmtPct, fmtDate } from "@/lib/format";
import type {
  ExpenseCategory,
  FuelSummaryRow,
  ReportsOverview,
} from "@/types/tlo";
import { KpiCard } from "@/components/tlo/KpiCard";
import { MarginBadge } from "@/components/tlo/StatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Download,
  DollarSign,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  BarChart3,
  Activity,
  Route,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import { toast } from "sonner";

type DateRange = { desde: string; hasta: string };
type ReportTab =
  | "resumen"
  | "negativos"
  | "camion"
  | "operador"
  | "cliente"
  | "rutas"
  | "gastos"
  | "combustible";

const EXPENSE_LABELS: Record<ExpenseCategory, string> = {
  casetas: "Casetas",
  refacciones: "Refacciones",
  hospedaje: "Hospedaje",
  comidas: "Comidas",
  otros: "Otros",
};

const PIE_COLORS = [
  "hsl(var(--accent))",
  "hsl(var(--primary))",
  "hsl(142 76% 36%)",
  "hsl(38 92% 50%)",
  "hsl(0 84% 60%)",
];

function monthRange(offsetMonths = 0): DateRange {
  const now = new Date();
  now.setMonth(now.getMonth() + offsetMonths);
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const last = new Date(y, now.getMonth() + 1, 0).getDate();
  return { desde: `${y}-${m}-01`, hasta: `${y}-${m}-${String(last).padStart(2, "0")}` };
}

function last30Days(): DateRange {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - 29);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { desde: fmt(start), hasta: fmt(end) };
}

function thisYear(): DateRange {
  const y = new Date().getFullYear();
  return { desde: `${y}-01-01`, hasta: `${y}-12-31` };
}

function formatIsoDateEs(iso: string): string {
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

function truckLabel(t: { numero_economico: string; marca?: string }): string {
  return t.marca?.trim() ? `${t.numero_economico} · ${t.marca}` : t.numero_economico;
}

function variationHint(pct: number | null | undefined): string | undefined {
  if (pct == null) return "Sin periodo anterior comparable";
  const arrow = pct > 0 ? "↑" : pct < 0 ? "↓" : "→";
  return `${arrow} ${Math.abs(pct).toFixed(1)}% vs periodo anterior`;
}

function variationTone(pct: number | null | undefined, invert = false): "success" | "destructive" | "default" {
  if (pct == null) return "default";
  const positive = invert ? pct < 0 : pct > 0;
  if (pct === 0) return "default";
  return positive ? "success" : "destructive";
}

export default function Reportes() {
  const { hasPermission, apiMode } = useAuth();
  const { trucks } = useTlo();
  const nav = useNavigate();

  const [range, setRange] = useState<DateRange>(monthRange);
  const [overview, setOverview] = useState<ReportsOverview | null>(null);
  const [fuelSummary, setFuelSummary] = useState<FuelSummaryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [fuelLoading, setFuelLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ReportTab>("resumen");

  const truckById = useMemo(() => new Map(trucks.map((t) => [t.id, t])), [trucks]);

  const loadOverview = useCallback(async (r: DateRange) => {
    if (!apiMode) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchReportsOverview(r.desde, r.hasta);
      setOverview(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar reportes");
      setOverview(null);
    } finally {
      setLoading(false);
    }
  }, [apiMode]);

  const loadFuel = useCallback(async (r: DateRange) => {
    if (!apiMode) return;
    setFuelLoading(true);
    try {
      const data = await fetchFuelSummary(r.desde, r.hasta);
      setFuelSummary(data.unidades);
    } catch {
      setFuelSummary([]);
    } finally {
      setFuelLoading(false);
    }
  }, [apiMode]);

  useEffect(() => {
    if (!apiMode || !hasPermission("reportes.ver")) return;
    void loadOverview(range);
  }, [apiMode, hasPermission, range, loadOverview]);

  useEffect(() => {
    if (!apiMode || !hasPermission("reportes.ver") || activeTab !== "combustible") return;
    void loadFuel(range);
  }, [apiMode, hasPermission, range, activeTab, loadFuel]);

  const handleExport = () => {
    if (!overview) {
      toast.error("No hay datos para exportar");
      return;
    }
    const { totales, variacion } = overview;
    const periodLabel = `${formatIsoDateEs(range.desde)} – ${formatIsoDateEs(range.hasta)}`;
    const kpiLines = [
      `Periodo,${periodLabel}`,
      `Viajes,${totales.viajes}`,
      `Ingresos,${totales.ingreso}`,
      `Costos,${totales.costo_total}`,
      `Utilidad,${totales.utilidad}`,
      `Margen %,${totales.margen.toFixed(2)}`,
      `Km,${totales.km}`,
      `Viajes negativos,${totales.viajes_negativos}`,
    ];
    if (variacion) {
      kpiLines.push(
        `Var ingreso %,${variacion.ingreso_pct ?? ""}`,
        `Var utilidad %,${variacion.utilidad_pct ?? ""}`,
        `Var margen %,${variacion.margen_pct ?? ""}`,
      );
    }

    const filename = `reportes_${range.desde}_${range.hasta}`;

    if (activeTab === "negativos") {
      exportCsv(filename, [
        { key: "folio", label: "Folio" },
        { key: "fecha_salida", label: "Fecha salida" },
        { key: "origen", label: "Origen" },
        { key: "destino", label: "Destino" },
        { key: "razon_social", label: "Cliente" },
        { key: "operador", label: "Operador" },
        { key: "numero_economico", label: "Unidad" },
        { key: "ingreso", label: "Ingreso" },
        { key: "costo_total", label: "Costo" },
        { key: "utilidad", label: "Utilidad" },
        { key: "margen", label: "Margen %" },
        { key: "km", label: "Km" },
      ], overview.negative_trips ?? []);
      toast.success("Exportado a CSV");
      return;
    }
    if (activeTab === "camion") {
      exportCsv(filename, [
        { key: "numero_economico", label: "No. económico" },
        { key: "marca", label: "Marca" },
        { key: "viajes", label: "Viajes" },
        { key: "km", label: "Km" },
        { key: "ingreso", label: "Ingreso" },
        { key: "diesel_total", label: "Diesel" },
        { key: "utilidad", label: "Utilidad" },
        { key: "margen", label: "Margen %" },
        { key: "costo_por_km", label: "Costo/km" },
        { key: "ingreso_por_km", label: "Ingreso/km" },
      ], overview.by_truck.filter((r) => r.viajes > 0));
      toast.success("Exportado a CSV");
      return;
    }
    if (activeTab === "operador") {
      exportCsv(filename, [
        { key: "nombre", label: "Operador" },
        { key: "viajes", label: "Viajes" },
        { key: "km", label: "Km" },
        { key: "ingreso", label: "Ingreso" },
        { key: "comision", label: "Comisiones" },
        { key: "utilidad", label: "Utilidad" },
        { key: "margen", label: "Margen %" },
      ], overview.by_driver.filter((r) => r.viajes > 0));
      toast.success("Exportado a CSV");
      return;
    }
    if (activeTab === "cliente") {
      exportCsv(filename, [
        { key: "razon_social", label: "Cliente" },
        { key: "viajes", label: "Viajes" },
        { key: "km", label: "Km" },
        { key: "ingreso", label: "Ingreso" },
        { key: "utilidad", label: "Utilidad" },
        { key: "margen", label: "Margen %" },
      ], overview.by_client.filter((r) => r.viajes > 0));
      toast.success("Exportado a CSV");
      return;
    }
    if (activeTab === "rutas") {
      exportCsv(filename, [
        { key: "origen", label: "Origen" },
        { key: "destino", label: "Destino" },
        { key: "viajes", label: "Viajes" },
        { key: "km", label: "Km" },
        { key: "ingreso", label: "Ingreso" },
        { key: "utilidad", label: "Utilidad" },
        { key: "margen", label: "Margen %" },
      ], overview.by_route);
      toast.success("Exportado a CSV");
      return;
    }
    if (activeTab === "gastos") {
      exportCsv(filename, [
        { key: "categoria", label: "Categoría", format: (v) => EXPENSE_LABELS[v as ExpenseCategory] ?? String(v) },
        { key: "monto", label: "Monto" },
        { key: "pct", label: "% del total" },
      ], overview.by_expense_category.filter((r) => r.monto > 0));
      toast.success("Exportado a CSV");
      return;
    }
    if (activeTab === "combustible") {
      exportCsv(filename, [
        { key: "numero_economico", label: "Unidad" },
        { key: "placas", label: "Placas" },
        { key: "viajes", label: "Viajes" },
        { key: "km_recorridos", label: "Km" },
        { key: "litros", label: "Litros" },
        { key: "rendimiento", label: "Rendimiento km/L" },
      ], fuelSummary.filter((r) => r.viajes > 0 || r.litros > 0));
      toast.success("Exportado a CSV");
      return;
    }

    exportCsvSections(
      [
        { title: "KPIs", lines: kpiLines },
        {
          title: "Por tipo de viaje",
          lines: [
            "Tipo,Viajes,Ingreso,Utilidad,Margen %,Km",
            ...overview.by_tipo_viaje.map(
              (r) => `${r.tipo_viaje},${r.viajes},${r.ingreso},${r.utilidad},${r.margen.toFixed(2)},${r.km}`,
            ),
          ],
        },
        {
          title: "Desglose de costos",
          lines: [
            "Concepto,Monto",
            `Diesel,${overview.cost_breakdown.diesel}`,
            `Comisiones,${overview.cost_breakdown.comisiones}`,
            `Gastos,${overview.cost_breakdown.gastos}`,
          ],
        },
      ],
      filename,
    );
    toast.success("Exportado a CSV");
  };

  if (!hasPermission("reportes.ver")) {
    return (
      <Card className="tlo-shadow-md">
        <CardContent className="p-8 text-center text-muted-foreground">
          No tienes permiso para ver reportes. Contacta al administrador.
        </CardContent>
      </Card>
    );
  }

  if (!apiMode) {
    return (
      <Card className="tlo-shadow-md">
        <CardContent className="p-8 text-center text-muted-foreground">
          Los reportes ejecutivos requieren conexión al servidor. Inicia sesión con la API activa.
        </CardContent>
      </Card>
    );
  }

  const v = overview?.variacion;
  const t = overview?.totales;
  const costPie = overview
    ? [
        { name: "Diesel", value: overview.cost_breakdown.diesel },
        { name: "Comisiones", value: overview.cost_breakdown.comisiones },
        { name: "Gastos", value: overview.cost_breakdown.gastos },
      ].filter((x) => x.value > 0)
    : [];

  const timeChart = overview?.by_time.map((d) => ({
    ...d,
    label: formatIsoDateEs(d.fecha),
  })) ?? [];

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <Card className="tlo-shadow-md">
        <CardContent className="p-4 flex flex-col lg:flex-row lg:items-end gap-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <Label htmlFor="desde" className="text-xs">Desde</Label>
              <Input
                id="desde"
                type="date"
                value={range.desde}
                onChange={(e) => setRange((r) => ({ ...r, desde: e.target.value }))}
                className="w-40"
              />
            </div>
            <div>
              <Label htmlFor="hasta" className="text-xs">Hasta</Label>
              <Input
                id="hasta"
                type="date"
                value={range.hasta}
                onChange={(e) => setRange((r) => ({ ...r, hasta: e.target.value }))}
                className="w-40"
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setRange(monthRange())}>Este mes</Button>
            <Button variant="outline" size="sm" onClick={() => setRange(monthRange(-1))}>Mes anterior</Button>
            <Button variant="outline" size="sm" onClick={() => setRange(last30Days())}>Últimos 30 días</Button>
            <Button variant="outline" size="sm" onClick={() => setRange(thisYear())}>Este año</Button>
          </div>
          <div className="lg:ml-auto">
            <Button variant="outline" onClick={handleExport} disabled={!overview || loading}>
              <Download className="h-4 w-4 mr-2" /> Exportar CSV
            </Button>
          </div>
        </CardContent>
      </Card>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {loading && !overview && <p className="text-sm text-muted-foreground">Cargando reportes…</p>}

      {t && (
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
          <KpiCard label="Ingresos" value={fmtMXN(t.ingreso)} hint={variationHint(v?.ingreso_pct)} icon={DollarSign} tone={variationTone(v?.ingreso_pct)} />
          <KpiCard label="Costos" value={fmtMXN(t.costo_total)} hint={variationHint(v?.costo_pct)} icon={TrendingDown} tone={variationTone(v?.costo_pct, true)} />
          <KpiCard label="Utilidad neta" value={fmtMXN(t.utilidad)} hint={variationHint(v?.utilidad_pct)} icon={TrendingUp} tone={variationTone(v?.utilidad_pct)} />
          <KpiCard label="Margen" value={fmtPct(t.margen)} hint={variationHint(v?.margen_pct)} icon={BarChart3} tone={variationTone(v?.margen_pct)} />
          <KpiCard label="Viajes cerrados" value={String(t.viajes)} hint={variationHint(v?.viajes_pct)} icon={Activity} />
          <KpiCard label="Km totales" value={fmtNumber(t.km)} hint={variationHint(v?.km_pct)} icon={Route} />
          <KpiCard
            label="Viajes negativos"
            value={String(t.viajes_negativos)}
            hint={t.viajes_negativos > 0 ? "Ver detalle en pestaña Viajes negativos" : undefined}
            icon={AlertTriangle}
            tone={t.viajes_negativos > 0 ? "destructive" : "success"}
          />
        </div>
      )}

      {overview && timeChart.length > 0 && (
        <Card className="tlo-shadow-md">
          <CardHeader>
            <CardTitle className="text-base">Tendencia diaria</CardTitle>
            <p className="text-xs text-muted-foreground">
              {fmtDate(range.desde)} – {fmtDate(range.hasta)}
              {overview.periodo_anterior && (
                <> · Comparado con {formatIsoDateEs(overview.periodo_anterior.desde)} – {formatIsoDateEs(overview.periodo_anterior.hasta)}</>
              )}
            </p>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer>
              <LineChart data={timeChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                  formatter={(v: number, name: string) => [fmtMXN(v), name === "ingreso" ? "Ingreso" : "Utilidad"]}
                />
                <Legend />
                <Line type="monotone" dataKey="ingreso" name="Ingreso" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="utilidad" name="Utilidad" stroke="hsl(var(--accent))" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as ReportTab)}>
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="resumen">Resumen</TabsTrigger>
          <TabsTrigger value="negativos" className="relative">
            Viajes negativos
            {(overview?.negative_trips?.length ?? 0) > 0 && (
              <Badge variant="destructive" className="ml-1.5 h-5 min-w-5 px-1 text-[10px]">
                {overview!.negative_trips!.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="camion">Por camión</TabsTrigger>
          <TabsTrigger value="operador">Por operador</TabsTrigger>
          <TabsTrigger value="cliente">Por cliente</TabsTrigger>
          <TabsTrigger value="rutas">Rutas</TabsTrigger>
          <TabsTrigger value="gastos">Gastos</TabsTrigger>
          <TabsTrigger value="combustible">Combustible</TabsTrigger>
        </TabsList>

        {/* Resumen */}
        <TabsContent value="resumen" className="mt-4 space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <Card className="tlo-shadow-md">
              <CardHeader><CardTitle className="text-base">Desglose de costos</CardTitle></CardHeader>
              <CardContent className="h-64">
                {costPie.length > 0 ? (
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie data={costPie} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                        {costPie.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v: number) => fmtMXN(v)} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-16">Sin datos de costos en el periodo</p>
                )}
              </CardContent>
            </Card>
            <Card className="tlo-shadow-md overflow-hidden">
              <CardHeader><CardTitle className="text-base">Local vs foráneo</CardTitle></CardHeader>
              <Table>
                <TableHeader>
                  <TableRow className="bg-secondary/50">
                    <TableHead>Tipo</TableHead>
                    <TableHead className="text-right">Viajes</TableHead>
                    <TableHead className="text-right">Km</TableHead>
                    <TableHead className="text-right">Ingreso</TableHead>
                    <TableHead className="text-right">Utilidad</TableHead>
                    <TableHead className="text-right">Margen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {overview?.by_tipo_viaje.map((row) => (
                    <TableRow key={row.tipo_viaje}>
                      <TableCell className="font-medium capitalize">{row.tipo_viaje === "foraneo" ? "Foráneo" : "Local"}</TableCell>
                      <TableCell className="text-right">{row.viajes}</TableCell>
                      <TableCell className="text-right font-mono">{fmtNumber(row.km)}</TableCell>
                      <TableCell className="text-right">{fmtMXN(row.ingreso)}</TableCell>
                      <TableCell className={`text-right font-semibold ${row.utilidad >= 0 ? "text-success" : "text-destructive"}`}>{fmtMXN(row.utilidad)}</TableCell>
                      <TableCell className="text-right">{row.viajes > 0 ? <MarginBadge pct={row.margen} /> : <span className="text-muted-foreground text-xs">—</span>}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </div>
        </TabsContent>

        {/* Viajes negativos */}
        <TabsContent value="negativos" className="mt-4">
          <Card className="tlo-shadow-md overflow-hidden">
            <CardHeader>
              <CardTitle className="text-base">Viajes con utilidad negativa</CardTitle>
              <p className="text-xs text-muted-foreground">
                Viajes cerrados en el periodo cuyo costo superó el ingreso
              </p>
            </CardHeader>
            <Table>
              <TableHeader>
                <TableRow className="bg-secondary/50">
                  <TableHead>Folio</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Ruta</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Operador</TableHead>
                  <TableHead>Unidad</TableHead>
                  <TableHead className="text-right">Ingreso</TableHead>
                  <TableHead className="text-right">Costo</TableHead>
                  <TableHead className="text-right">Utilidad</TableHead>
                  <TableHead className="text-right">Margen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(overview?.negative_trips ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                      Sin viajes negativos en el periodo
                    </TableCell>
                  </TableRow>
                ) : (
                  overview?.negative_trips.map((row) => (
                    <TableRow
                      key={row.trip_id}
                      className="cursor-pointer hover:bg-muted/30"
                      onClick={() => nav(`/viajes/${row.trip_id}`)}
                    >
                      <TableCell className="font-mono font-semibold">{row.folio}</TableCell>
                      <TableCell className="text-sm">{formatIsoDateEs(row.fecha_salida)}</TableCell>
                      <TableCell className="text-sm">{row.origen} → {row.destino}</TableCell>
                      <TableCell className="text-sm">{row.razon_social ?? "—"}</TableCell>
                      <TableCell className="text-sm">{row.operador}</TableCell>
                      <TableCell className="text-sm font-mono">{row.numero_economico}</TableCell>
                      <TableCell className="text-right">{fmtMXN(row.ingreso)}</TableCell>
                      <TableCell className="text-right">{fmtMXN(row.costo_total)}</TableCell>
                      <TableCell className="text-right font-semibold text-destructive">{fmtMXN(row.utilidad)}</TableCell>
                      <TableCell className="text-right"><MarginBadge pct={row.margen} /></TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        {/* Por camión */}
        <TabsContent value="camion" className="mt-4 space-y-4">
          <Card className="tlo-shadow-md">
            <CardHeader><CardTitle className="text-base">Utilidad por camión</CardTitle></CardHeader>
            <CardContent className="h-64">
              <ResponsiveContainer>
                <BarChart data={(overview?.by_truck ?? []).filter((r) => r.viajes > 0).map((t) => ({ name: truckLabel(t), utilidad: Math.round(t.utilidad) }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} formatter={(v: number) => fmtMXN(v)} />
                  <Bar dataKey="utilidad" fill="hsl(var(--accent))" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <Card className="tlo-shadow-md overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-secondary/50">
                  <TableHead>No. económico</TableHead>
                  <TableHead>Marca</TableHead>
                  <TableHead className="text-right">Viajes</TableHead>
                  <TableHead className="text-right">Km</TableHead>
                  <TableHead className="text-right">Ingreso</TableHead>
                  <TableHead className="text-right">Diesel</TableHead>
                  <TableHead className="text-right">$/km</TableHead>
                  <TableHead className="text-right">Utilidad</TableHead>
                  <TableHead className="text-right">Margen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(overview?.by_truck ?? []).filter((r) => r.viajes > 0).map((t) => (
                  <TableRow key={t.truck_id}>
                    <TableCell className="font-mono font-semibold">{t.numero_economico}</TableCell>
                    <TableCell>{t.marca}{t.modelo ? <span className="text-muted-foreground text-xs ml-1">{t.modelo}</span> : null}</TableCell>
                    <TableCell className="text-right">{t.viajes}</TableCell>
                    <TableCell className="text-right font-mono">{fmtNumber(t.km)}</TableCell>
                    <TableCell className="text-right">{fmtMXN(t.ingreso)}</TableCell>
                    <TableCell className="text-right">{fmtMXN(t.diesel_total)}</TableCell>
                    <TableCell className="text-right font-mono text-xs">{fmtMXN(t.costo_por_km)}</TableCell>
                    <TableCell className={`text-right font-semibold ${t.utilidad >= 0 ? "text-success" : "text-destructive"}`}>{fmtMXN(t.utilidad)}</TableCell>
                    <TableCell className="text-right"><MarginBadge pct={t.margen} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        {/* Por operador */}
        <TabsContent value="operador" className="mt-4 space-y-4">
          <Card className="tlo-shadow-md">
            <CardHeader><CardTitle className="text-base">Utilidad por operador</CardTitle></CardHeader>
            <CardContent className="h-64">
              <ResponsiveContainer>
                <BarChart data={(overview?.by_driver ?? []).filter((r) => r.viajes > 0).slice(0, 12).map((d) => ({ name: d.nombre.split(" ")[0], utilidad: Math.round(d.utilidad) }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} formatter={(v: number) => fmtMXN(v)} />
                  <Bar dataKey="utilidad" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <Card className="tlo-shadow-md overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-secondary/50">
                  <TableHead>Operador</TableHead>
                  <TableHead className="text-right">Viajes</TableHead>
                  <TableHead className="text-right">Km</TableHead>
                  <TableHead className="text-right">Ingresos</TableHead>
                  <TableHead className="text-right">Comisiones</TableHead>
                  <TableHead className="text-right">$/km</TableHead>
                  <TableHead className="text-right">Utilidad</TableHead>
                  <TableHead className="text-right">Margen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(overview?.by_driver ?? []).filter((r) => r.viajes > 0).map((d) => (
                  <TableRow key={d.driver_id}>
                    <TableCell className="font-medium">{d.nombre}</TableCell>
                    <TableCell className="text-right">{d.viajes}</TableCell>
                    <TableCell className="text-right font-mono">{fmtNumber(d.km)}</TableCell>
                    <TableCell className="text-right">{fmtMXN(d.ingreso)}</TableCell>
                    <TableCell className="text-right text-accent font-semibold">{fmtMXN(d.comision)}</TableCell>
                    <TableCell className="text-right font-mono text-xs">{fmtMXN(d.ingreso_por_km)}</TableCell>
                    <TableCell className={`text-right font-semibold ${d.utilidad >= 0 ? "text-success" : "text-destructive"}`}>{fmtMXN(d.utilidad)}</TableCell>
                    <TableCell className="text-right"><MarginBadge pct={d.margen} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        {/* Por cliente */}
        <TabsContent value="cliente" className="mt-4 space-y-4">
          <Card className="tlo-shadow-md">
            <CardHeader><CardTitle className="text-base">Top clientes por ingreso</CardTitle></CardHeader>
            <CardContent className="h-64">
              <ResponsiveContainer>
                <BarChart data={(overview?.by_client ?? []).filter((r) => r.viajes > 0).slice(0, 10).map((c) => ({ name: c.razon_social.slice(0, 18), ingreso: Math.round(c.ingreso) }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} formatter={(v: number) => fmtMXN(v)} />
                  <Bar dataKey="ingreso" fill="hsl(var(--accent))" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <Card className="tlo-shadow-md overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-secondary/50">
                  <TableHead>Cliente</TableHead>
                  <TableHead className="text-right">Viajes</TableHead>
                  <TableHead className="text-right">Km</TableHead>
                  <TableHead className="text-right">Ingresos</TableHead>
                  <TableHead className="text-right">Utilidad</TableHead>
                  <TableHead className="text-right">Margen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(overview?.by_client ?? []).filter((r) => r.viajes > 0).map((c) => (
                  <TableRow key={c.client_id}>
                    <TableCell className="font-medium">{c.razon_social}</TableCell>
                    <TableCell className="text-right">{c.viajes}</TableCell>
                    <TableCell className="text-right font-mono">{fmtNumber(c.km)}</TableCell>
                    <TableCell className="text-right">{fmtMXN(c.ingreso)}</TableCell>
                    <TableCell className={`text-right font-semibold ${c.utilidad >= 0 ? "text-success" : "text-destructive"}`}>{fmtMXN(c.utilidad)}</TableCell>
                    <TableCell className="text-right"><MarginBadge pct={c.margen} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        {/* Rutas */}
        <TabsContent value="rutas" className="mt-4">
          <Card className="tlo-shadow-md overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-secondary/50">
                  <TableHead>Origen</TableHead>
                  <TableHead>Destino</TableHead>
                  <TableHead className="text-right">Viajes</TableHead>
                  <TableHead className="text-right">Km</TableHead>
                  <TableHead className="text-right">Ingreso</TableHead>
                  <TableHead className="text-right">Utilidad</TableHead>
                  <TableHead className="text-right">Margen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(overview?.by_route ?? []).length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Sin viajes cerrados en el periodo</TableCell></TableRow>
                ) : (
                  overview?.by_route.map((r, i) => (
                    <TableRow key={`${r.origen}-${r.destino}-${i}`}>
                      <TableCell>{r.origen}</TableCell>
                      <TableCell>{r.destino}</TableCell>
                      <TableCell className="text-right">{r.viajes}</TableCell>
                      <TableCell className="text-right font-mono">{fmtNumber(r.km)}</TableCell>
                      <TableCell className="text-right">{fmtMXN(r.ingreso)}</TableCell>
                      <TableCell className={`text-right font-semibold ${r.utilidad >= 0 ? "text-success" : "text-destructive"}`}>{fmtMXN(r.utilidad)}</TableCell>
                      <TableCell className="text-right"><MarginBadge pct={r.margen} /></TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        {/* Gastos */}
        <TabsContent value="gastos" className="mt-4 space-y-4">
          <Card className="tlo-shadow-md">
            <CardHeader><CardTitle className="text-base">Gastos por categoría</CardTitle></CardHeader>
            <CardContent className="h-64">
              <ResponsiveContainer>
                <BarChart data={(overview?.by_expense_category ?? []).filter((r) => r.monto > 0).map((r) => ({ name: EXPENSE_LABELS[r.categoria], monto: Math.round(r.monto) }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} formatter={(v: number) => fmtMXN(v)} />
                  <Bar dataKey="monto" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <Card className="tlo-shadow-md overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-secondary/50">
                  <TableHead>Categoría</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                  <TableHead className="text-right">% del total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(overview?.by_expense_category ?? []).filter((r) => r.monto > 0).map((r) => (
                  <TableRow key={r.categoria}>
                    <TableCell className="font-medium">{EXPENSE_LABELS[r.categoria]}</TableCell>
                    <TableCell className="text-right">{fmtMXN(r.monto)}</TableCell>
                    <TableCell className="text-right font-mono">{fmtPct(r.pct)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        {/* Combustible */}
        <TabsContent value="combustible" className="mt-4">
          {fuelLoading ? (
            <p className="text-sm text-muted-foreground">Cargando resumen de combustible…</p>
          ) : (
            <Card className="tlo-shadow-md overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-secondary/50">
                    <TableHead>Unidad</TableHead>
                    <TableHead>Placas</TableHead>
                    <TableHead className="text-right">Viajes</TableHead>
                    <TableHead className="text-right">Km</TableHead>
                    <TableHead className="text-right">Litros</TableHead>
                    <TableHead className="text-right">Rendimiento</TableHead>
                    <TableHead className="text-right">Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fuelSummary.filter((r) => r.viajes > 0 || r.litros > 0).length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Sin datos de combustible en el periodo</TableCell></TableRow>
                  ) : (
                    fuelSummary.filter((r) => r.viajes > 0 || r.litros > 0).map((row) => {
                      const truck = truckById.get(row.truck_id);
                      const esperado = truck?.rendimiento_esperado ?? 0;
                      const rend = row.rendimiento;
                      const bajo = rend != null && esperado > 0 && rend < esperado * 0.9;
                      return (
                        <TableRow key={row.truck_id}>
                          <TableCell className="font-mono font-semibold">{row.numero_economico}</TableCell>
                          <TableCell className="text-muted-foreground">{row.placas}</TableCell>
                          <TableCell className="text-right">{row.viajes}</TableCell>
                          <TableCell className="text-right font-mono">{fmtNumber(row.km_recorridos)}</TableCell>
                          <TableCell className="text-right font-mono">{fmtNumber(row.litros, 1)}</TableCell>
                          <TableCell className="text-right font-mono">
                            {rend != null ? `${fmtNumber(rend, 2)} km/L` : "—"}
                            {esperado > 0 && <span className="text-xs text-muted-foreground ml-1">/ {fmtNumber(esperado, 1)} esp.</span>}
                          </TableCell>
                          <TableCell className="text-right">
                            {bajo ? <Badge variant="destructive">Bajo rendimiento</Badge> : rend != null ? <Badge variant="outline">OK</Badge> : <span className="text-muted-foreground text-xs">—</span>}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
