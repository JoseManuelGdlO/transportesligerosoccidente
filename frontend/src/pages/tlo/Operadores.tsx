import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useTlo } from "@/context/TloContext";
import { useAuth } from "@/context/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { hasApiConfigured } from "@/lib/api";
import { fetchDrivers } from "@/lib/tloApi";
import type { Driver, CommissionType, DriverStatus } from "@/types/tlo";
import {
  slicePage,
  driverMatchesComisionFilter,
  driverMatchesSearch,
  type DriverComisionFilter,
} from "@/lib/tableFilters";
import { toast } from "sonner";

type EstatusFilter = "activo" | "inactivo" | "todos";

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
  const { drivers: catalogDrivers, upsertDriver, deleteDriver, trucks, reloadCatalog } = useTlo();
  const { permissions, hasApiSession } = useAuth();
  const apiLive = hasApiConfigured() && hasApiSession;
  const canEditAccount = permissions.includes("liquidaciones.cerrar");
  const canViewAccount = permissions.includes("liquidaciones.ver") || canEditAccount;
  const [sheetOpen, setSheetOpen] = useState(false);
  const [form, setForm] = useState<Driver>(empty);
  const [formBaselineEstatus, setFormBaselineEstatus] = useState<DriverStatus>("activo");
  const [tab, setTab] = useState("datos");
  const [sp, setSp] = useSearchParams();
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [motivoBajaDraft, setMotivoBajaDraft] = useState("");
  const [pendingReactivate, setPendingReactivate] = useState(false);
  const [search, setSearch] = useState("");
  const [comisionFilter, setComisionFilter] = useState<DriverComisionFilter>("todos");
  const [estatusFilter, setEstatusFilter] = useState<EstatusFilter>("activo");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [listDrivers, setListDrivers] = useState<Driver[]>([]);
  const [listLoading, setListLoading] = useState(false);

  const refreshList = useCallback(async () => {
    if (!apiLive) {
      setListDrivers(catalogDrivers);
      return;
    }
    setListLoading(true);
    try {
      const rows = await fetchDrivers(estatusFilter);
      setListDrivers(rows);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al cargar operadores");
    } finally {
      setListLoading(false);
    }
  }, [apiLive, estatusFilter, catalogDrivers]);

  useEffect(() => {
    void refreshList();
  }, [refreshList]);

  useEffect(() => {
    setPage(1);
  }, [search, comisionFilter, estatusFilter]);

  const filteredDrivers = useMemo(() => {
    let rows = listDrivers;
    if (!apiLive) {
      if (estatusFilter === "activo") rows = rows.filter((d) => d.estatus === "activo");
      else if (estatusFilter === "inactivo") rows = rows.filter((d) => d.estatus === "inactivo");
    }
    return rows
      .filter((d) => driverMatchesComisionFilter(d, comisionFilter))
      .filter((d) => driverMatchesSearch(d, search));
  }, [listDrivers, apiLive, estatusFilter, comisionFilter, search]);

  const pageData = useMemo(() => slicePage(filteredDrivers, page, pageSize), [filteredDrivers, page, pageSize]);
  const showMotivoColumn = estatusFilter !== "activo";

  useEffect(() => {
    if (pageData.safePage !== page) setPage(pageData.safePage);
  }, [pageData.safePage, page]);

  const openNew = () => {
    setForm({ ...empty, id: "" });
    setFormBaselineEstatus("activo");
    setTab("datos");
    setSheetOpen(true);
  };

  const openEdit = (d: Driver) => {
    setForm(d);
    setFormBaselineEstatus(d.estatus);
    setTab("datos");
    setSheetOpen(true);
  };

  useEffect(() => {
    const openId = sp.get("open");
    if (!openId) return;
    const tryOpen = async () => {
      let d = listDrivers.find((x) => x.id === openId) ?? catalogDrivers.find((x) => x.id === openId);
      if (!d && apiLive) {
        try {
          const all = await fetchDrivers("todos");
          d = all.find((x) => x.id === openId);
        } catch {
          /* ignore */
        }
      }
      if (d) {
        setForm(d);
        setFormBaselineEstatus(d.estatus);
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
    };
    void tryOpen();
  }, [listDrivers, catalogDrivers, sp, setSp, apiLive]);

  const pendingDeleteDriver = pendingDeleteId
    ? listDrivers.find((x) => x.id === pendingDeleteId) ?? catalogDrivers.find((x) => x.id === pendingDeleteId)
    : undefined;

  const runDelete = async () => {
    if (!pendingDeleteId) return;
    const motivo = motivoBajaDraft.trim();
    if (!motivo) {
      toast.error("Indica el motivo de baja");
      return;
    }
    try {
      await deleteDriver(pendingDeleteId, motivo);
      toast.success("Operador dado de baja");
      setPendingDeleteId(null);
      setMotivoBajaDraft("");
      setSheetOpen(false);
      await reloadCatalog();
      await refreshList();
    } catch {
      toast.error("No se pudo dar de baja al operador");
    }
  };

  const confirmReactivate = async () => {
    const next = { ...form, estatus: "activo" as const, fecha_baja: undefined };
    try {
      await upsertDriver(next);
      setForm(next);
      setFormBaselineEstatus("activo");
      setPendingReactivate(false);
      toast.success("Operador reactivado");
      await refreshList();
    } catch {
      toast.error("No se pudo reactivar el operador");
    }
  };

  const onEstatusChange = (v: DriverStatus) => {
    if (formBaselineEstatus === "inactivo" && v === "activo") {
      setPendingReactivate(true);
      return;
    }
    setForm({ ...form, estatus: v });
  };

  const save = async () => {
    if (form.estatus === "inactivo" && !(form.motivo_baja ?? "").trim()) {
      toast.error("Indica el motivo de baja");
      return;
    }
    try {
      await upsertDriver({
        ...form,
        motivo_baja: form.estatus === "inactivo" ? form.motivo_baja?.trim() : form.motivo_baja,
      });
      toast.success(form.id ? "Operador actualizado" : "Operador registrado");
      setSheetOpen(false);
      await refreshList();
    } catch {
      toast.error("No se pudo guardar el operador");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            Catálogo: <span className="text-foreground font-medium">{filteredDrivers.length}</span> operadores
            {listLoading ? " (cargando…)" : ""}
          </p>
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
        <div className="w-full sm:w-40">
          <Label className="text-xs text-muted-foreground">Estatus</Label>
          <Select value={estatusFilter} onValueChange={(v: EstatusFilter) => setEstatusFilter(v)}>
            <SelectTrigger aria-label="Filtrar por estatus">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="activo">Activos</SelectItem>
              <SelectItem value="inactivo">Inactivos</SelectItem>
              <SelectItem value="todos">Todos</SelectItem>
            </SelectContent>
          </Select>
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
              {showMotivoColumn ? <TableHead>Motivo de baja</TableHead> : null}
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageData.slice.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={showMotivoColumn ? 8 : 7}
                  className="text-center text-muted-foreground py-8"
                >
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
                  {showMotivoColumn ? (
                    <TableCell className="text-sm max-w-[14rem] truncate" title={d.motivo_baja}>
                      {d.estatus === "inactivo" ? d.motivo_baja || "—" : "—"}
                    </TableCell>
                  ) : null}
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(d)} aria-label="Editar">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    {d.estatus === "activo" ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        aria-label="Dar de baja"
                        onClick={() => {
                          setMotivoBajaDraft("");
                          setPendingDeleteId(d.id);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    ) : null}
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
                  <Select value={form.estatus} onValueChange={(v: DriverStatus) => onEstatusChange(v)}>
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
              {form.estatus === "inactivo" ? (
                <div className="space-y-2">
                  <Label htmlFor="motivo-baja-form">Motivo de baja</Label>
                  <Textarea
                    id="motivo-baja-form"
                    value={form.motivo_baja ?? ""}
                    onChange={(e) => setForm({ ...form, motivo_baja: e.target.value })}
                    placeholder="Describe por qué se da de baja al operador"
                    rows={3}
                  />
                  {form.fecha_baja ? (
                    <p className="text-xs text-muted-foreground">
                      Fecha de baja: {fmtDate(form.fecha_baja)}
                    </p>
                  ) : null}
                </div>
              ) : null}
              <Button
                onClick={() => void save()}
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

          {form.id && form.estatus === "activo" ? (
            <div className="mt-6 pt-4 border-t">
              <Button
                type="button"
                variant="outline"
                className="w-full border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => {
                  setMotivoBajaDraft(form.motivo_baja ?? "");
                  setPendingDeleteId(form.id);
                }}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Dar de baja operador
              </Button>
              <p className="text-xs text-muted-foreground mt-2 text-center">
                Marca al operador como inactivo; no se borran viajes ni documentos del historial.
              </p>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>

      <AlertDialog
        open={pendingDeleteId !== null}
        onOpenChange={(o) => {
          if (!o) {
            setPendingDeleteId(null);
            setMotivoBajaDraft("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Dar de baja operador</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm text-muted-foreground">
                {pendingDeleteDriver ? (
                  <p>
                    Se marcará como inactivo a <strong className="text-foreground">{pendingDeleteDriver.nombre}</strong>.
                    El registro permanece para conservar historial de viajes y documentación.
                  </p>
                ) : (
                  <p>¿Confirmas dar de baja a este operador?</p>
                )}
                <div className="space-y-2">
                  <Label htmlFor="motivo-baja-dialog" className="text-foreground">
                    Motivo de baja
                  </Label>
                  <Textarea
                    id="motivo-baja-dialog"
                    value={motivoBajaDraft}
                    onChange={(e) => setMotivoBajaDraft(e.target.value)}
                    placeholder="Obligatorio"
                    rows={3}
                  />
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={!motivoBajaDraft.trim()}
              onClick={() => void runDelete()}
            >
              Dar de baja
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={pendingReactivate} onOpenChange={(o) => !o && setPendingReactivate(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reactivar operador</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>Este operador fue desactivado por el siguiente motivo:</p>
                <p className="rounded-md border bg-muted/40 px-3 py-2 text-foreground whitespace-pre-wrap">
                  {form.motivo_baja?.trim() || "(Sin motivo registrado)"}
                </p>
                <p>¿Deseas activarlo nuevamente?</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <Button onClick={() => void confirmReactivate()}>Confirmar</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
