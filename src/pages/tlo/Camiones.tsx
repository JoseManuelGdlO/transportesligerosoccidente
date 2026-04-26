import { useState } from "react";
import { useTlo } from "@/context/TloContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil } from "lucide-react";
import { TruckStatusBadge } from "@/components/tlo/StatusBadge";
import { fmtMXN, fmtNumber } from "@/lib/format";
import type { Truck, TruckStatus } from "@/types/tlo";
import { toast } from "sonner";

const empty: Truck = { id: "", numero_economico: "", placas: "", marca: "", modelo: "", anio: new Date().getFullYear(), rendimiento_esperado: 3, costo_km_ref: 18, estatus: "activo" };

export default function Camiones() {
  const { trucks, upsertTruck } = useTlo();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Truck>(empty);

  const openNew = () => { setForm({ ...empty, id: "" }); setOpen(true); };
  const openEdit = (t: Truck) => { setForm(t); setOpen(true); };
  const save = () => {
    upsertTruck(form);
    toast.success(form.id ? "Camión actualizado" : "Camión registrado");
    setOpen(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{trucks.length} unidades en flota</p>
        <Button onClick={openNew} className="bg-primary text-primary-foreground hover:bg-primary-glow">
          <Plus className="h-4 w-4 mr-2" /> Nuevo camión
        </Button>
      </div>
      <Card className="tlo-shadow-md overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-secondary/50">
              <TableHead>No. económico</TableHead>
              <TableHead>Placas</TableHead>
              <TableHead>Marca / Modelo</TableHead>
              <TableHead className="text-right">Año</TableHead>
              <TableHead className="text-right">Rendimiento</TableHead>
              <TableHead className="text-right">Costo/km ref.</TableHead>
              <TableHead>Estatus</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {trucks.map(t => (
              <TableRow key={t.id} className="hover:bg-muted/30">
                <TableCell className="font-mono font-semibold">{t.numero_economico}</TableCell>
                <TableCell className="font-mono">{t.placas}</TableCell>
                <TableCell>{t.marca} {t.modelo}</TableCell>
                <TableCell className="text-right">{t.anio}</TableCell>
                <TableCell className="text-right">{fmtNumber(t.rendimiento_esperado, 1)} km/l</TableCell>
                <TableCell className="text-right">{fmtMXN(t.costo_km_ref)}</TableCell>
                <TableCell><TruckStatusBadge status={t.estatus} /></TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="sm" onClick={() => openEdit(t)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{form.id ? "Editar camión" : "Nuevo camión"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>No. económico</Label><Input value={form.numero_economico} onChange={e => setForm({ ...form, numero_economico: e.target.value })} /></div>
            <div><Label>Placas</Label><Input value={form.placas} onChange={e => setForm({ ...form, placas: e.target.value })} /></div>
            <div><Label>Marca</Label><Input value={form.marca} onChange={e => setForm({ ...form, marca: e.target.value })} /></div>
            <div><Label>Modelo</Label><Input value={form.modelo} onChange={e => setForm({ ...form, modelo: e.target.value })} /></div>
            <div><Label>Año</Label><Input type="number" value={form.anio} onChange={e => setForm({ ...form, anio: +e.target.value })} /></div>
            <div><Label>Rendimiento (km/l)</Label><Input type="number" step="0.1" value={form.rendimiento_esperado} onChange={e => setForm({ ...form, rendimiento_esperado: +e.target.value })} /></div>
            <div><Label>Costo/km referencia</Label><Input type="number" step="0.5" value={form.costo_km_ref} onChange={e => setForm({ ...form, costo_km_ref: +e.target.value })} /></div>
            <div>
              <Label>Estatus</Label>
              <Select value={form.estatus} onValueChange={(v: TruckStatus) => setForm({ ...form, estatus: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="activo">Activo</SelectItem>
                  <SelectItem value="taller">En taller</SelectItem>
                  <SelectItem value="baja">Baja</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save} className="bg-primary text-primary-foreground hover:bg-primary-glow">Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}