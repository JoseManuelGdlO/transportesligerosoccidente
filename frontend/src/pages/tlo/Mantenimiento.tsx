import { useCallback, useEffect, useState } from "react";
import { useTlo } from "@/context/TloContext";
import { apiFetch, readJson } from "@/lib/api";
import type { MaintenanceOverviewUnit, MaintenanceType } from "@/types/tlo";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Wrench, AlertTriangle, X } from "lucide-react";
import { fmtNumber, fmtMXN, fmtDate } from "@/lib/format";
import { toast } from "sonner";

const tipoLabel: Record<MaintenanceType, string> = {
  menor: "Menor",
  intermedio: "Intermedio",
  correctivo: "Correctivo",
};

export default function Mantenimiento() {
  const { trucks } = useTlo();
  const [units, setUnits] = useState<MaintenanceOverviewUnit[]>([]);
  const [loading, setLoading] = useState(false);
  const [recordOpen, setRecordOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [form, setForm] = useState({
    truck_id: "",
    tipo: "menor" as MaintenanceType,
    km_odometro: 0,
    fecha: new Date().toISOString().slice(0, 10),
    costo: 0,
    descripcion: "",
    taller: "",
    intervalo_km: 10000,
    ultimo_km: 0,
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/maintenance/overview");
      const data = await readJson<MaintenanceOverviewUnit[]>(res);
      setUnits(data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al cargar mantenimiento");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const saveSchedule = async () => {
    if (!form.truck_id) return;
    try {
      await apiFetch("/maintenance/schedules", {
        method: "PUT",
        body: JSON.stringify({
          truck_id: form.truck_id,
          tipo: form.tipo,
          intervalo_km: form.tipo === "correctivo" ? null : form.intervalo_km,
          ultimo_km: form.ultimo_km,
        }),
      });
      toast.success("Programación guardada");
      setScheduleOpen(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    }
  };

  const removeSchedule = async (truckId: string, tipo: MaintenanceType) => {
    try {
      const params = new URLSearchParams({ truck_id: truckId, tipo });
      const res = await apiFetch(`/maintenance/schedules?${params}`, { method: "DELETE" });
      if (!res.ok) await readJson(res);
      toast.success("Programación eliminada");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al eliminar");
    }
  };

  const saveRecord = async () => {
    if (!form.truck_id || !form.descripcion.trim()) return;
    try {
      await apiFetch("/maintenance/records", {
        method: "POST",
        body: JSON.stringify({
          truck_id: form.truck_id,
          tipo: form.tipo,
          km_odometro: form.km_odometro,
          fecha: form.fecha,
          costo: form.costo,
          descripcion: form.descripcion,
          taller: form.taller || undefined,
        }),
      });
      toast.success("Servicio registrado");
      setRecordOpen(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 justify-between items-center">
        <p className="text-sm text-muted-foreground">
          Odómetro estimado por último viaje cerrado o ticket de combustible. Alertas por km para menor e intermedio.
        </p>
        <Button variant="outline" onClick={() => void load()} disabled={loading}>
          Actualizar
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {units.map((u) => (
          <Card key={u.truck_id} className="tlo-shadow-md">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <Wrench className="h-4 w-4" />
                  {u.numero_economico} · {u.placas}
                </span>
                <Badge variant="outline">{fmtNumber(u.km_actual)} km</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {u.proximos.length === 0 ? (
                <p className="text-muted-foreground">Sin programación de servicios por km.</p>
              ) : (
                u.proximos.map((p) => (
                  <div
                    key={p.tipo}
                    className={`flex items-center gap-2 rounded border px-3 py-2 ${p.vencido ? "border-destructive/50 bg-destructive/5" : ""}`}
                  >
                    <span className="flex-1 min-w-0">
                      {tipoLabel[p.tipo]} — próximo a {fmtNumber(p.km_proximo)} km
                    </span>
                    {p.vencido ? (
                      <Badge variant="destructive" className="gap-1 shrink-0">
                        <AlertTriangle className="h-3 w-3" /> Vencido
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground shrink-0">{fmtNumber(p.km_restantes)} km rest.</span>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                      aria-label={`Eliminar programación ${tipoLabel[p.tipo]}`}
                      onClick={() => void removeSchedule(u.truck_id, p.tipo)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))
              )}
              {u.ultimos_registros.length > 0 && (
                <div className="pt-2 border-t">
                  <p className="text-xs uppercase text-muted-foreground mb-1">Últimos servicios</p>
                  {u.ultimos_registros.map((r) => (
                    <p key={r.id} className="text-xs">
                      {fmtDate(r.fecha)} · {tipoLabel[r.tipo]} @ {fmtNumber(r.km_odometro)} km — {r.descripcion}
                    </p>
                  ))}
                </div>
              )}
              <div className="flex gap-2 pt-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setForm((f) => ({ ...f, truck_id: u.truck_id, km_odometro: u.km_actual }));
                    setScheduleOpen(true);
                  }}
                >
                  Programar
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    setForm((f) => ({ ...f, truck_id: u.truck_id, km_odometro: u.km_actual }));
                    setRecordOpen(true);
                  }}
                >
                  Registrar servicio
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {units.length === 0 && !loading && (
        <p className="text-center text-muted-foreground py-12">No hay unidades activas.</p>
      )}

      <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Programación por km</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div>
              <Label>Unidad</Label>
              <Select value={form.truck_id} onValueChange={(v) => setForm({ ...form, truck_id: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {trucks.filter((t) => t.estatus !== "baja").map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.numero_economico}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Tipo</Label>
              <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v as MaintenanceType })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="menor">Menor</SelectItem>
                  <SelectItem value="intermedio">Intermedio</SelectItem>
                  <SelectItem value="correctivo">Correctivo (sin intervalo)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.tipo !== "correctivo" && (
              <>
                <div><Label>Intervalo (km)</Label><Input type="number" value={form.intervalo_km} onChange={(e) => setForm({ ...form, intervalo_km: +e.target.value })} /></div>
                <div><Label>Último servicio (km)</Label><Input type="number" value={form.ultimo_km} onChange={(e) => setForm({ ...form, ultimo_km: +e.target.value })} /></div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setScheduleOpen(false)}>Cancelar</Button>
            <Button onClick={saveSchedule}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={recordOpen} onOpenChange={setRecordOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Registrar mantenimiento</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label>Unidad</Label>
              <Select value={form.truck_id} onValueChange={(v) => setForm({ ...form, truck_id: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {trucks.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.numero_economico}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Tipo</Label>
              <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v as MaintenanceType })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="menor">Menor</SelectItem>
                  <SelectItem value="intermedio">Intermedio</SelectItem>
                  <SelectItem value="correctivo">Correctivo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Fecha</Label><Input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} /></div>
            <div><Label>Km odómetro</Label><Input type="number" value={form.km_odometro} onChange={(e) => setForm({ ...form, km_odometro: +e.target.value })} /></div>
            <div><Label>Costo</Label><Input type="number" value={form.costo} onChange={(e) => setForm({ ...form, costo: +e.target.value })} /></div>
            <div className="col-span-2"><Label>Taller</Label><Input value={form.taller} onChange={(e) => setForm({ ...form, taller: e.target.value })} /></div>
            <div className="col-span-2"><Label>Descripción</Label><Input value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRecordOpen(false)}>Cancelar</Button>
            <Button onClick={saveRecord}>Registrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
