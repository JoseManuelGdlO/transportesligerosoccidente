import { useState } from "react";
import { useTlo } from "@/context/TloContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Pencil } from "lucide-react";
import type { Client } from "@/types/tlo";
import { toast } from "sonner";

const empty: Client = { id: "", razon_social: "", rfc: "", contacto: "", telefono: "" };

export default function Clientes() {
  const { clients, upsertClient } = useTlo();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Client>(empty);

  const save = () => {
    upsertClient(form);
    toast.success(form.id ? "Cliente actualizado" : "Cliente registrado");
    setOpen(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{clients.length} clientes registrados</p>
        <Button onClick={() => { setForm({ ...empty, id: "" }); setOpen(true); }} className="bg-primary text-primary-foreground hover:bg-primary-glow">
          <Plus className="h-4 w-4 mr-2" /> Nuevo cliente
        </Button>
      </div>
      <Card className="tlo-shadow-md overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-secondary/50">
              <TableHead>Razón social</TableHead>
              <TableHead>RFC</TableHead>
              <TableHead>Contacto</TableHead>
              <TableHead>Teléfono</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {clients.map(c => (
              <TableRow key={c.id} className="hover:bg-muted/30">
                <TableCell className="font-medium">{c.razon_social}</TableCell>
                <TableCell className="font-mono text-sm">{c.rfc}</TableCell>
                <TableCell>{c.contacto}</TableCell>
                <TableCell className="font-mono text-sm">{c.telefono}</TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="sm" onClick={() => { setForm(c); setOpen(true); }}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{form.id ? "Editar cliente" : "Nuevo cliente"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Razón social</Label><Input value={form.razon_social} onChange={e => setForm({ ...form, razon_social: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>RFC</Label><Input value={form.rfc} onChange={e => setForm({ ...form, rfc: e.target.value })} /></div>
              <div><Label>Teléfono</Label><Input value={form.telefono} onChange={e => setForm({ ...form, telefono: e.target.value })} /></div>
            </div>
            <div><Label>Contacto</Label><Input value={form.contacto} onChange={e => setForm({ ...form, contacto: e.target.value })} /></div>
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