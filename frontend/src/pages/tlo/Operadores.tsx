import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useTlo } from "@/context/TloContext";
import { useAuth } from "@/context/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ChevronLeft, ChevronRight, Plus, Pencil, Search, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DriverStatusBadge } from "@/components/tlo/StatusBadge";
import { DocumentManager } from "@/components/tlo/DocumentManager";
import { DocumentVigenciaSummary } from "@/components/tlo/DocumentVigenciaSummary";
import { DriverAccountPanel } from "@/components/tlo/DriverAccountPanel";
import { fmtDate, fmtMXN } from "@/lib/format";
import type { Driver, CommissionType, DriverStatus } from "@/types/tlo";
import {
  slicePage,
  driverMatchesComisionFilter,
  driverMatchesSearch,
  type DriverComisionFilter,
} from "@/lib/tableFilters";
import { toast } from "sonner";

const empty: Driver = {
  id: "",
  nombre: "",
  telefono: "",
  licencia: "",
  fecha_ingreso: new Date().toISOString().slice(0, 10),
  comision_tipo: "porcentaje",
  comision_valor: 8,
  comision_valor_local: 8,
  comision_valor_foraneo: 10,
  estatus: "activo",
};

export default function Operadores() {
  const { drivers, upsertDriver, deleteDriver, trucks } = useTlo();
  const { permissions } = useAuth();
  const canEditAccount = permissions.includes("liquidaciones.cerrar");
  const canViewAccount = permissions.includes("liquidaciones.ver") || canEditAccount;
  const [sheetOpen, setSheetOpen] = useState(false);
  const [form, setForm] = useState<Driver>(empty);
  const [tab, setTab] = useState("datos");
  const [sp, setSp] = useSearchParams();
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [comisionFilter, setComisionFilter] = useState<DriverComisionFilter>("todos");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  useEffect(() => {
    setPage(1);
  }, [search, comisionFilter]);

  const filteredDrivers = useMemo(
    () =>
      drivers
        .filter((d) => driverMatchesComisionFilter(d, comisionFilter))
        .filter((d) => driverMatchesSearch(d, search)),
    [drivers, comisionFilter, search],
  );

  const pageData = useMemo(() => slicePage(filteredDrivers, page, pageSize), [filteredDrivers, page, pageSize]);

  useEffect(() => {
    if (pageData.safePage !== page) setPage(pageData.safePage);
  }, [pageData.safePage, page]);

  const openNew = () => {
    setForm({ ...empty, id: "" });
    setTab("datos");
    setSheetOpen(true);
  };

  const openEdit = (d: Driver) => {
    setForm(d);
    setTab("datos");
    setSheetOpen(true);
  };

  useEffect(() => {
    const openId = sp.get("open");
    if (!openId || drivers.length === 0) return;
    const d = drivers.find((x) => x.id === openId);
    if (d) {
      setForm(d);
      setTab("documentacion");
      setSheetOpen(true);
      setSp(
        (prev) => {
          prev.delete("open");
          return prev;
        },
        { replace: true },
      );
    }
  }, [drivers, sp, setSp]);

  const pendingDeleteDriver = pendingDeleteId ? drivers.find((x) => x.id === pendingDeleteId) : undefined;

  const runDelete = async () => {
    if (!pendingDeleteId) return;
    try {
      await deleteDriver(pendingDeleteId);
      toast.success("Operador dado de baja");
      setPendingDeleteId(null);
      setSheetOpen(false);
    } catch {
      toast.error("No se pudo dar de baja al operador");
    }
  };

  const save = () => {
    upsertDriver(form);
    toast.success(form.id ? "Operador actualizado" : "Operador registrado");
    setSheetOpen(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            Catálogo: <span className="text-foreground font-medium">{drivers.length}</span> operadores activos
          </p>
          {filteredDrivers.length !== drivers.length || search || comisionFilter !== "todos" ? (
            <p className="text-xs text-muted-foreground">
              Coincidencias: {filteredDrivers.length}
              {filteredDrivers.length !== drivers.length ? ` (filtrado desde ${drivers.length})` : ""}
            </p>
          ) : null}
        </div>
        <Button
          onClick={openNew}
          className="bg-primary text-primary-foreground hover:bg-primary-glow shrink-0"
        >
          <Plus className="h-4 w-4 mr-2" /> Nuevo operador
        </Button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="flex-1 min-w-[200px]">
          <Label htmlFor="operadores-buscar" className="sr-only">
            Buscar operadores
          </Label>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="operadores-buscar"
              placeholder="Buscar por nombre, teléfono o licencia…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              aria-label="Buscar operadores"
            />
          </div>
        </div>
        <div className="w-full sm:w-48">
          <Label className="text-xs text-muted-foreground">Tipo de comisión</Label>
          <Select
            value={comisionFilter}
            onValueChange={(v: DriverComisionFilter) => setComisionFilter(v)}
          >
            <SelectTrigger aria-label="Filtrar por tipo de comisión">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="porcentaje">Porcentaje</SelectItem>
              <SelectItem value="fijo">Monto fijo</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="w-full sm:w-36">
          <Label className="text-xs text-muted-foreground">Por página</Label>
          <Select
            value={String(pageSize)}
            onValueChange={(v) => {
              setPageSize(Number(v));
              setPage(1);
            }}
          >
            <SelectTrigger aria-label="Filas por página">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="10">10</SelectItem>
              <SelectItem value="20">20</SelectItem>
              <SelectItem value="50">50</SelectItem>
            </SelectContent>
          </Select>
        </div>
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
            {pageData.slice.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                  Sin resultados con los filtros actuales.
                </TableCell>
              </TableRow>
            ) : (
              pageData.slice.map((d) => (
                <TableRow key={d.id} className="hover:bg-muted/30">
                  <TableCell className="font-medium">{d.nombre}</TableCell>
                  <TableCell className="font-mono text-sm">{d.telefono}</TableCell>
                  <TableCell className="font-mono text-sm">{d.licencia}</TableCell>
                  <TableCell className="text-sm">{fmtDate(d.fecha_ingreso)}</TableCell>
                  <TableCell className="text-sm">
                    {d.comision_tipo === "porcentaje"
                      ? `Local ${d.comision_valor_local}% · Foráneo ${d.comision_valor_foraneo}%`
                      : `Local ${fmtMXN(d.comision_valor_local)} · Foráneo ${fmtMXN(d.comision_valor_foraneo)}`}
                  </TableCell>
                  <TableCell>
                    <DriverStatusBadge status={d.estatus} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(d)} aria-label="Editar">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      aria-label="Dar de baja"
                      onClick={() => setPendingDeleteId(d.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {filteredDrivers.length > 0 ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between text-sm text-muted-foreground">
          <p>
            Mostrando{" "}
            <span className="text-foreground font-medium">
              {pageData.rangeStart}–{pageData.rangeEnd}
            </span>{" "}
            de <span className="text-foreground font-medium">{pageData.total}</span>
            {pageData.total !== drivers.length ? (
              <span className="text-muted-foreground"> (catálogo: {drivers.length})</span>
            ) : null}
          </p>
          <div className="flex items-center gap-2">
            <span className="text-xs whitespace-nowrap" aria-live="polite">
              Página {pageData.safePage} de {pageData.totalPages}
            </span>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-1 px-2"
                disabled={pageData.safePage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                aria-label="Página anterior"
              >
                <ChevronLeft className="h-4 w-4" />
                <span className="hidden sm:inline">Anterior</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-1 px-2"
                disabled={pageData.safePage >= pageData.totalPages}
                onClick={() => setPage((p) => p + 1)}
                aria-label="Página siguiente"
              >
                <span className="hidden sm:inline">Siguiente</span>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{form.id ? "Editar operador" : "Nuevo operador"}</SheetTitle>
            <SheetDescription>
              {form.id ? (
                <>Datos generales, documentación y cuenta corriente del operador.</>
              ) : (
                <>
                  Primero registra al operador con <strong className="text-foreground">Guardar datos</strong>. Los
                  archivos se asocian a una persona ya registrada en el sistema; por eso la pestaña Documentación se
                  activa después del primer guardado.
                </>
              )}
            </SheetDescription>
          </SheetHeader>

          <Tabs value={tab} onValueChange={setTab} className="mt-4">
            <TabsList className={`grid w-full ${canViewAccount ? "grid-cols-3" : "grid-cols-2"}`}>
              <TabsTrigger value="datos">Datos</TabsTrigger>
              <TabsTrigger
                value="documentacion"
                disabled={!form.id}
                title={
                  form.id
                    ? undefined
                    : "Disponible después de guardar: se necesita el operador registrado para adjuntar documentos."
                }
              >
                Documentación
              </TabsTrigger>
              {canViewAccount ? (
                <TabsTrigger
                  value="cuenta"
                  disabled={!form.id}
                  title={form.id ? undefined : "Disponible después de guardar el operador."}
                >
                  Cuenta
                </TabsTrigger>
              ) : null}
            </TabsList>
            {!form.id ? (
              <p className="text-xs text-muted-foreground mt-2 rounded-md border border-dashed bg-muted/30 px-3 py-2">
                <strong className="font-medium text-foreground">¿Por qué está deshabilitada?</strong> Aún no existe el
                operador en el sistema. Al guardar los datos se crea el registro y ya podrás subir INE, licencia, carta
                de antecedentes y el resto de documentación obligatoria.
              </p>
            ) : null}
            <TabsContent value="datos" className="space-y-3 pt-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Label>Nombre completo</Label>
                  <Input
                    value={form.nombre}
                    onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Teléfono</Label>
                  <Input
                    value={form.telefono}
                    onChange={(e) => setForm({ ...form, telefono: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Licencia</Label>
                  <Input
                    value={form.licencia}
                    onChange={(e) => setForm({ ...form, licencia: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Fecha de ingreso</Label>
                  <Input
                    type="date"
                    value={form.fecha_ingreso.slice(0, 10)}
                    onChange={(e) => setForm({ ...form, fecha_ingreso: e.target.value })}
                  />
                </div>
              </div>
              <div className="rounded-md border border-dashed p-3 space-y-3">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Carta Porte SAT</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>RFC</Label>
                    <Input
                      value={form.rfc ?? ""}
                      onChange={(e) => setForm({ ...form, rfc: e.target.value })}
                      placeholder="XAXX010101000"
                    />
                  </div>
                  <div>
                    <Label>Licencia federal</Label>
                    <Input
                      value={form.licencia_federal ?? ""}
                      onChange={(e) => setForm({ ...form, licencia_federal: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Tipo de figura</Label>
                    <Select
                      value={form.tipo_figura ?? "01"}
                      onValueChange={(v) => setForm({ ...form, tipo_figura: v })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="01">01 — Operador</SelectItem>
                        <SelectItem value="02">02 — Propietario</SelectItem>
                        <SelectItem value="03">03 — Arrendador</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
              <div className="rounded-md border border-dashed p-3 space-y-3">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Control interno</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>CURP</Label>
                    <Input
                      value={form.curp ?? ""}
                      onChange={(e) => setForm({ ...form, curp: e.target.value.toUpperCase() })}
                      maxLength={18}
                    />
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
                    <Label>No. empleado</Label>
                    <Input
                      value={form.numero_empleado ?? ""}
                      onChange={(e) => setForm({ ...form, numero_empleado: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Puesto / categoría</Label>
                    <Input
                      value={form.puesto ?? ""}
                      onChange={(e) => setForm({ ...form, puesto: e.target.value })}
                    />
                  </div>
                  <div className="col-span-2">
                    <Label>Unidad asignada</Label>
                    <Select
                      value={form.truck_id ?? "none"}
                      onValueChange={(v) => setForm({ ...form, truck_id: v === "none" ? undefined : v })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Sin asignar" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sin asignar</SelectItem>
                        {trucks.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.numero_economico} — {t.placas}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
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
              {form.id ? <DocumentVigenciaSummary kind="driver" entityId={form.id} /> : null}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Tipo comisión</Label>
                  <Select
                    value={form.comision_tipo}
                    onValueChange={(v: CommissionType) => setForm({ ...form, comision_tipo: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="porcentaje">Porcentaje</SelectItem>
                      <SelectItem value="fijo">Monto fijo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>{form.comision_tipo === "porcentaje" ? "% local" : "Monto local MXN"}</Label>
                  <Input
                    type="number"
                    value={form.comision_valor_local}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        comision_valor_local: +e.target.value,
                        comision_valor: +e.target.value,
                      })
                    }
                  />
                </div>
                <div>
                  <Label>{form.comision_tipo === "porcentaje" ? "% foráneo" : "Monto foráneo MXN"}</Label>
                  <Input
                    type="number"
                    value={form.comision_valor_foraneo}
                    onChange={(e) => setForm({ ...form, comision_valor_foraneo: +e.target.value })}
                  />
                </div>
                <div>
                  <Label>Estatus</Label>
                  <Select
                    value={form.estatus}
                    onValueChange={(v: DriverStatus) => setForm({ ...form, estatus: v })}
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
              <Button
                onClick={save}
                className="w-full bg-primary text-primary-foreground hover:bg-primary-glow"
              >
                Guardar datos
              </Button>
            </TabsContent>
            <TabsContent value="documentacion" className="pt-4">
              <DocumentManager kind="driver" entityId={form.id || null} />
            </TabsContent>
            {canViewAccount ? (
              <TabsContent value="cuenta" className="pt-0">
                {form.id ? (
                  <DriverAccountPanel driverId={form.id} canEdit={canEditAccount} />
                ) : (
                  <p className="text-sm text-muted-foreground pt-4">Guarda el operador para gestionar su cuenta.</p>
                )}
              </TabsContent>
            ) : null}
          </Tabs>

          {form.id ? (
            <div className="mt-6 pt-4 border-t">
              <Button
                type="button"
                variant="outline"
                className="w-full border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => setPendingDeleteId(form.id)}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Dar de baja operador
              </Button>
              <p className="text-xs text-muted-foreground mt-2 text-center">
                Marca al operador como inactivo y lo oculta del listado; no se borran viajes ni documentos del historial.
              </p>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>

      <AlertDialog open={pendingDeleteId !== null} onOpenChange={(o) => !o && setPendingDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Dar de baja operador</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDeleteDriver ? (
                <>
                  Se marcará como inactivo a <strong>{pendingDeleteDriver.nombre}</strong>. El registro permanece en la
                  base de datos para conservar historial de viajes y documentación.
                </>
              ) : (
                "¿Confirmas dar de baja a este operador?"
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <Button variant="destructive" onClick={() => void runDelete()}>
              Dar de baja
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
