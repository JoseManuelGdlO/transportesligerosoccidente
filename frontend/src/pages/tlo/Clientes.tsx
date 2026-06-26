import { useCallback, useEffect, useState } from "react";
import { useTlo } from "@/context/TloContext";
import { ClientFormFields } from "@/components/tlo/ClientFormFields";
import { DomicilioSatFields } from "@/components/tlo/DomicilioSatFields";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import {
  CLIENT_FORM_DOMICILIO_REQUIRED_TOAST,
  CLIENT_FORM_REQUIRED_TOAST,
  hasFormErrors,
  validateClientForm,
  type ClientFormErrors,
} from "@/lib/validateClientForm";
import {
  UBICACION_FORM_REQUIRED_TOAST,
  validateClientUbicacionForm,
  type ClientUbicacionFormErrors,
} from "@/lib/validateClientUbicacionForm";
import { cn } from "@/lib/utils";
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
  const [fieldErrors, setFieldErrors] = useState<ClientFormErrors>({});
  const [saving, setSaving] = useState(false);
  const [ubicaciones, setUbicaciones] = useState<ClientUbicacion[]>([]);
  const [ubicOpen, setUbicOpen] = useState(false);
  const [ubicForm, setUbicForm] = useState<Omit<ClientUbicacion, "id" | "client_id">>(emptyUbic);
  const [ubicFieldErrors, setUbicFieldErrors] = useState<ClientUbicacionFormErrors>({});
  const [ubicSaving, setUbicSaving] = useState(false);
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

  const clearClientFieldError = (field: keyof ClientFormErrors) => {
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const clearUbicFieldError = (field: keyof ClientUbicacionFormErrors) => {
    setUbicFieldErrors((prev) => {
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const handleClientDialogOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) setFieldErrors({});
  };

  const handleUbicDialogOpenChange = (next: boolean) => {
    setUbicOpen(next);
    if (!next) setUbicFieldErrors({});
  };

  const openClientDialog = (client?: Client) => {
    setFieldErrors({});
    if (client) setForm(client);
    else setForm({ ...empty, id: "" });
    setOpen(true);
  };

  const save = async () => {
    const isEditing = !!form.id;
    const errors = validateClientForm(form, { requireDomicilio: isEditing });
    setFieldErrors(errors);
    if (hasFormErrors(errors)) {
      toast.error(
        errors.pais || errors.estado || errors.cp
          ? CLIENT_FORM_DOMICILIO_REQUIRED_TOAST
          : CLIENT_FORM_REQUIRED_TOAST,
      );
      return;
    }
    setSaving(true);
    try {
      await upsertClient(form);
      toast.success(form.id ? "Cliente actualizado" : "Cliente registrado");
      setOpen(false);
      setFieldErrors({});
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al guardar cliente");
    } finally {
      setSaving(false);
    }
  };

  const openUbicDialog = (row?: ClientUbicacion) => {
    setUbicFieldErrors({});
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
    if (!form.id) {
      toast.error("Guarda el cliente antes de agregar ubicaciones");
      return;
    }
    const errors = validateClientUbicacionForm(ubicForm);
    setUbicFieldErrors(errors);
    if (hasFormErrors(errors)) {
      toast.error(errors.nombre ? UBICACION_FORM_REQUIRED_TOAST : "Revisa los datos de la ubicación");
      return;
    }
    setUbicSaving(true);
    try {
      if (editingUbicId) {
        await updateClientUbicacion(form.id, editingUbicId, ubicForm);
        toast.success("Ubicación actualizada");
      } else {
        await createClientUbicacion(form.id, ubicForm);
        toast.success("Ubicación registrada");
      }
      setUbicOpen(false);
      setUbicFieldErrors({});
      await loadUbicaciones(form.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al guardar ubicación");
    } finally {
      setUbicSaving(false);
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
          onClick={() => openClientDialog()}
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
                  <Button variant="ghost" size="sm" onClick={() => openClientDialog(c)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={open} onOpenChange={handleClientDialogOpenChange}>
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
            <TabsContent value="datos" className="pt-4">
              <ClientFormFields
                form={form}
                isEditing={!!form.id}
                onChange={(patch) => setForm({ ...form, ...patch })}
                fieldErrors={fieldErrors}
                onClearError={clearClientFieldError}
              />
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
            <Button variant="outline" onClick={() => handleClientDialogOpenChange(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button
              onClick={() => void save()}
              disabled={saving}
              className="bg-primary text-primary-foreground hover:bg-primary-glow"
            >
              {saving ? "Guardando…" : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={ubicOpen} onOpenChange={handleUbicDialogOpenChange}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingUbicId ? "Editar ubicación" : "Nueva ubicación"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="ubic_nombre">
                Nombre<span className="text-destructive ml-0.5">*</span>
              </Label>
              <Input
                id="ubic_nombre"
                required
                value={ubicForm.nombre}
                aria-invalid={!!ubicFieldErrors.nombre}
                className={cn(ubicFieldErrors.nombre && "border-destructive")}
                onChange={(e) => {
                  setUbicForm({ ...ubicForm, nombre: e.target.value });
                  clearUbicFieldError("nombre");
                }}
              />
              {ubicFieldErrors.nombre && (
                <p className="text-sm text-destructive mt-1">{ubicFieldErrors.nombre}</p>
              )}
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
            <DomicilioSatFields
              idPrefix="ubic"
              value={ubicForm}
              onChange={(patch) => setUbicForm({ ...ubicForm, ...patch })}
              cpError={ubicFieldErrors.cp}
              paisError={ubicFieldErrors.pais}
              onClearCpError={() => clearUbicFieldError("cp")}
              onClearPaisError={() => clearUbicFieldError("pais")}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => handleUbicDialogOpenChange(false)} disabled={ubicSaving}>
              Cancelar
            </Button>
            <Button onClick={() => void saveUbicacion()} disabled={ubicSaving}>
              {ubicSaving ? "Guardando…" : "Guardar ubicación"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
