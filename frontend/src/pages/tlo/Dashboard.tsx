import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTlo } from "@/context/TloContext";
import { useAuth } from "@/context/AuthContext";
import { fetchDocumentDashboard } from "@/lib/tloApi";
import type { DocumentDashboardSummary, Trip } from "@/types/tlo";
import { computeTrip, driverById, truckById } from "@/lib/calc";
import { startOfWeek, endOfWeek, fmtMXN, fmtDate, isoDay, formatTripRoute } from "@/lib/format";
import { KpiCard } from "@/components/tlo/KpiCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TripStatusesBadges, MarginBadge } from "@/components/tlo/StatusBadge";
import { tripIsClosed, tripIsOpen } from "@/lib/tripStatus";
import {
  Truck,
  Users,
  DollarSign,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Plus,
  Wallet,
  Activity,
  CalendarClock,
  FileWarning,
} from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

/** Viajes relevantes a la semana: salieron, cerraron o siguen abiertos en el periodo. */
function tripInWeekScope(t: Trip, wStart: Date, wEnd: Date): boolean {
  const salida = new Date(t.fecha_salida);
  if (salida >= wStart && salida <= wEnd) return true;
  if (t.fecha_llegada) {
    const llegada = new Date(t.fecha_llegada);
    if (llegada >= wStart && llegada <= wEnd) return true;
  }
  return tripIsOpen(t) && salida <= wEnd;
}

function tripClosedInWeek(t: Trip, wStart: Date, wEnd: Date): boolean {
  if (!tripIsClosed(t) || !t.fecha_llegada) return false;
  const llegada = new Date(t.fecha_llegada);
  return llegada >= wStart && llegada <= wEnd;
}

function tripChartDay(t: Trip, wStart: Date, wEnd: Date): string {
  if (tripClosedInWeek(t, wStart, wEnd)) return isoDay(new Date(t.fecha_llegada!));
  return isoDay(new Date(t.fecha_salida));
}

