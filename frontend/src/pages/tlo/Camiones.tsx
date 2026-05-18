import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useTlo } from "@/context/TloContext";
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
import { TruckStatusBadge } from "@/components/tlo/StatusBadge";
import { DocumentManager } from "@/components/tlo/DocumentManager";
import { fmtMXN, fmtNumber } from "@/lib/format";
import type { Truck, TruckStatus } from "@/types/tlo";
import {
  slicePage,
  truckMatchesEstatusFilter,
  truckMatchesSearch,
  type TruckEstatusFilter,
} from "@/lib/tableFilters";
import { toast } from "sonner";

const empty: Truck = {
  id: "",
  numero_economico: "",
  placas: "",
  folio_tag: "",
  marca: "",
  modelo: "",
  anio: new Date().getFullYear(),
  rendimiento_esperado: 3,
  costo_km_ref: 18,
  estatus: "activo",
};

export default function Camiones() {
  const { trucks, upsertTruck, deleteTruck } = useTlo();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [form, setForm] = useState<Truck>(empty);
  const [tab, setTab] = useState("datos");
  const [sp, setSp] = useSearchParams();
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [estatusFilter, setEstatusFilter] = useState<TruckEstatusFilter>("todos");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  useEffect(() => {
    setPage(1);
  }, [search, estatusFilter]);

  const filteredTrucks = useMemo(
    () =>
      trucks
        .filter((t) => truckMatchesEstatusFilter(t, estatusFilter))
        .filter((t) => truckMatchesSearch(t, search)),
    [trucks, estatusFilter, search],
  );

  const pageData = useMemo(() => slicePage(filteredTrucks, page, pageSize), [filteredTrucks, page, pageSize]);

  useEffect(() => {
    if (pageData.safePage !== page) setPage(pageData.safePage);
  }, [pageData.safePage, page]);

  const openNew = () => {
    setForm({ ...empty, id: "" });
    setTab("datos");
    setSheetOpen(true);
  };

  const openEdit = (t: Truck) => {
    setForm(t);
    setTab("datos");
    setSheetOpen(true);
  };

  const save = () => {
    upsertTruck(form);
    toast.success(form.id ? "Camión actualizado" : "Camión registrado");
    setSheetOpen(false);
  };

  useEffect(() => {
    const openId = sp.get("open");
    if (!openId || trucks.length === 0) return;
    const t = trucks.find((x) => x.id === openId);
    if (t) {
      setForm(t);
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
  }, [trucks, sp, setSp]);

  const pendingDeleteTruck = pendingDeleteId ? trucks.find((x) => x.id === pendingDeleteId) : undefined;

  const runDelete = async () => {
    if (!pendingDeleteId) return;
    try {
      await deleteTruck(pendingDeleteId);
      toast.success("Unidad dada de baja");
      setPendingDeleteId(null);
      setSheetOpen(false);
    } catch {
      toast.error("No se pudo dar de baja la unidad");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            Flota: <span className="text-foreground font-medium">{trucks.length}</span> unidades en catálogo
          </p>
          {filteredTrucks.length !== trucks.length || search || estatusFilter !== "todos" ? (
            <p className="text-xs text-muted-foreground">
              Coincidencias: {filteredTrucks.length}
              {filteredTrucks.length !== trucks.length ? ` (filtrado desde ${trucks.length})` : ""}
            </p>
          ) : null}
        </div>
        <Button onClick={openNew} className="bg-primary text-primary-foreground hover:bg-primary-glow shrink-0">
          <Plus className="h-4 w-4 mr-2" /> Nuevo camión
        </Button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="flex-1 min-w-[200px]">
          <Label htmlFor="camiones-buscar" className="sr-only">
            Buscar unidades
          </Label>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="camiones-buscar"
              placeholder="Buscar por económico, placas, marca, modelo, año…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              aria-label="Buscar unidades"
            />
          </div>
        </div>
        <div className="w-full sm:w-44">
          <Label className="text-xs text-muted-foreground">Estatus</Label>
          <Select
            value={estatusFilter}
            onValueChange={(v: TruckEstatusFilter) => setEstatusFilter(v)}
          >
            <SelectTrigger aria-label="Filtrar por estatus">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="activo">Activo</SelectItem>
              <SelectItem value="taller">En taller</SelectItem>
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
            {pageData.slice.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                  Sin resultados con los filtros actuales.
                </TableCell>
              </TableRow>
            ) : (
              pageData.slice.map((t) => (
                <TableRow key={t.id} className="hover:bg-muted/30">
                  <TableCell className="font-mono font-semibold">{t.numero_economico}</TableCell>
                  <TableCell className="font-mono">{t.placas}</TableCell>
                  <TableCell>
                    {t.marca} {t.modelo}
                  </TableCell>
                  <TableCell className="text-right">{t.anio}</TableCell>
                  <TableCell className="text-right">{fmtNumber(t.rendimiento_esperado, 1)} km/l</TableCell>
                  <TableCell className="text-right">{fmtMXN(t.costo_km_ref)}</TableCell>
                  <TableCell>
                    <TruckStatusBadge status={t.estatus} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(t)} aria-label="Editar">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      aria-label="Dar de baja"
                      onClick={() => setPendingDeleteId(t.id)}
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

      {filteredTrucks.length > 0 ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between text-sm text-muted-foreground">
          <p>
            Mostrando{" "}
            <span className="text-foreground font-medium">
              {pageData.rangeStart}–{pageData.rangeEnd}
            </span>{" "}
            de <span className="text-foreground font-medium">{pageData.total}</span>
            {pageData.total !== trucks.length ? (
              <span className="text-muted-foreground"> (catálogo: {trucks.length})</span>
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
            <SheetTitle>{form.id ? "Editar camión" : "Nuevo camión"}</SheetTitle>
            <SheetDescription>
              {form.id ? (
                <>Unidad, rendimiento y documentación (circulación, pólizas, galería).</>
              ) : (
                <>
                  Primero registra los datos de la unidad con <strong className="text-foreground">Guardar datos</strong>.
                  Los archivos se vinculan a un camión ya creado en el sistema; por eso la pestaña Documentación se activa
                  después del primer guardado.
                </>
              )}
            </SheetDescription>
          </SheetHeader>

          <Tabs value={tab} onValueChange={setTab} className="mt-4">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="datos">Datos</TabsTrigger>
              <TabsTrigger
                value="documentacion"
                disabled={!form.id}
                title={
                  form.id
                    ? undefined
                    : "Disponible después de guardar: se necesita la unidad registrada para adjuntar documentos."
                }
              >
                Documentación
              </TabsTrigger>
            </TabsList>
            {!form.id ? (
              <p className="text-xs text-muted-foreground mt-2 rounded-md border border-dashed bg-muted/30 px-3 py-2">
                <strong className="font-medium text-foreground">¿Por qué está deshabilitada?</strong> Aún no existe la
                unidad en el sistema. Al guardar los datos se asigna un registro y ya podrás subir tarjetas de
                circulación, pólizas y demás documentación asociada a ese camión.
              </p>
            ) : null}
            <TabsContent value="datos" className="space-y-3 pt-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>No. económico</Label>
                  <Input
                    value={form.numero_economico}
                    onChange={(e) => setForm({ ...form, numero_economico: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Placas</Label>
                  <Input value={form.placas} onChange={(e) => setForm({ ...form, placas: e.target.value })} />
                </div>
                <div>
                  <Label>Folio TAG</Label>
                  <Input
                    value={form.folio_tag ?? ""}
                    onChange={(e) => setForm({ ...form, folio_tag: e.target.value })}
                    placeholder="ID proveedor combustible"
                  />
                </div>
                <div>
                  <Label>Marca</Label>
                  <Input value={form.marca} onChange={(e) => setForm({ ...form, marca: e.target.value })} />
                </div>
                <div>
                  <Label>Modelo</Label>
                  <Input value={form.modelo} onChange={(e) => setForm({ ...form, modelo: e.target.value })} />
                </div>
                <div>
                  <Label>Año</Label>
                  <Input
                    type="number"
                    value={form.anio}
                    onChange={(e) => setForm({ ...form, anio: +e.target.value })}
                  />
                </div>
                <div>
                  <Label>Rendimiento (km/l)</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={form.rendimiento_esperado}
                    onChange={(e) => setForm({ ...form, rendimiento_esperado: +e.target.value })}
                  />
                </div>
                <div>
                  <Label>Costo/km referencia</Label>
                  <Input
                    type="number"
                    step="0.5"
                    value={form.costo_km_ref}
                    onChange={(e) => setForm({ ...form, costo_km_ref: +e.target.value })}
                  />
                </div>
                <div>
                  <Label>Estatus</Label>
                  <Select
                    value={form.estatus}
                    onValueChange={(v: TruckStatus) => setForm({ ...form, estatus: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="activo">Activo</SelectItem>
                      <SelectItem value="taller">En taller</SelectItem>
                      <SelectItem value="baja">Baja</SelectItem>
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
              <DocumentManager kind="truck" entityId={form.id || null} />
            </TabsContent>
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
                Dar de baja unidad
              </Button>
              <p className="text-xs text-muted-foreground mt-2 text-center">
                La unidad deja de mostrarse en el catálogo; no se borran viajes ni documentos del historial.
              </p>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>

      <AlertDialog open={pendingDeleteId !== null} onOpenChange={(o) => !o && setPendingDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Dar de baja unidad</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDeleteTruck ? (
                <>
                  Se marcará como baja <strong className="font-mono">{pendingDeleteTruck.numero_economico}</strong> (
                  {pendingDeleteTruck.placas}). El registro permanece en la base de datos para mantener historial y
                  documentación.
                </>
              ) : (
                "¿Confirmas dar de baja esta unidad?"
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
