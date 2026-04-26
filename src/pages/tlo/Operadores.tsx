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
import { DriverStatusBadge } from "@/components/tlo/StatusBadge";
import { fmtDate, fmtMXN } from "@/lib/format";
import type { Driver, CommissionType, DriverStatus } from "@/types/tlo";
import { toast } from "sonner";

const empty: Driver = { id: "", nombre: "", telefono: "", licencia: "", fecha_ingreso: new Date().toISOString().slice(0,10), comision_tipo: "porcentaje", comision_valor: 8, estatus: "activo" };

export default function Operadores() {
  const { drivers, upsertDriver } = useTlo();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Driver>(empty);

  const save = () => {
    upsertDriver(form);
    toast.success(form.id ? "Operador actualizado" : "Operador registrado");
    setOpen(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{drivers.length} operadores registrados</p>
        <Button onClick={() => { setForm({ ...empty, id: "" }); setOpen(true); }} className="bg-primary text-primary-foreground hover:bg-primary-glow">
          <Plus className="h-4 w-4 mr-2" /> Nuevo operador
        </Button>
      </div>
      <Card className="tlo-shadow-md overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-secondary/50">
              <TableHead>Nombre</TableHead>
              <TableHead>Teléfono</TableHead>
              <TableHead>Licencia</TableHead>
              <TableHead>Ingreso</TableHead>
              <TableHead>Comisión</TableHead>
              <TableHead>Estatus</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {drivers.map(d => (
              <TableRow key={d.id} className="hover:bg-muted/30">
                <TableCell className="font-medium">{d.nombre}</TableCell>
                <TableCell className="font-mono text-sm">{d.telefono}</TableCell>
                <TableCell className="font-mono text-sm">{d.licencia}</TableCell>
                <TableCell className="text-sm">{fmtDate(d.fecha_ingreso)}</TableCell>
                <TableCell className="text-sm">
                  {d.comision_tipo === "porcentaje" ? `${d.comision_valor}% por viaje` : `${fmtMXN(d.comision_valor)} fijo`}
                </TableCell>
                <TableCell><DriverStatusBadge status={d.estatus} /></TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="sm" onClick={() => { setForm(d); setOpen(true); }}>
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
          <DialogHeader><DialogTitle>{form.id ? "Editar operador" : "Nuevo operador"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><Label>Nombre completo</Label><Input value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} /></div>
            <div><Label>Teléfono</Label><Input value={form.telefono} onChange={e => setForm({ ...form, telefono: e.target.value })} /></div>
            <div><Label>Licencia</Label><Input value={form.licencia} onChange={e => setForm({ ...form, licencia: e.target.value })} /></div>
            <div><Label>Fecha de ingreso</Label><Input type="date" value={form.fecha_ingreso.slice(0,10)} onChange={e => setForm({ ...form, fecha_ingreso: e.target.value })} /></div>
            <div>
              <Label>Tipo comisión</Label>
              <Select value={form.comision_tipo} onValueChange={(v: CommissionType) => setForm({ ...form, comision_tipo: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="porcentaje">Porcentaje</SelectItem>
                  <SelectItem value="fijo">Monto fijo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>{form.comision_tipo === "porcentaje" ? "% sobre tarifa" : "Monto MXN"}</Label><Input type="number" value={form.comision_valor} onChange={e => setForm({ ...form, comision_valor: +e.target.value })} /></div>
            <div>
              <Label>Estatus</Label>
              <Select value={form.estatus} onValueChange={(v: DriverStatus) => setForm({ ...form, estatus: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="activo">Activo</SelectItem>
                  <SelectItem value="inactivo">Inactivo</SelectItem>
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