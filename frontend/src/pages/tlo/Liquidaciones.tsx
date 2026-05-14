import { useMemo, useState } from "react";
import { useTlo } from "@/context/TloContext";
import { computeSettlement, computeTrip, driverById } from "@/lib/calc";
import { startOfWeek, endOfWeek, fmtMXN, fmtDate, fmtNumber } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { KpiCard } from "@/components/tlo/KpiCard";
import { Wallet, FileText, Lock, Receipt, TrendingUp, Truck as TruckIcon } from "lucide-react";
import { toast } from "sonner";

const toInputDate = (d: Date) => d.toISOString().slice(0, 10);

export default function Liquidaciones() {
  const { drivers, trips } = useTlo();
  const activeDrivers = drivers.filter(d => d.estatus === "activo");

  const [driverId, setDriverId] = useState(activeDrivers[0]?.id || "");
  const today = new Date();
  const [inicio, setInicio] = useState(toInputDate(startOfWeek(today)));
  const [fin, setFin] = useState(toInputDate(endOfWeek(today)));

  const driver = drivers.find(d => d.id === driverId);
  const summary = useMemo(() => {
    if (!driver) return null;
    const ini = new Date(inicio + "T00:00:00");
    const f = new Date(fin + "T23:59:59");
    return computeSettlement(driver, trips, ini, f);
  }, [driver, inicio, fin, trips]);

  return (
    <div className="space-y-4">
      <Card className="p-4 tlo-shadow-md">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[240px]">
            <Label className="text-xs">Operador</Label>
            <Select value={driverId} onValueChange={setDriverId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {activeDrivers.map(d => <SelectItem key={d.id} value={d.id}>{d.nombre}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div><Label className="text-xs">Desde</Label><Input type="date" value={inicio} onChange={e => setInicio(e.target.value)} /></div>
          <div><Label className="text-xs">Hasta</Label><Input type="date" value={fin} onChange={e => setFin(e.target.value)} /></div>
          <Button variant="outline" onClick={() => {
            setInicio(toInputDate(startOfWeek(today)));
            setFin(toInputDate(endOfWeek(today)));
          }}>Semana actual</Button>
        </div>
      </Card>

      {!driver || !summary ? (
        <p className="text-muted-foreground">Selecciona un operador.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard label="Viajes" value={String(summary.trips.length)} icon={TruckIcon} tone="default" />
            <KpiCard label="Ingresos generados" value={fmtMXN(summary.total_ingresos)} icon={TrendingUp} tone="success" hint={`${fmtNumber(summary.total_km)} km`} />
            <KpiCard label="Total comisiones" value={fmtMXN(summary.total_comisiones)} icon={Wallet} tone="accent" />
            <KpiCard
              label="Neto a pagar"
              value={fmtMXN(summary.neto_pagar)}
              icon={Receipt}
              tone={summary.neto_pagar >= 0 ? "success" : "destructive"}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-2 tlo-shadow-md">
              <CardHeader><CardTitle className="text-base">Viajes del periodo</CardTitle></CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-secondary/50">
                      <TableHead>Folio</TableHead>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Ruta</TableHead>
                      <TableHead className="text-right">Km</TableHead>
                      <TableHead className="text-right">Ingreso</TableHead>
                      <TableHead className="text-right">Comisión</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {summary.trips.length === 0 && (
                      <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">Sin viajes en el periodo</TableCell></TableRow>
                    )}
                    {summary.trips.map(t => {
                      const f = computeTrip(t, driver);
                      return (
                        <TableRow key={t.id}>
                          <TableCell className="font-mono text-sm">{t.folio}</TableCell>
                          <TableCell className="text-sm">{fmtDate(t.fecha_salida)}</TableCell>
                          <TableCell className="text-sm">{t.origen} → {t.destino}</TableCell>
                          <TableCell className="text-right font-mono">{fmtNumber(f.km_recorridos)}</TableCell>
                          <TableCell className="text-right">{fmtMXN(f.ingreso)}</TableCell>
                          <TableCell className="text-right font-semibold text-accent">{fmtMXN(f.comision)}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card className="tlo-shadow-md">
              <CardHeader><CardTitle className="text-base">Resumen de liquidación</CardTitle></CardHeader>
              <CardContent className="space-y-4 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs uppercase mb-2">Viáticos</p>
                  <div className="space-y-1.5">
                    <div className="flex justify-between"><span>Entregados</span><span className="font-mono">{fmtMXN(summary.viaticos_entregados)}</span></div>
                    <div className="flex justify-between"><span>Comprobados</span><span className="font-mono">{fmtMXN(summary.viaticos_comprobados)}</span></div>
                    <div className={`flex justify-between font-semibold pt-1.5 border-t ${summary.saldo_viaticos >= 0 ? "text-success" : "text-destructive"}`}>
                      <span>{summary.saldo_viaticos >= 0 ? "A favor del operador" : "No comprobado"}</span>
                      <span className="font-mono">{fmtMXN(Math.abs(summary.saldo_viaticos))}</span>
                    </div>
                  </div>
                </div>
                <div className="border-t pt-3 space-y-1.5">
                  <div className="flex justify-between"><span>Total comisiones</span><span className="font-mono font-semibold">{fmtMXN(summary.total_comisiones)}</span></div>
                  <div className="flex justify-between text-destructive"><span>(−) Viáticos no comprobados</span><span className="font-mono">{fmtMXN(Math.max(0, summary.viaticos_entregados - summary.viaticos_comprobados))}</span></div>
                </div>
                <div className="bg-primary text-primary-foreground p-4 rounded-md">
                  <p className="text-xs uppercase opacity-80">Neto a pagar</p>
                  <p className="text-2xl font-bold mt-1">{fmtMXN(summary.neto_pagar)}</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => toast.info("Exportación a PDF (demo)")}>
                    <FileText className="h-4 w-4 mr-2" /> PDF
                  </Button>
                  <Button className="flex-1 bg-success text-success-foreground hover:bg-success/90" onClick={() => toast.success("Liquidación cerrada (demo)")}>
                    <Lock className="h-4 w-4 mr-2" /> Cerrar
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}