export default function Dashboard() {
  const { trips, drivers, trucks, clients, catalogLoading, catalogError } = useTlo();
  const { hasPermission, apiMode } = useAuth();
  const nav = useNavigate();
  const [docDash, setDocDash] = useState<DocumentDashboardSummary | null>(null);

  useEffect(() => {
    if (!apiMode || !hasPermission("documentos.ver") || catalogLoading) {
      setDocDash(null);
      return;
    }
    let cancel = false;
    void fetchDocumentDashboard()
      .then((d) => {
        if (!cancel) setDocDash(d);
      })
      .catch(() => {
        if (!cancel) setDocDash(null);
      });
    return () => {
      cancel = true;
    };
  }, [apiMode, hasPermission, catalogLoading]);

  if (catalogLoading) {
    return <p className="text-sm text-muted-foreground">Cargando datos del servidor…</p>;
  }

  const now = new Date();
  const wStart = startOfWeek(now);
  const wEnd = endOfWeek(now);

  const weekTrips = trips.filter((t) => tripInWeekScope(t, wStart, wEnd));

  const enriched = weekTrips.map(t => ({ trip: t, fin: computeTrip(t, driverById(drivers, t.driver_id)) }));
  const enCurso = trips.filter((t) => tripIsOpen(t)).length;
  const cerrados = trips.filter((t) => tripClosedInWeek(t, wStart, wEnd)).length;
  const ingresos = enriched.reduce((a, e) => a + e.fin.ingreso, 0);
  const costos = enriched.reduce((a, e) => a + e.fin.costo_total, 0);
  const utilidad = ingresos - costos;
  const margen = ingresos > 0 ? (utilidad / ingresos) * 100 : 0;
  const negativos = enriched.filter(
    (e) => tripClosedInWeek(e.trip, wStart, wEnd) && e.fin.utilidad < 0,
  ).length;
  const viajesNegativos = enriched
    .filter((e) => tripClosedInWeek(e.trip, wStart, wEnd) && e.fin.utilidad < 0)
    .sort((a, b) => a.fin.utilidad - b.fin.utilidad);

  // mini gráfico utilidad por día de la semana
  const days: { day: string; utilidad: number }[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(wStart); d.setDate(wStart.getDate() + i);
    const key = isoDay(d);
    const u = enriched
      .filter(e => tripChartDay(e.trip, wStart, wEnd) === key)
      .reduce((a, e) => a + e.fin.utilidad, 0);
    days.push({ day: d.toLocaleDateString("es-MX", { weekday: "short" }), utilidad: Math.round(u) });
  }

  const activos = trips.filter((t) => tripIsOpen(t)).slice(0, 5);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {catalogError && (
          <p className="text-sm text-destructive w-full sm:order-last">{catalogError}</p>
        )}
        <div>
          <p className="text-sm text-muted-foreground">
            Semana del {fmtDate(wStart.toISOString())} al {fmtDate(wEnd.toISOString())}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => nav("/liquidaciones")}>
            <Wallet className="h-4 w-4 mr-2" /> Nueva liquidación
          </Button>
          <Button onClick={() => nav("/viajes?nuevo=1")} className="bg-primary text-primary-foreground hover:bg-primary-glow">
            <Plus className="h-4 w-4 mr-2" /> Nuevo viaje
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Viajes en curso" value={String(enCurso)} hint="Activos ahora" icon={Activity} tone="accent" />
        <KpiCard label="Viajes cerrados" value={String(cerrados)} hint="Cerrados esta semana" icon={CheckCircle2} tone="success" />
        <KpiCard label="Ingresos" value={fmtMXN(ingresos)} hint="Semana actual" icon={DollarSign} tone="default" />
        <KpiCard label="Costos" value={fmtMXN(costos)} hint="Semana actual" icon={Truck} tone="default" />
        <KpiCard label="Utilidad neta" value={fmtMXN(utilidad)} hint={`Margen ${margen.toFixed(1)}%`} icon={TrendingUp} tone={utilidad >= 0 ? "success" : "destructive"} />
        <KpiCard label="Margen promedio" value={`${margen.toFixed(1)}%`} icon={TrendingUp} tone={margen >= 15 ? "success" : margen >= 5 ? "warning" : "destructive"} />
        <KpiCard label="Viajes negativos" value={String(negativos)} icon={AlertTriangle} tone={negativos > 0 ? "destructive" : "success"} />
        <KpiCard label="Operadores activos" value={String(drivers.filter(d => d.estatus === "activo").length)} icon={Users} tone="default" />
      </div>

      {viajesNegativos.length > 0 && (
        <Card className="tlo-shadow-md border-destructive/30">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              Viajes negativos esta semana ({viajesNegativos.length})
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Viajes cerrados en la semana cuyo costo superó el ingreso
            </p>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-secondary/50">
                  <TableHead>Folio</TableHead>
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
                {viajesNegativos.map(({ trip, fin }) => {
                  const dr = driverById(drivers, trip.driver_id);
                  const tk = truckById(trucks, trip.truck_id);
                  const cl = trip.client_id ? clients.find((c) => c.id === trip.client_id) : undefined;
                  return (
                    <TableRow
                      key={trip.id}
                      className="cursor-pointer hover:bg-muted/30"
                      onClick={() => nav(`/viajes/${trip.id}`)}
                    >
                      <TableCell className="font-mono font-semibold">{trip.folio}</TableCell>
                      <TableCell className="text-sm">{formatTripRoute(trip)}</TableCell>
                      <TableCell className="text-sm">{cl?.razon_social ?? "—"}</TableCell>
                      <TableCell className="text-sm">{dr?.nombre ?? "—"}</TableCell>
                      <TableCell className="text-sm font-mono">{tk?.numero_economico ?? "—"}</TableCell>
                      <TableCell className="text-right">{fmtMXN(fin.ingreso)}</TableCell>
                      <TableCell className="text-right">{fmtMXN(fin.costo_total)}</TableCell>
                      <TableCell className="text-right font-semibold text-destructive">{fmtMXN(fin.utilidad)}</TableCell>
                      <TableCell className="text-right"><MarginBadge pct={fin.margen_pct} /></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {docDash && hasPermission("documentos.ver") && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard
              label="Documentos por vencer"
              value={String(docDash.por_vencer_count)}
              icon={CalendarClock}
              tone="warning"
            />
            <KpiCard
              label="Documentos vencidos"
              value={String(docDash.vencido_count)}
              icon={FileWarning}
              tone="destructive"
            />
          </div>
          <Card className="tlo-shadow-md">
            <CardHeader>
              <CardTitle className="text-base">Próximos vencimientos y alertas</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-secondary/50">
                    <TableHead>Documento</TableHead>
                    <TableHead>Tipo entidad</TableHead>
                    <TableHead className="text-right">Vence</TableHead>
                    <TableHead className="text-right">Días</TableHead>
                    <TableHead>Estatus</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {docDash.upcoming.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                        Sin vencimientos urgentes en ventana de alerta
                      </TableCell>
                    </TableRow>
                  )}
                  {docDash.upcoming.map((u) => (
                    <TableRow
                      key={u.document_id}
                      className="cursor-pointer hover:bg-muted/30"
                      onClick={() =>
                        nav(
                          u.documentable_type === "truck"
                            ? `/camiones?open=${u.documentable_id}`
                            : `/operadores?open=${u.documentable_id}`,
                        )
                      }
                    >
                      <TableCell className="text-sm font-medium">{u.document_type_nombre}</TableCell>
                      <TableCell className="text-sm">
                        {u.documentable_type === "truck" ? "Unidad" : "Operador"}
                      </TableCell>
                      <TableCell className="text-right text-sm">{fmtDate(u.vigencia_fin)}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{u.days_left}</TableCell>
                      <TableCell className="text-sm capitalize">{u.status.replace("_", " ")}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 tlo-shadow-md">
          <CardHeader>
            <CardTitle className="text-base">Utilidad por día (semana actual)</CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={days}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="day" tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                  formatter={(v: number) => [fmtMXN(v), "Utilidad"]}
                />
                <Bar dataKey="utilidad" fill="hsl(var(--accent))" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="tlo-shadow-md">
          <CardHeader><CardTitle className="text-base">Flota</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {(["activo", "taller", "baja"] as const).map(s => {
              const n = trucks.filter(t => t.estatus === s).length;
              const label = s === "activo" ? "Activas" : s === "taller" ? "En taller" : "De baja";
              return (
                <div key={s} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="font-bold text-foreground">{n}</span>
                </div>
              );
            })}
            <div className="border-t pt-3 mt-3 flex items-center justify-between">
              <span className="text-sm font-medium">Total flota</span>
              <span className="text-lg font-bold">{trucks.length}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="tlo-shadow-md">
        <CardHeader>
          <CardTitle className="text-base">Viajes en curso</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-secondary/50">
                <TableHead>Folio</TableHead>
                <TableHead>Ruta</TableHead>
                <TableHead>Operador</TableHead>
                <TableHead>Camión</TableHead>
                <TableHead className="text-right">Tarifa</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {activos.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">Sin viajes en curso</TableCell></TableRow>
              )}
              {activos.map(t => {
                const dr = driverById(drivers, t.driver_id);
                const tk = truckById(trucks, t.truck_id);
                return (
                  <TableRow key={t.id} className="cursor-pointer hover:bg-muted/30" onClick={() => nav(`/viajes/${t.id}`)}>
                    <TableCell className="font-mono font-semibold">{t.folio}</TableCell>
                    <TableCell className="text-sm">{formatTripRoute(t)}</TableCell>
                    <TableCell className="text-sm">{dr?.nombre}</TableCell>
                    <TableCell className="text-sm font-mono">{tk?.numero_economico}</TableCell>
                    <TableCell className="text-right">{fmtMXN(t.tarifa)}</TableCell>
                    <TableCell><TripStatusesBadges statuses={t.statuses ?? []} /></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}