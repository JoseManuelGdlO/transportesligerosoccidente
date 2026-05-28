import { useCallback, useEffect, useState } from "react";
import { useTlo } from "@/context/TloContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, Trash2 } from "lucide-react";
import type { Client, ClientStatus, ClientUbicacion, ClientUbicacionTipo } from "@/types/tlo";
import {
  createClientUbicacion,
  deleteClientUbicacion,
  fetchClientUbicaciones,
  updateClientUbicacion,
} from "@/lib/tloApi";
import { toast } from "sonner";

const empty: Client = {
  id: "",
  razon_social: "",
  rfc: "",
  contacto: "",
  telefono: "",
  pais: "MEX",
  estatus: "activo",
};

const emptyUbic: Omit<ClientUbicacion, "id" | "client_id"> = {
  nombre: "",
  tipo: "Ambos",
  pais: "MEX",
  estatus: "activo",
};

export default function Clientes() {
  const { clients, upsertClient } = useTlo();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Client>(empty);
  const [ubicaciones, setUbicaciones] = useState<ClientUbicacion[]>([]);
  const [ubicOpen, setUbicOpen] = useState(false);
  const [ubicForm, setUbicForm] = useState<Omit<ClientUbicacion, "id" | "client_id">>(emptyUbic);
  const [editingUbicId, setEditingUbicId] = useState<string | null>(null);

  const loadUbicaciones = useCallback(async (clientId: string) => {
    try {
      const rows = await fetchClientUbicaciones(clientId);
      setUbicaciones(rows);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al cargar ubicaciones");
    }
  }, []);

  useEffect(() => {
    if (form.id) void loadUbicaciones(form.id);
    else setUbicaciones([]);
  }, [form.id, loadUbicaciones]);

  const save = () => {
    upsertClient(form);
    toast.success(form.id ? "Cliente actualizado" : "Cliente registrado");
    setOpen(false);
  };

  const openUbicDialog = (row?: ClientUbicacion) => {
    if (row) {
      setEditingUbicId(row.id);
      setUbicForm({
        nombre: row.nombre,
        tipo: row.tipo,
        calle: row.calle,
        numero_exterior: row.numero_exterior,
        numero_interior: row.numero_interior,
        colonia: row.colonia,
        localidad: row.localidad,
        municipio: row.municipio,
        estado: row.estado,
        cp: row.cp,
        pais: row.pais ?? "MEX",
        estatus: row.estatus ?? "activo",
      });
    } else {
      setEditingUbicId(null);
      setUbicForm(emptyUbic);
    }
    setUbicOpen(true);
  };

  const saveUbicacion = async () => {
    if (!form.id) return;
    if (!ubicForm.nombre.trim()) {
      toast.error("Captura el nombre de la ubicación");
      return;
    }
    try {
      if (editingUbicId) {
        await updateClientUbicacion(form.id, editingUbicId, ubicForm);
        toast.success("Ubicación actualizada");
      } else {
        await createClientUbicacion(form.id, ubicForm);
        toast.success("Ubicación registrada");
      }
      setUbicOpen(false);
      await loadUbicaciones(form.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al guardar ubicación");
    }
  };

  const removeUbicacion = async (id: string) => {
    if (!form.id) return;
    try {
      await deleteClientUbicacion(form.id, id);
      toast.success("Ubicación eliminada");
      await loadUbicaciones(form.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al eliminar");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{clients.length} clientes registrados</p>
        <Button
          onClick={() => {
            setForm({ ...empty, id: "" });
            setOpen(true);
          }}
          className="bg-primary text-primary-foreground hover:bg-primary-glow"
        >
          <Plus className="h-4 w-4 mr-2" /> Nuevo cliente
        </Button>
      </div>
      <Card className="tlo-shadow-md overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-secondary/50">
              <TableHead>Razón social</TableHead>
              <TableHead>RFC</TableHead>
              <TableHead>CP</TableHead>
              <TableHead>Estatus</TableHead>
              <TableHead>Contacto</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {clients.map((c) => (
              <TableRow key={c.id} className="hover:bg-muted/30">
                <TableCell className="font-medium">{c.razon_social}</TableCell>
                <TableCell className="font-mono text-sm">{c.rfc}</TableCell>
                <TableCell className="font-mono text-sm">{c.cp || "—"}</TableCell>
                <TableCell className="capitalize">{c.estatus ?? "activo"}</TableCell>
                <TableCell>{c.contacto}</TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setForm(c);
                      setOpen(true);
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form.id ? "Editar cliente" : "Nuevo cliente"}</DialogTitle>
          </DialogHeader>
          <Tabs defaultValue="datos">
            <TabsList>
              <TabsTrigger value="datos">Datos</TabsTrigger>
              <TabsTrigger value="ubicaciones" disabled={!form.id}>
                Ubicaciones
              </TabsTrigger>
            </TabsList>
            <TabsContent value="datos" className="space-y-3 pt-4">
              <div>
                <Label>Razón social</Label>
                <Input
                  value={form.razon_social}
                  onChange={(e) => setForm({ ...form, razon_social: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>RFC</Label>
                  <Input value={form.rfc} onChange={(e) => setForm({ ...form, rfc: e.target.value })} />
                </div>
                <div>
                  <Label>Teléfono</Label>
                  <Input value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} />
                </div>
                <div>
                  <Label>Contacto</Label>
                  <Input value={form.contacto} onChange={(e) => setForm({ ...form, contacto: e.target.value })} />
                </div>
                <div>
                  <Label>Correo electrónico</Label>
                  <Input
                    type="email"
                    value={form.email ?? ""}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Régimen fiscal</Label>
                  <Input
                    value={form.regimen_fiscal ?? ""}
                    onChange={(e) => setForm({ ...form, regimen_fiscal: e.target.value })}
                    placeholder="601"
                  />
                </div>
                <div>
                  <Label>Estatus</Label>
                  <Select
                    value={form.estatus ?? "activo"}
                    onValueChange={(v: ClientStatus) => setForm({ ...form, estatus: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="activo">Activo</SelectItem>
                      <SelectItem value="inactivo">Inactivo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="rounded-md border border-dashed p-3 space-y-3">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Domicilio fiscal (Carta Porte)
                </p>
                <div>
                  <Label>Calle</Label>
                  <Input value={form.calle ?? ""} onChange={(e) => setForm({ ...form, calle: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>No. exterior</Label>
                    <Input
                      value={form.numero_exterior ?? ""}
                      onChange={(e) => setForm({ ...form, numero_exterior: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>No. interior</Label>
                    <Input
                      value={form.numero_interior ?? ""}
                      onChange={(e) => setForm({ ...form, numero_interior: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Colonia</Label>
                    <Input value={form.colonia ?? ""} onChange={(e) => setForm({ ...form, colonia: e.target.value })} />
                  </div>
                  <div>
                    <Label>Localidad</Label>
                    <Input
                      value={form.localidad ?? ""}
                      onChange={(e) => setForm({ ...form, localidad: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Municipio</Label>
                    <Input
                      value={form.municipio ?? ""}
                      onChange={(e) => setForm({ ...form, municipio: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Estado</Label>
                    <Input value={form.estado ?? ""} onChange={(e) => setForm({ ...form, estado: e.target.value })} />
                  </div>
                  <div>
                    <Label>C.P.</Label>
                    <Input
                      value={form.cp ?? ""}
                      onChange={(e) => setForm({ ...form, cp: e.target.value })}
                      maxLength={5}
                    />
                  </div>
                  <div>
                    <Label>País</Label>
                    <Input
                      value={form.pais ?? "MEX"}
                      onChange={(e) => setForm({ ...form, pais: e.target.value })}
                      maxLength={3}
                    />
                  </div>
                </div>
              </div>
              <div>
                <Label>Observaciones</Label>
                <Textarea
                  value={form.observaciones ?? ""}
                  onChange={(e) => setForm({ ...form, observaciones: e.target.value })}
                  rows={3}
                />
              </div>
            </TabsContent>
            <TabsContent value="ubicaciones" className="space-y-3 pt-4">
              {!form.id ? (
                <p className="text-sm text-muted-foreground">Guarda el cliente para administrar ubicaciones.</p>
              ) : (
                <>
                  <div className="flex justify-end">
                    <Button size="sm" onClick={() => openUbicDialog()}>
                      <Plus className="h-4 w-4 mr-1" /> Nueva ubicación
                    </Button>
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nombre</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead>CP</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ubicaciones.map((u) => (
                        <TableRow key={u.id}>
                          <TableCell>{u.nombre}</TableCell>
                          <TableCell>{u.tipo}</TableCell>
                          <TableCell className="font-mono text-sm">{u.cp || "—"}</TableCell>
                          <TableCell className="text-right space-x-1">
                            <Button variant="ghost" size="sm" onClick={() => openUbicDialog(u)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => void removeUbicacion(u.id)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </>
              )}
            </TabsContent>
          </Tabs>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={save} className="bg-primary text-primary-foreground hover:bg-primary-glow">
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={ubicOpen} onOpenChange={setUbicOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingUbicId ? "Editar ubicación" : "Nueva ubicación"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nombre</Label>
              <Input value={ubicForm.nombre} onChange={(e) => setUbicForm({ ...ubicForm, nombre: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Tipo</Label>
                <Select
                  value={ubicForm.tipo}
                  onValueChange={(v: ClientUbicacionTipo) => setUbicForm({ ...ubicForm, tipo: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Origen">Origen</SelectItem>
                    <SelectItem value="Destino">Destino</SelectItem>
                    <SelectItem value="Ambos">Ambos</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Estatus</Label>
                <Select
                  value={ubicForm.estatus ?? "activo"}
                  onValueChange={(v: ClientStatus) => setUbicForm({ ...ubicForm, estatus: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="activo">Activo</SelectItem>
                    <SelectItem value="inactivo">Inactivo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Calle</Label>
              <Input value={ubicForm.calle ?? ""} onChange={(e) => setUbicForm({ ...ubicForm, calle: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>No. exterior</Label>
                <Input
                  value={ubicForm.numero_exterior ?? ""}
                  onChange={(e) => setUbicForm({ ...ubicForm, numero_exterior: e.target.value })}
                />
              </div>
              <div>
                <Label>No. interior</Label>
                <Input
                  value={ubicForm.numero_interior ?? ""}
                  onChange={(e) => setUbicForm({ ...ubicForm, numero_interior: e.target.value })}
                />
              </div>
              <div>
                <Label>Colonia</Label>
                <Input
                  value={ubicForm.colonia ?? ""}
                  onChange={(e) => setUbicForm({ ...ubicForm, colonia: e.target.value })}
                />
              </div>
              <div>
                <Label>Localidad</Label>
                <Input
                  value={ubicForm.localidad ?? ""}
                  onChange={(e) => setUbicForm({ ...ubicForm, localidad: e.target.value })}
                />
              </div>
              <div>
                <Label>Municipio</Label>
                <Input
                  value={ubicForm.municipio ?? ""}
                  onChange={(e) => setUbicForm({ ...ubicForm, municipio: e.target.value })}
                />
              </div>
              <div>
                <Label>Estado</Label>
                <Input
                  value={ubicForm.estado ?? ""}
                  onChange={(e) => setUbicForm({ ...ubicForm, estado: e.target.value })}
                />
              </div>
              <div>
                <Label>C.P.</Label>
                <Input
                  value={ubicForm.cp ?? ""}
                  onChange={(e) => setUbicForm({ ...ubicForm, cp: e.target.value })}
                  maxLength={5}
                />
              </div>
              <div>
                <Label>País</Label>
                <Input
                  value={ubicForm.pais ?? "MEX"}
                  onChange={(e) => setUbicForm({ ...ubicForm, pais: e.target.value })}
                  maxLength={3}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUbicOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => void saveUbicacion()}>Guardar ubicación</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
