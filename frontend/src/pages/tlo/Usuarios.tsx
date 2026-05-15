import { useState } from "react";
import { useTlo } from "@/context/TloContext";
import { useAuth } from "@/context/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, ShieldCheck, ShieldAlert, Lock, Mail, UserCog } from "lucide-react";
import { fmtDate } from "@/lib/format";
import type { SystemUser, UserRole, Permission } from "@/types/tlo";
import { toast } from "sonner";

const PERMISSION_GROUPS: { label: string; perms: { id: Permission; label: string }[] }[] = [
  {
    label: "Viajes",
    perms: [
      { id: "viajes.ver", label: "Ver viajes" },
      { id: "viajes.crear", label: "Abrir nuevos viajes" },
      { id: "viajes.cerrar", label: "Cerrar viajes" },
      { id: "viajes.eliminar", label: "Eliminar viajes" },
    ],
  },
  {
    label: "Liquidaciones",
    perms: [
      { id: "liquidaciones.ver", label: "Ver liquidaciones" },
      { id: "liquidaciones.cerrar", label: "Cerrar liquidaciones semanales" },
    ],
  },
  {
    label: "Catálogos",
    perms: [
      { id: "catalogos.ver", label: "Ver catálogos (camiones, operadores, clientes)" },
      { id: "catalogos.editar", label: "Editar catálogos" },
    ],
  },
  {
    label: "Reportes y administración",
    perms: [
      { id: "reportes.ver", label: "Ver reportes y estadísticas" },
      { id: "usuarios.gestionar", label: "Gestionar usuarios y permisos" },
    ],
  },
  {
    label: "Documentación y avisos",
    perms: [
      { id: "documentos.ver", label: "Ver documentación de operadores y unidades" },
      { id: "documentos.editar", label: "Subir y editar documentos / archivos" },
      { id: "tipos_documento.gestionar", label: "Gestionar catálogo de tipos de documento" },
      { id: "notificaciones.ver", label: "Ver notificaciones de vencimientos" },
    ],
  },
  {
    label: "Empresa y marca",
    perms: [
      { id: "empresa.gestionar", label: "Editar datos básicos de la empresa" },
      { id: "marca.gestionar", label: "Editar logo y colores del tema" },
    ],
  },
];

const emptyUser: SystemUser = {
  id: "",
  nombre: "",
  email: "",
  role: "capturista",
  estatus: "activo",
  creado_en: new Date().toISOString(),
};

