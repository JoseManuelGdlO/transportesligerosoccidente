import { useMemo } from "react";
import { useTlo } from "@/context/TloContext";
import { computeTrip, driverById, truckById } from "@/lib/calc";
import { fmtMXN, fmtNumber } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MarginBadge } from "@/components/tlo/StatusBadge";
import { Download } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { toast } from "sonner";

export default function Reportes() {
  const { trips, drivers, trucks, clients } = useTlo();

  const closed = trips.filter(t => t.estatus === "cerrado");

  const byTruck = useMemo(() => trucks.map(tk => {
    const ts = closed.filter(t => t.truck_id === tk.id);
    const fin = ts.reduce((acc, t) => {
      const f = computeTrip(t, driverById(drivers, t.driver_id));
      acc.ingreso += f.ingreso; acc.utilidad += f.utilidad; acc.km += f.km_recorridos;
      return acc;
    }, { ingreso: 0, utilidad: 0, km: 0 });
    return { ...tk, viajes: ts.length, ...fin, margen: fin.ingreso > 0 ? (fin.utilidad / fin.ingreso) * 100 : 0 };
  }).sort((a, b) => b.utilidad - a.utilidad), [closed, trucks, drivers]);

  const byDriver = useMemo(() => drivers.map(d => {
    const ts = closed.filter(t => t.driver_id === d.id);
    const fin = ts.reduce((acc, t) => {
      const f = computeTrip(t, d);
      acc.ingreso += f.ingreso; acc.utilidad += f.utilidad; acc.comision += f.comision;
      return acc;
    }, { ingreso: 0, utilidad: 0, comision: 0 });
    return { ...d, viajes: ts.length, ...fin, margen: fin.ingreso > 0 ? (fin.utilidad / fin.ingreso) * 100 : 0 };
  }).sort((a, b) => b.utilidad - a.utilidad), [closed, drivers]);

  const byClient = useMemo(() => clients.map(c => {
    const ts = closed.filter(t => t.client_id === c.id);
    const fin = ts.reduce((acc, t) => {
      const f = computeTrip(t, driverById(drivers, t.driver_id));
      acc.ingreso += f.ingreso; acc.utilidad += f.utilidad;
      return acc;
    }, { ingreso: 0, utilidad: 0 });
    return { ...c, viajes: ts.length, ...fin, margen: fin.ingreso > 0 ? (fin.utilidad / fin.ingreso) * 100 : 0 };
  }).sort((a, b) => b.utilidad - a.utilidad), [closed, clients, drivers]);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant="outline" onClick={() => toast.info("Exportación a Excel (demo)")}>
          <Download className="h-4 w-4 mr-2" /> Exportar
        </Button>
      </div>

      <Tabs defaultValue="camion">
        <TabsList>
          <TabsTrigger value="camion">Por camión</TabsTrigger>
          <TabsTrigger value="operador">Por operador</TabsTrigger>
          <TabsTrigger value="cliente">Por cliente</TabsTrigger>
        </TabsList>

        <TabsContent value="camion" className="mt-4 space-y-4">
          <Card className="tlo-shadow-md">
            <CardHeader><CardTitle className="text-base">Utilidad por camión</CardTitle></CardHeader>
            <CardContent className="h-64">
              <ResponsiveContainer>
                <BarChart data={byTruck.map(t => ({ name: t.numero_economico, utilidad: Math.round(t.utilidad) }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} formatter={(v: number) => fmtMXN(v)} />
                  <Bar dataKey="utilidad" fill="hsl(var(--accent))" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <Card className="tlo-shadow-md overflow-hidden">
            <Table>
              <TableHeader><TableRow className="bg-secondary/50"><TableHead>Unidad</TableHead><TableHead className="text-right">Viajes</TableHead><TableHead className="text-right">Km</TableHead><TableHead className="text-right">Ingreso</TableHead><TableHead className="text-right">Utilidad</TableHead><TableHead className="text-right">Margen</TableHead></TableRow></TableHeader>
              <TableBody>
                {byTruck.map(t => (
                  <TableRow key={t.id}>
                    <TableCell className="font-mono font-semibold">{t.numero_economico} <span className="font-normal text-muted-foreground">{t.marca} {t.modelo}</span></TableCell>
                    <TableCell className="text-right">{t.viajes}</TableCell>
                    <TableCell className="text-right font-mono">{fmtNumber(t.km)}</TableCell>
                    <TableCell className="text-right">{fmtMXN(t.ingreso)}</TableCell>
                    <TableCell className={`text-right font-semibold ${t.utilidad >= 0 ? "text-success" : "text-destructive"}`}>{fmtMXN(t.utilidad)}</TableCell>
                    <TableCell className="text-right">{t.viajes > 0 ? <MarginBadge pct={t.margen} /> : <span className="text-muted-foreground text-xs">—</span>}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="operador" className="mt-4">
          <Card className="tlo-shadow-md overflow-hidden">
            <Table>
              <TableHeader><TableRow className="bg-secondary/50"><TableHead>Operador</TableHead><TableHead className="text-right">Viajes</TableHead><TableHead className="text-right">Ingresos</TableHead><TableHead className="text-right">Comisiones</TableHead><TableHead className="text-right">Utilidad</TableHead><TableHead className="text-right">Margen</TableHead></TableRow></TableHeader>
              <TableBody>
                {byDriver.map(d => (
                  <TableRow key={d.id}>
                    <TableCell className="font-medium">{d.nombre}</TableCell>
                    <TableCell className="text-right">{d.viajes}</TableCell>
                    <TableCell className="text-right">{fmtMXN(d.ingreso)}</TableCell>
                    <TableCell className="text-right text-accent font-semibold">{fmtMXN(d.comision)}</TableCell>
                    <TableCell className={`text-right font-semibold ${d.utilidad >= 0 ? "text-success" : "text-destructive"}`}>{fmtMXN(d.utilidad)}</TableCell>
                    <TableCell className="text-right">{d.viajes > 0 ? <MarginBadge pct={d.margen} /> : <span className="text-muted-foreground text-xs">—</span>}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="cliente" className="mt-4">
          <Card className="tlo-shadow-md overflow-hidden">
            <Table>
              <TableHeader><TableRow className="bg-secondary/50"><TableHead>Cliente</TableHead><TableHead className="text-right">Viajes</TableHead><TableHead className="text-right">Ingresos</TableHead><TableHead className="text-right">Utilidad</TableHead><TableHead className="text-right">Margen</TableHead></TableRow></TableHeader>
              <TableBody>
                {byClient.map(c => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.razon_social}</TableCell>
                    <TableCell className="text-right">{c.viajes}</TableCell>
                    <TableCell className="text-right">{fmtMXN(c.ingreso)}</TableCell>
                    <TableCell className={`text-right font-semibold ${c.utilidad >= 0 ? "text-success" : "text-destructive"}`}>{fmtMXN(c.utilidad)}</TableCell>
                    <TableCell className="text-right">{c.viajes > 0 ? <MarginBadge pct={c.margen} /> : <span className="text-muted-foreground text-xs">—</span>}</TableCell>
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