export default function Usuarios() {
  const { systemUsers, roles, upsertSystemUser, toggleSystemUserStatus, updateRolePermissions } = useTlo();
  const { hasPermission } = useAuth();
  const isAdmin = hasPermission("usuarios.gestionar");

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<SystemUser>(emptyUser);
  const [userPw, setUserPw] = useState("");
  const [userPw2, setUserPw2] = useState("");

  const resetPasswordFields = () => {
    setUserPw("");
    setUserPw2("");
  };

  const save = async () => {
    if (!form.nombre.trim() || !form.email.trim()) {
      toast.error("Nombre y correo son obligatorios");
      return;
    }
    if (!form.id) {
      if (userPw.length < 6) {
        toast.error("La contraseña debe tener al menos 6 caracteres");
        return;
      }
      if (userPw !== userPw2) {
        toast.error("Las contraseñas no coinciden");
        return;
      }
    } else if (userPw.length > 0 || userPw2.length > 0) {
      if (userPw.length < 6) {
        toast.error("La contraseña debe tener al menos 6 caracteres");
        return;
      }
      if (userPw !== userPw2) {
        toast.error("Las contraseñas no coinciden");
        return;
      }
    }
    try {
      const pass = form.id ? (userPw.length > 0 ? userPw : undefined) : userPw;
      await upsertSystemUser(form, pass);
      toast.success(form.id ? "Usuario actualizado" : "Usuario creado");
      resetPasswordFields();
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar el usuario");
    }
  };

  const togglePerm = (role: UserRole, perm: Permission, checked: boolean) => {
    const r = roles.find(x => x.role === role);
    if (!r) return;
    const next = checked ? [...new Set([...r.permisos, perm])] : r.permisos.filter(p => p !== perm);
    updateRolePermissions(role, next);
  };

  return (
    <div className="space-y-4">
      {!isAdmin && (
        <Card className="p-4 border-destructive/40 bg-destructive/5 flex items-center gap-3">
          <Lock className="h-5 w-5 text-destructive" />
          <div className="text-sm">
            <div className="font-medium">Acceso restringido</div>
            <div className="text-muted-foreground">Solo los administradores pueden modificar usuarios y permisos. Estás en modo lectura.</div>
          </div>
        </Card>
      )}

      <Tabs defaultValue="usuarios" className="space-y-4">
        <TabsList>
          <TabsTrigger value="usuarios"><UserCog className="h-4 w-4 mr-2" /> Usuarios</TabsTrigger>
          <TabsTrigger value="roles"><ShieldCheck className="h-4 w-4 mr-2" /> Roles y permisos</TabsTrigger>
        </TabsList>

        <TabsContent value="usuarios" className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">{systemUsers.length} usuarios del sistema</p>
            <Button
              disabled={!isAdmin}
              onClick={() => {
                setForm({ ...emptyUser, id: "", creado_en: new Date().toISOString() });
                resetPasswordFields();
                setOpen(true);
              }}
              className="bg-primary text-primary-foreground hover:bg-primary-glow"
            >
              <Plus className="h-4 w-4 mr-2" /> Nuevo usuario
            </Button>
          </div>

          <Card className="tlo-shadow-md overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-secondary/50">
                  <TableHead>Usuario</TableHead>
                  <TableHead>Correo</TableHead>
                  <TableHead>Rol</TableHead>
                  <TableHead>Último acceso</TableHead>
                  <TableHead>Creado</TableHead>
                  <TableHead>Estatus</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {systemUsers.map(u => (
                  <TableRow key={u.id} className="hover:bg-muted/30">
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-full bg-primary/10 text-primary flex items-center justify-center font-semibold text-sm">
                          {u.nombre.split(" ").map(n => n[0]).slice(0,2).join("")}
                        </div>
                        <span className="font-medium">{u.nombre}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground flex items-center gap-1.5">
                      <Mail className="h-3.5 w-3.5" /> {u.email}
                    </TableCell>
                    <TableCell>
                      {u.role === "admin" ? (
                        <Badge className="bg-primary/15 text-primary border-primary/30 hover:bg-primary/15">
                          <ShieldCheck className="h-3 w-3 mr-1" /> Administrador
                        </Badge>
                      ) : (
                        <Badge variant="secondary">
                          <UserCog className="h-3 w-3 mr-1" /> Capturista
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">{u.ultimo_acceso ? fmtDate(u.ultimo_acceso) : "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{fmtDate(u.creado_en)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={u.estatus === "activo"}
                          disabled={!isAdmin}
                          onCheckedChange={() => { toggleSystemUserStatus(u.id); toast.success("Estatus actualizado"); }}
                        />
                        <span className="text-xs text-muted-foreground capitalize">{u.estatus}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={!isAdmin}
                        onClick={() => {
                          setForm(u);
                          resetPasswordFields();
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
        </TabsContent>

        <TabsContent value="roles" className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            {roles.map(r => (
              <Card key={r.role} className="tlo-shadow-md p-5 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      {r.role === "admin"
                        ? <ShieldCheck className="h-5 w-5 text-primary" />
                        : <ShieldAlert className="h-5 w-5 text-muted-foreground" />}
                      <h3 className="font-semibold text-base">{r.nombre}</h3>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">{r.descripcion}</p>
                  </div>
                  <Badge variant="outline">{r.permisos.length} permisos</Badge>
                </div>

                <div className="space-y-4 pt-2 border-t">
                  {PERMISSION_GROUPS.map(g => (
                    <div key={g.label}>
                      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                        {g.label}
                      </div>
                      <div className="space-y-2">
                        {g.perms.map(p => {
                          const checked = r.permisos.includes(p.id);
                          return (
                            <label key={p.id} className="flex items-start gap-2.5 text-sm cursor-pointer">
                              <Checkbox
                                checked={checked}
                                disabled={!isAdmin || r.role === "admin"}
                                onCheckedChange={(v) => togglePerm(r.role, p.id, !!v)}
                                className="mt-0.5"
                              />
                              <span className={checked ? "" : "text-muted-foreground"}>{p.label}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>

                {r.role === "admin" && (
                  <p className="text-xs text-muted-foreground italic border-t pt-3">
                    El rol Administrador siempre conserva todos los permisos del sistema.
                  </p>
                )}
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      <Dialog
        open={open}
        onOpenChange={o => {
          setOpen(o);
          if (!o) resetPasswordFields();
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{form.id ? "Editar usuario" : "Nuevo usuario"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Nombre completo</Label><Input value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} /></div>
            <div><Label>Correo electrónico</Label><Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
            <div>
              <Label>Rol</Label>
              <Select value={form.role} onValueChange={(v: UserRole) => setForm({ ...form, role: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Administrador</SelectItem>
                  <SelectItem value="capturista">Capturista</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {!form.id ? (
              <>
                <div>
                  <Label htmlFor="user-pw">Contraseña</Label>
                  <Input
                    id="user-pw"
                    type="password"
                    autoComplete="new-password"
                    value={userPw}
                    onChange={e => setUserPw(e.target.value)}
                    placeholder="Mínimo 6 caracteres"
                  />
                </div>
                <div>
                  <Label htmlFor="user-pw2">Confirmar contraseña</Label>
                  <Input
                    id="user-pw2"
                    type="password"
                    autoComplete="new-password"
                    value={userPw2}
                    onChange={e => setUserPw2(e.target.value)}
                  />
                </div>
              </>
            ) : (
              <>
                <div className="text-xs text-muted-foreground border-t pt-3">Cambiar contraseña (opcional)</div>
                <div>
                  <Label htmlFor="user-pw-edit">Nueva contraseña</Label>
                  <Input
                    id="user-pw-edit"
                    type="password"
                    autoComplete="new-password"
                    value={userPw}
                    onChange={e => setUserPw(e.target.value)}
                    placeholder="Dejar vacío para no cambiar"
                  />
                </div>
                <div>
                  <Label htmlFor="user-pw2-edit">Confirmar</Label>
                  <Input
                    id="user-pw2-edit"
                    type="password"
                    autoComplete="new-password"
                    value={userPw2}
                    onChange={e => setUserPw2(e.target.value)}
                  />
                </div>
              </>
            )}
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
