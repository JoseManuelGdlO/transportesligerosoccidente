import { useMemo, useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTlo } from "@/context/TloContext";
import { computeTrip, driverById, truckById, tripDriverNombre } from "@/lib/calc";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TripStatusesPicker, MarginBadge } from "@/components/tlo/StatusBadge";
import {
  TripParadasEditor,
  paradasToTripStops,
  type ParadaDraft,
} from "@/components/tlo/TripParadasEditor";
import { fmtMXN, fmtDate, fmtNumber, formatTripRoute, isoDay, startOfWeek, endOfWeek } from "@/lib/format";
import {
  fetchRoutes,
  fetchTruckLastKm,
  lastClosedKmFromTrips,
  fetchTripStatuses,
  createTripStatus,
  updateTripStatus,
  deleteTripStatus,
} from "@/lib/tloApi";
import { hasApiConfigured } from "@/lib/api";
import { FEATURE_CARTA_PORTE } from "@/config/features";
import { tripBeforeLastError } from "@/lib/tripOdometer";
import { slicePage } from "@/lib/tableFilters";
import type { RouteCatalog, Trip, TripStatusRef, TripType } from "@/types/tlo";
import {
  findStatusIdBySlug,
  tripHasStatusId,
  tripHasStatusSlug,
  tripIsClosed,
  tripIsLiquidated,
  tripIsProrated,
  tripIsTimbrado,
  TRIP_STATUS_COLOR_OPTIONS,
  SYSTEM_STATUS_CERRADO,
  SYSTEM_STATUS_EN_CURSO,
  assertNoOpenTripConflictLocal,
  openTripByTruckId,
  openTripByDriverId,
} from "@/lib/tripStatus";
import { useAuth } from "@/context/AuthContext";
import { Switch } from "@/components/ui/switch";
import {
  Plus,
  Search,
  ArrowRight,
  Tags,
  Pencil,
  Trash2,
  SlidersHorizontal,
  ChevronDown,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

const emptyParadas = (): ParadaDraft[] => [{ etiqueta: "" }, { etiqueta: "" }];

type NewTripForm = {
  truck_id: string;
  driver_id: string;
  client_id: string;
  num_factura: string;
  fecha_salida: string;
  km_inicial: number;
  tarifa: number;
  viaticos_entregados: number;
  tipo_viaje: TripType;
};

const defaultForm = (): NewTripForm => ({
  truck_id: "",
  driver_id: "",
  client_id: "",
  num_factura: "",
  fecha_salida: new Date().toISOString().slice(0, 16),
  km_inicial: 0,
  tarifa: 0,
  viaticos_entregados: 0,
  tipo_viaje: "local",
});

const emptyStatusForm = (): TripStatusRef => ({
  id: "",
  nombre: "",
  color: TRIP_STATUS_COLOR_OPTIONS[0].value,
  activo: true,
});

const MOCK_TRIP_STATUSES: TripStatusRef[] = [SYSTEM_STATUS_EN_CURSO, SYSTEM_STATUS_CERRADO];

const FILTER_TODOS = "todos";
/** Filtro por defecto: viajes en curso (slug hasta resolver el id del catálogo). */
const FILTER_EN_CURSO = "en_curso";
const FILTER_LIQUIDADO = "liquidado";
const FILTER_NO_LIQUIDADO = "no_liquidado";
const FILTER_PRORRATEADO = "prorrateado";
const FILTER_NO_PRORRATEADO = "no_prorrateado";
const FILTER_TIMBRADO = "timbrado";

const FILTERS_STORAGE_KEY = "tlo.viajes.filters";

type StoredFilters = {
  status?: string;
  driver?: string;
  truck?: string;
  client?: string;
  tipoViaje?: string;
  fechaDesde?: string;
  fechaHasta?: string;
};

function loadStoredFilters(): StoredFilters {
  try {
    const raw = localStorage.getItem(FILTERS_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredFilters) : {};
  } catch {
    return {};
  }
}

function tripMatchesStatusFilter(trip: Trip, filter: string): boolean {
  if (filter === FILTER_TODOS) return true;
  if (!filter || filter === FILTER_EN_CURSO) return tripHasStatusSlug(trip, "en_curso");
  if (filter === FILTER_LIQUIDADO) return tripIsLiquidated(trip);
  if (filter === FILTER_NO_LIQUIDADO) return !tripIsLiquidated(trip);
  if (filter === FILTER_PRORRATEADO) return tripIsProrated(trip);
  if (filter === FILTER_NO_PRORRATEADO) return !tripIsProrated(trip);
  if (filter === FILTER_TIMBRADO) return FEATURE_CARTA_PORTE && tripIsTimbrado(trip);
  return tripHasStatusId(trip, filter);
}

type SortColumn =
  | "folio"
  | "fecha"
  | "ruta"
  | "factura"
  | "operador"
  | "camion"
  | "tarifa"
  | "utilidad"
  | "margen"
  | "estado";

type SortDirection = "asc" | "desc";

type TripRow = { trip: Trip; fin: ReturnType<typeof computeTrip> };

function tripStatusSortLabel(trip: Trip): string {
  return (trip.statuses ?? [])
    .map((s) => s.nombre)
    .sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }))
    .join(", ");
}

function compareSortValues(
  a: string | number | null,
  b: string | number | null,
  direction: SortDirection,
): number {
  const aNull = a === null;
  const bNull = b === null;
  if (aNull && bNull) return 0;
  if (aNull) return 1;
  if (bNull) return -1;

  let cmp: number;
  if (typeof a === "number" && typeof b === "number") {
    cmp = a - b;
  } else {
    cmp = String(a).localeCompare(String(b), "es", { numeric: true, sensitivity: "base" });
  }
  return direction === "asc" ? cmp : -cmp;
}

function getTripRowSortValue(
  row: TripRow,
  column: SortColumn,
  drivers: Parameters<typeof driverById>[0],
  trucks: Parameters<typeof truckById>[0],
): string | number | null {
  const { trip, fin } = row;
  switch (column) {
    case "folio":
      return trip.folio;
    case "fecha":
      return new Date(trip.fecha_salida).getTime();
    case "ruta":
      return formatTripRoute(trip);
    case "factura":
      return trip.num_factura ?? "";
    case "operador": {
      const name = tripDriverNombre(trip, drivers);
      return name === "—" ? "" : name;
    }
    case "camion":
      return truckById(trucks, trip.truck_id)?.numero_economico ?? "";
    case "tarifa":
      return trip.tarifa;
    case "utilidad":
      return tripIsClosed(trip) ? fin.utilidad : null;
    case "margen":
      return tripIsClosed(trip) ? fin.margen_pct : null;
    case "estado":
      return tripStatusSortLabel(trip);
    default:
      return "";
  }
}

function SortableTableHead({
  label,
  column,
  activeColumn,
  direction,
  onSort,
  className,
}: {
  label: string;
  column: SortColumn;
  activeColumn: SortColumn | null;
  direction: SortDirection;
  onSort: (column: SortColumn) => void;
  className?: string;
}) {
  const active = activeColumn === column;
  const Icon = active ? (direction === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  const alignRight = className?.includes("text-right");

  return (
    <TableHead className={className}>
      <button
        type="button"
        onClick={() => onSort(column)}
        className={cn(
          "inline-flex items-center gap-1 font-medium hover:text-foreground",
          alignRight && "w-full justify-end",
        )}
      >
        {label}
        <Icon
          className={cn("h-3.5 w-3.5 shrink-0", !active && "text-muted-foreground opacity-60")}
        />
      </button>
    </TableHead>
  );
}

export default function Viajes() {
  const { trips, drivers, trucks, clients, createTrip, updateTrip, replaceTrip, catalogLoading } = useTlo();
  const { hasPermission } = useAuth();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const apiMode = hasApiConfigured();
  const canManageStatuses = hasPermission("catalogos.editar");

  const [storedFilters] = useState<StoredFilters>(loadStoredFilters);
  const [tripStatuses, setTripStatuses] = useState<TripStatusRef[]>(MOCK_TRIP_STATUSES);
  const [statusesReady, setStatusesReady] = useState(!apiMode);
  const [filterStatus, setFilterStatus] = useState<string>(storedFilters.status ?? FILTER_EN_CURSO);
  const [filterDriver, setFilterDriver] = useState<string>(storedFilters.driver ?? FILTER_TODOS);
  const [filterTruck, setFilterTruck] = useState<string>(storedFilters.truck ?? FILTER_TODOS);
  const [filterClient, setFilterClient] = useState<string>(storedFilters.client ?? FILTER_TODOS);
  const [filterTipoViaje, setFilterTipoViaje] = useState<string>(
    storedFilters.tipoViaje ?? FILTER_TODOS,
  );
  const [filterFechaDesde, setFilterFechaDesde] = useState(storedFilters.fechaDesde ?? "");
  const [filterFechaHasta, setFilterFechaHasta] = useState(storedFilters.fechaHasta ?? "");
  const [search, setSearch] = useState("");
  const [sortColumn, setSortColumn] = useState<SortColumn | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const toggleSort = useCallback((column: SortColumn) => {
    setSortColumn((prev) => {
      if (prev === column) {
        setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
        return column;
      }
      setSortDirection("asc");
      return column;
    });
  }, []);

  const [open, setOpen] = useState(false);
  const [beforeLastMessage, setBeforeLastMessage] = useState<string | null>(null);
  const [statusesOpen, setStatusesOpen] = useState(false);
  const [manageStatusesOpen, setManageStatusesOpen] = useState(false);
  const [statusForm, setStatusForm] = useState<TripStatusRef>(emptyStatusForm);
  const [statusesLoading, setStatusesLoading] = useState(false);
  const [catalogRoutes, setCatalogRoutes] = useState<RouteCatalog[]>([]);
  const [selectedRouteId, setSelectedRouteId] = useState<string>("__custom__");
  const [paradas, setParadas] = useState<ParadaDraft[]>(emptyParadas);
  const [form, setForm] = useState<NewTripForm>(defaultForm);
  const [kmLoading, setKmLoading] = useState(false);

  const openByTruck = useMemo(() => openTripByTruckId(trips), [trips]);
  const openByDriver = useMemo(() => openTripByDriverId(trips), [trips]);

  const loadTripStatuses = useCallback(async () => {
    if (apiMode) {
      setStatusesLoading(true);
      try {
        const rows = await fetchTripStatuses();
        setTripStatuses(rows);
      } catch {
        setTripStatuses(MOCK_TRIP_STATUSES);
      } finally {
        setStatusesLoading(false);
        setStatusesReady(true);
      }
    } else {
      setTripStatuses(MOCK_TRIP_STATUSES);
      setStatusesReady(true);
    }
  }, [apiMode]);

  useEffect(() => {
    void loadTripStatuses();
  }, [loadTripStatuses]);

  const activeStatuses = useMemo(
    () => tripStatuses.filter((s) => s.activo !== false),
    [tripStatuses],
  );

  const enCursoStatusId = useMemo(
    () => findStatusIdBySlug(activeStatuses, "en_curso"),
    [activeStatuses],
  );

  useEffect(() => {
    if (!statusesReady || !enCursoStatusId) return;
    if (
      filterStatus === FILTER_EN_CURSO ||
      filterStatus === SYSTEM_STATUS_EN_CURSO.id ||
      !filterStatus
    ) {
      setFilterStatus(enCursoStatusId);
      return;
    }
    if (
      filterStatus === FILTER_TODOS ||
      filterStatus === FILTER_LIQUIDADO ||
      filterStatus === FILTER_NO_LIQUIDADO ||
      filterStatus === FILTER_PRORRATEADO ||
      filterStatus === FILTER_NO_PRORRATEADO ||
      (filterStatus === FILTER_TIMBRADO && FEATURE_CARTA_PORTE)
    ) {
      return;
    }
    if (filterStatus === FILTER_TIMBRADO && !FEATURE_CARTA_PORTE) {
      setFilterStatus(enCursoStatusId);
      return;
    }
    const validIds = new Set(tripStatuses.map((s) => s.id));
    if (!validIds.has(filterStatus)) {
      setFilterStatus(enCursoStatusId);
    }
  }, [statusesReady, enCursoStatusId, filterStatus, tripStatuses]);

  const statusFilterSelectValue = useMemo(() => {
    if (filterStatus === FILTER_TODOS) return FILTER_TODOS;
    if (
      filterStatus === FILTER_LIQUIDADO ||
      filterStatus === FILTER_NO_LIQUIDADO ||
      filterStatus === FILTER_PRORRATEADO ||
      filterStatus === FILTER_NO_PRORRATEADO ||
      filterStatus === FILTER_TIMBRADO
    ) {
      return filterStatus;
    }
    if (filterStatus === FILTER_EN_CURSO || !filterStatus) {
      return enCursoStatusId ?? FILTER_EN_CURSO;
    }
    if (!activeStatuses.some((s) => s.id === filterStatus)) {
      return enCursoStatusId ?? FILTER_EN_CURSO;
    }
    return filterStatus;
  }, [filterStatus, activeStatuses, enCursoStatusId]);

  const loadRoutes = useCallback(async (clientId: string) => {
    if (!apiMode || !clientId) {
      setCatalogRoutes([]);
      return;
    }
    try {
      const rows = await fetchRoutes({ client_id: clientId, all: true });
      setCatalogRoutes(rows.filter((r) => r.estatus === "activo"));
    } catch {
      setCatalogRoutes([]);
    }
  }, [apiMode]);

  const openNewTripDialog = useCallback(() => {
    setParadas(emptyParadas());
    setSelectedRouteId("__custom__");
    setForm(defaultForm());
    setBeforeLastMessage(null);
    setOpen(true);
  }, []);

  useEffect(() => {
    if (params.get("nuevo")) {
      openNewTripDialog();
      params.delete("nuevo");
      setParams(params, { replace: true });
    }
  }, [params, setParams, openNewTripDialog]);

  useEffect(() => {
    if (form.client_id) void loadRoutes(form.client_id);
    else setCatalogRoutes([]);
  }, [form.client_id, loadRoutes]);

  // Ref para que el efecto de km no se re-ejecute (y pise ediciones manuales)
  // cuando la lista de viajes se refresca en segundo plano.
  const tripsRef = useRef(trips);
  tripsRef.current = trips;

  useEffect(() => {
    if (!form.truck_id) {
      setForm((f) => (f.km_inicial === 0 ? f : { ...f, km_inicial: 0 }));
      return;
    }
    let cancelled = false;
    setKmLoading(true);
    void (async () => {
      try {
        const km = apiMode
          ? await fetchTruckLastKm(form.truck_id)
          : lastClosedKmFromTrips(tripsRef.current, form.truck_id);
        if (!cancelled) {
          setForm((f) => ({ ...f, km_inicial: km ?? 0 }));
        }
      } catch (e) {
        if (!cancelled) {
          toast.error(
            e instanceof Error
              ? e.message
              : "No se pudo obtener el kilometraje anterior del camión",
          );
        }
      } finally {
        if (!cancelled) setKmLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [form.truck_id, apiMode]);

  const applyRoute = (routeId: string) => {
    setSelectedRouteId(routeId);
    if (routeId === "__custom__") return;
    const r = catalogRoutes.find((x) => x.id === routeId);
    if (!r) return;
    setParadas(
      r.paradas.map((p) => ({
        etiqueta: p.etiqueta,
        client_ubicacion_id: p.client_ubicacion_id,
      })),
    );
    if (r.tipo_viaje) setForm((f) => ({ ...f, tipo_viaje: r.tipo_viaje! }));
  };

  const handleTripStatusesUpdated = useCallback(
    (updated: Trip) => {
      if (apiMode) {
        replaceTrip(updated);
      } else {
        updateTrip(updated.id, { statuses: updated.statuses });
      }
    },
    [apiMode, updateTrip, replaceTrip],
  );

  const [filtersOpen, setFiltersOpen] = useState(false);

  const applyFiltroHoy = useCallback(() => {
    const d = isoDay(new Date());
    setFilterFechaDesde(d);
    setFilterFechaHasta(d);
  }, []);

  const applyFiltroSemanaActual = useCallback(() => {
    const today = new Date();
    setFilterFechaDesde(isoDay(startOfWeek(today)));
    setFilterFechaHasta(isoDay(endOfWeek(today)));
  }, []);

  const activeFiltersCount = useMemo(() => {
    const defaultStatus = enCursoStatusId ?? FILTER_EN_CURSO;
    let count = 0;
    if (filterStatus !== FILTER_TODOS && filterStatus !== defaultStatus) count++;
    if (filterClient !== FILTER_TODOS) count++;
    if (filterTipoViaje !== FILTER_TODOS) count++;
    if (filterFechaDesde || filterFechaHasta) count++;
    if (filterDriver !== FILTER_TODOS) count++;
    if (filterTruck !== FILTER_TODOS) count++;
    return count;
  }, [
    filterStatus,
    filterClient,
    filterTipoViaje,
    filterFechaDesde,
    filterFechaHasta,
    filterDriver,
    filterTruck,
    enCursoStatusId,
  ]);
  const hasActiveFilters = activeFiltersCount > 0;

  useEffect(() => {
    const stored: StoredFilters = {
      status: filterStatus,
      driver: filterDriver,
      truck: filterTruck,
      client: filterClient,
      tipoViaje: filterTipoViaje,
      fechaDesde: filterFechaDesde,
      fechaHasta: filterFechaHasta,
    };
    try {
      localStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(stored));
    } catch {
      // localStorage no disponible (p. ej. modo privado restringido)
    }
  }, [
    filterStatus,
    filterDriver,
    filterTruck,
    filterClient,
    filterTipoViaje,
    filterFechaDesde,
    filterFechaHasta,
  ]);

  const rows = useMemo(() => {
    return trips
      .filter((t) => tripMatchesStatusFilter(t, filterStatus))
      .filter((t) => filterClient === FILTER_TODOS || t.client_id === filterClient)
      .filter(
        (t) => filterTipoViaje === FILTER_TODOS || t.tipo_viaje === filterTipoViaje,
      )
      .filter((t) => {
        if (!filterFechaDesde && !filterFechaHasta) return true;
        const day = isoDay(new Date(t.fecha_salida));
        if (filterFechaDesde && day < filterFechaDesde) return false;
        if (filterFechaHasta && day > filterFechaHasta) return false;
        return true;
      })
      .filter((t) => filterDriver === FILTER_TODOS || t.driver_id === filterDriver)
      .filter((t) => filterTruck === FILTER_TODOS || t.truck_id === filterTruck)
      .filter((t) => {
        if (!search.trim()) return true;
        const s = search.toLowerCase();
        const ruta = formatTripRoute(t).toLowerCase();
        return (
          t.folio.toLowerCase().includes(s) ||
          t.origen.toLowerCase().includes(s) ||
          t.destino.toLowerCase().includes(s) ||
          ruta.includes(s)
        );
      })
      .map((t) => ({ trip: t, fin: computeTrip(t, driverById(drivers, t.driver_id)) }));
  }, [
    trips,
    drivers,
    filterStatus,
    filterClient,
    filterTipoViaje,
    filterFechaDesde,
    filterFechaHasta,
    filterDriver,
    filterTruck,
    search,
  ]);

  const sortedRows = useMemo(() => {
    if (!sortColumn) return rows;
    return [...rows].sort((a, b) => {
      const va = getTripRowSortValue(a, sortColumn, drivers, trucks);
      const vb = getTripRowSortValue(b, sortColumn, drivers, trucks);
      return compareSortValues(va, vb, sortDirection);
    });
  }, [rows, sortColumn, sortDirection, drivers, trucks]);

  useEffect(() => {
    setPage(1);
  }, [
    search,
    filterStatus,
    filterClient,
    filterTipoViaje,
    filterFechaDesde,
    filterFechaHasta,
    filterDriver,
    filterTruck,
    pageSize,
  ]);

  const pageData = useMemo(
    () => slicePage(sortedRows, page, pageSize),
    [sortedRows, page, pageSize],
  );

  useEffect(() => {
    if (pageData.safePage !== page) setPage(pageData.safePage);
  }, [pageData.safePage, page]);

  const submit = async () => {
    if (!form.truck_id || !form.driver_id || !form.client_id) {
      toast.error("Selecciona camión, operador y cliente");
      return;
    }
    const validParadas = paradas.filter((p) => p.etiqueta.trim());
    if (validParadas.length < 2) {
      toast.error("Indica al menos 2 paradas en la ruta");
      return;
    }
    const fechaSalidaIso = new Date(form.fecha_salida).toISOString();
    const beforeLast = tripBeforeLastError(trips, {
      truckId: form.truck_id,
      fechaSalida: fechaSalidaIso,
    });
    if (beforeLast) {
      setBeforeLastMessage(beforeLast);
      return;
    }
    const stops = paradasToTripStops(validParadas);
    try {
      assertNoOpenTripConflictLocal(
        trips,
        { truck_id: form.truck_id, driver_id: form.driver_id },
        { trucks, drivers },
      );
      const t = await createTrip({
        truck_id: form.truck_id,
        driver_id: form.driver_id,
        client_id: form.client_id,
        origen: stops[0].etiqueta,
        destino: stops[stops.length - 1].etiqueta,
        paradas: stops,
        route_id: selectedRouteId !== "__custom__" ? selectedRouteId : undefined,
        num_factura: form.num_factura.trim() || undefined,
        fecha_salida: fechaSalidaIso,
        km_inicial: +form.km_inicial,
        tarifa: +form.tarifa,
        viaticos_entregados: +form.viaticos_entregados,
        tipo_viaje: form.tipo_viaje,
      });
      toast.success(`Viaje ${t.folio} abierto`);
      setOpen(false);
      nav(`/viajes/${t.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo crear el viaje");
    }
  };

  const openNewStatus = () => {
    setStatusForm(emptyStatusForm());
    setStatusesOpen(true);
  };

  const openEditStatus = (row: TripStatusRef) => {
    setStatusForm({ ...row });
    setStatusesOpen(true);
  };

  const saveStatus = async () => {
    if (!statusForm.nombre.trim()) {
      toast.error("El nombre es obligatorio");
      return;
    }
    try {
      if (apiMode && canManageStatuses) {
        if (statusForm.id) {
          await updateTripStatus(statusForm.id, {
            nombre: statusForm.nombre,
            color: statusForm.color,
            activo: statusForm.activo,
          });
          toast.success("Estado actualizado");
        } else {
          await createTripStatus({
            nombre: statusForm.nombre.trim(),
            color: statusForm.color,
            activo: statusForm.activo,
          });
          toast.success("Estado creado");
        }
        setStatusesOpen(false);
        await loadTripStatuses();
        return;
      }
      if (!statusForm.id) {
        const id = `custom-${Date.now()}`;
        setTripStatuses((prev) => [
          ...prev,
          { ...statusForm, id, is_system: false, activo: statusForm.activo !== false },
        ]);
        toast.success("Estado creado (demo)");
      } else {
        setTripStatuses((prev) =>
          prev.map((s) => (s.id === statusForm.id ? { ...statusForm } : s)),
        );
        toast.success("Estado actualizado (demo)");
      }
      setStatusesOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al guardar estado");
    }
  };

  const removeStatus = async (row: TripStatusRef) => {
    if (row.is_system) return;
    try {
      if (apiMode && canManageStatuses) {
        await deleteTripStatus(row.id);
        toast.success("Estado eliminado");
        await loadTripStatuses();
        return;
      }
      setTripStatuses((prev) => prev.filter((s) => s.id !== row.id));
      toast.success("Estado eliminado (demo)");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al eliminar");
    }
  };

  return (
    <div className="space-y-4">
      <Card className="p-4 tlo-shadow-md">
        <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[200px]">
              <Label className="text-xs">Buscar folio o ruta</Label>
              <div className="relative">
                <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                  placeholder="V-2026-0142, Gdl → Mty..."
                />
              </div>
            </div>
            <CollapsibleTrigger asChild>
              <Button type="button" variant="outline" className="gap-2">
                <SlidersHorizontal className="h-4 w-4" />
                Filtros
                {hasActiveFilters && (
                  <Badge className="ml-0.5 h-5 min-w-5 justify-center rounded-full px-1.5 text-[10px] bg-primary text-primary-foreground">
                    {activeFiltersCount}
                  </Badge>
                )}
                <ChevronDown
                  className={`h-4 w-4 transition-transform ${filtersOpen ? "rotate-180" : ""}`}
                />
              </Button>
            </CollapsibleTrigger>
            <Button variant="outline" onClick={() => setManageStatusesOpen(true)}>
              <Tags className="h-4 w-4 mr-2" /> Estados
            </Button>
            <Button
              onClick={openNewTripDialog}
              className="bg-primary text-primary-foreground hover:bg-primary-glow"
            >
              <Plus className="h-4 w-4 mr-2" /> Abrir viaje
            </Button>
          </div>
          <CollapsibleContent>
            <div className="pt-4 mt-4 border-t border-border space-y-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Estado</Label>
                  <Select value={statusFilterSelectValue} onValueChange={setFilterStatus}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Estado" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos</SelectItem>
                      {activeStatuses.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.nombre}
                        </SelectItem>
                      ))}
                      <SelectSeparator />
                      <SelectItem value={FILTER_LIQUIDADO}>Liquidado</SelectItem>
                      <SelectItem value={FILTER_NO_LIQUIDADO}>No Liquidado</SelectItem>
                      <SelectItem value={FILTER_PRORRATEADO}>Prorrateado</SelectItem>
                      <SelectItem value={FILTER_NO_PRORRATEADO}>No Prorrateado</SelectItem>
                      {FEATURE_CARTA_PORTE && (
                        <SelectItem value={FILTER_TIMBRADO}>Timbrado</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Tipo de viaje</Label>
                  <Select value={filterTipoViaje} onValueChange={setFilterTipoViaje}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={FILTER_TODOS}>Todos</SelectItem>
                      <SelectItem value="local">Local</SelectItem>
                      <SelectItem value="foraneo">Foráneo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs text-muted-foreground">Cliente</Label>
                  <Select value={filterClient} onValueChange={setFilterClient}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={FILTER_TODOS}>Todos</SelectItem>
                      {clients.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.razon_social}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-1.5 lg:col-span-2">
                  <Label className="text-xs text-muted-foreground">Operador</Label>
                  <Select value={filterDriver} onValueChange={setFilterDriver}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={FILTER_TODOS}>Todos</SelectItem>
                      {drivers.map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.nombre}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5 lg:col-span-2">
                  <Label className="text-xs text-muted-foreground">Camión</Label>
                  <Select value={filterTruck} onValueChange={setFilterTruck}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={FILTER_TODOS}>Todos</SelectItem>
                      {trucks.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.numero_economico}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="rounded-md border border-border/70 bg-muted/30 px-3 py-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Desde</Label>
                    <Input
                      type="date"
                      value={filterFechaDesde}
                      onChange={(e) => setFilterFechaDesde(e.target.value)}
                      className="w-full sm:w-[160px] bg-background"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Hasta</Label>
                    <Input
                      type="date"
                      value={filterFechaHasta}
                      onChange={(e) => setFilterFechaHasta(e.target.value)}
                      className="w-full sm:w-[160px] bg-background"
                    />
                  </div>
                  <div className="flex flex-wrap gap-2 sm:pb-0.5">
                    <Button type="button" variant="outline" size="sm" className="h-9" onClick={applyFiltroHoy}>
                      Hoy
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-9"
                      onClick={applyFiltroSemanaActual}
                    >
                      Semana actual
                    </Button>
                    {(filterFechaDesde || filterFechaHasta) && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-9 text-muted-foreground"
                        onClick={() => {
                          setFilterFechaDesde("");
                          setFilterFechaHasta("");
                        }}
                      >
                        Limpiar fechas
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </Card>

      <Card className="tlo-shadow-md overflow-hidden">
        {catalogLoading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Cargando viajes…
          </div>
        ) : (
          <Table className="[&_th]:h-10 [&_th]:px-2 [&_td]:px-2 [&_td]:py-2.5">
          <TableHeader>
            <TableRow className="bg-secondary/50 [&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-secondary/95 [&_th]:backdrop-blur-sm">
              <SortableTableHead
                label="Folio"
                column="folio"
                activeColumn={sortColumn}
                direction={sortDirection}
                onSort={toggleSort}
              />
              <SortableTableHead
                label="Fecha"
                column="fecha"
                activeColumn={sortColumn}
                direction={sortDirection}
                onSort={toggleSort}
              />
              <SortableTableHead
                label="Ruta"
                column="ruta"
                activeColumn={sortColumn}
                direction={sortDirection}
                onSort={toggleSort}
              />
              <SortableTableHead
                label="Operador"
                column="operador"
                activeColumn={sortColumn}
                direction={sortDirection}
                onSort={toggleSort}
              />
              <SortableTableHead
                label="Factura"
                column="factura"
                activeColumn={sortColumn}
                direction={sortDirection}
                onSort={toggleSort}
                className="w-16 px-1.5"
              />
              <SortableTableHead
                label="Camión"
                column="camion"
                activeColumn={sortColumn}
                direction={sortDirection}
                onSort={toggleSort}
                className="w-14 px-1.5"
              />
              <SortableTableHead
                label="Tarifa"
                column="tarifa"
                activeColumn={sortColumn}
                direction={sortDirection}
                onSort={toggleSort}
                className="text-right"
              />
              <TableHead className="text-right">Km</TableHead>
              <SortableTableHead
                label="Estado"
                column="estado"
                activeColumn={sortColumn}
                direction={sortDirection}
                onSort={toggleSort}
                className="w-[1%] px-1.5"
              />
              <SortableTableHead
                label="Utilidad"
                column="utilidad"
                activeColumn={sortColumn}
                direction={sortDirection}
                onSort={toggleSort}
                className="text-right border-l border-border/60 w-[1%] px-1.5"
              />
              <SortableTableHead
                label="Margen"
                column="margen"
                activeColumn={sortColumn}
                direction={sortDirection}
                onSort={toggleSort}
                className="text-right w-[1%] px-1.5"
              />
              <TableHead className="w-8 px-1"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageData.total === 0 && (
              <TableRow>
                <TableCell colSpan={12} className="text-center text-muted-foreground py-8">
                  Sin resultados
                </TableCell>
              </TableRow>
            )}
            {pageData.slice.map(({ trip: t, fin }) => {
              const drNombre = tripDriverNombre(t, drivers);
              const tk = truckById(trucks, t.truck_id);
              const closed = tripIsClosed(t);
              return (
                <TableRow
                  key={t.id}
                  className="cursor-pointer hover:bg-muted/40 transition-colors"
                  onClick={() => nav(`/viajes/${t.id}`)}
                >
                  <TableCell className="font-mono font-semibold whitespace-nowrap">{t.folio}</TableCell>
                  <TableCell className="text-sm whitespace-nowrap">
                    {closed ? (
                      <div className="leading-tight space-y-1">
                        <div>
                          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Inicio</p>
                          <p>{fmtDate(t.fecha_salida)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Llegada</p>
                          <p>{fmtDate(t.fecha_llegada)}</p>
                        </div>
                      </div>
                    ) : (
                      fmtDate(t.fecha_salida)
                    )}
                  </TableCell>
                  <TableCell className="text-sm whitespace-normal break-words min-w-[8rem]">
                    {formatTripRoute(t)}
                  </TableCell>
                  <TableCell className="text-sm whitespace-normal break-words min-w-[7rem]">
                    {drNombre}
                  </TableCell>
                  <TableCell
                    className="font-mono text-xs w-16 max-w-16 px-1.5 truncate"
                    title={t.num_factura || undefined}
                  >
                    {t.num_factura || "—"}
                  </TableCell>
                  <TableCell
                    className="font-mono text-xs w-14 max-w-14 px-1.5 truncate"
                    title={tk?.numero_economico}
                  >
                    {tk?.numero_economico}
                  </TableCell>
                  <TableCell className="text-right tabular-nums whitespace-nowrap">{fmtMXN(t.tarifa)}</TableCell>
                  <TableCell className="text-right font-mono text-sm tabular-nums whitespace-nowrap">
                    {closed && t.km_final != null ? (
                      <div className="leading-tight space-y-1">
                        <div>
                          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Inicial</p>
                          <p>{fmtNumber(t.km_inicial)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Final</p>
                          <p>{fmtNumber(t.km_final)}</p>
                        </div>
                      </div>
                    ) : (
                      fmtNumber(t.km_inicial)
                    )}
                  </TableCell>
                  <TableCell
                    className="w-[1%] max-w-[7.5rem] px-1.5 [&_.inline-flex]:text-[10px] [&_.inline-flex]:px-1.5 [&_.inline-flex]:py-0 [&_.inline-flex]:leading-tight"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <TripStatusesPicker
                      trip={t}
                      catalog={tripStatuses}
                      onUpdated={handleTripStatusesUpdated}
                    />
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right font-semibold text-xs tabular-nums border-l border-border/60 w-[1%] px-1.5 whitespace-nowrap",
                      closed && (fin.utilidad >= 0 ? "text-success" : "text-destructive"),
                    )}
                  >
                    {closed ? fmtMXN(fin.utilidad) : "—"}
                  </TableCell>
                  <TableCell className="text-right w-[1%] px-1.5 [&>*]:h-5 [&>*]:px-1.5 [&>*]:text-[10px] [&>*]:leading-none">
                    {closed ? (
                      <MarginBadge pct={fin.margen_pct} />
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </TableCell>
                  <TableCell className="w-8 px-1">
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        )}
      </Card>

      {!catalogLoading && pageData.total > 0 ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between text-sm text-muted-foreground">
          <p>
            Mostrando{" "}
            <span className="text-foreground font-medium">
              {pageData.rangeStart}–{pageData.rangeEnd}
            </span>{" "}
            de <span className="text-foreground font-medium">{pageData.total}</span>
            {pageData.total !== trips.length ? (
              <span className="text-muted-foreground"> (catálogo: {trips.length})</span>
            ) : null}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Label className="text-xs whitespace-nowrap">Por página</Label>
              <Select
                value={String(pageSize)}
                onValueChange={(v) => {
                  setPageSize(Number(v));
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-[80px] h-8" aria-label="Filas por página">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="20">20</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                </SelectContent>
              </Select>
            </div>
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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[95vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Abrir nuevo viaje</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Camión</Label>
              <Select value={form.truck_id} onValueChange={(v) => setForm({ ...form, truck_id: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar..." />
                </SelectTrigger>
                <SelectContent>
                  {trucks
                    .filter((t) => t.estatus === "activo")
                    .map((t) => {
                      const busy = openByTruck.get(t.id);
                      return (
                        <SelectItem key={t.id} value={t.id} disabled={Boolean(busy)}>
                          {t.numero_economico} · {t.placas}
                          {busy ? ` (en curso — ${busy.folio})` : ""}
                        </SelectItem>
                      );
                    })}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Operador</Label>
              <Select value={form.driver_id} onValueChange={(v) => setForm({ ...form, driver_id: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar..." />
                </SelectTrigger>
                <SelectContent>
                  {drivers
                    .filter((d) => d.estatus === "activo")
                    .map((d) => {
                      const busy = openByDriver.get(d.id);
                      return (
                        <SelectItem key={d.id} value={d.id} disabled={Boolean(busy)}>
                          {d.nombre}
                          {busy ? ` (en curso — ${busy.folio})` : ""}
                        </SelectItem>
                      );
                    })}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <Label>Cliente</Label>
              <Select
                value={form.client_id}
                onValueChange={(v) => {
                  setForm({ ...form, client_id: v });
                  setSelectedRouteId("__custom__");
                  setParadas(emptyParadas());
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar..." />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.razon_social}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {form.client_id && apiMode && (
              <div className="col-span-2">
                <Label>Ruta del catálogo</Label>
                <Select value={selectedRouteId} onValueChange={applyRoute}>
                  <SelectTrigger>
                    <SelectValue placeholder="Personalizada o del catálogo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__custom__">Personalizada (editar paradas)</SelectItem>
                    {catalogRoutes.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.nombre} — {r.ruta_resumen}
                        {r.client_id ? "" : " (global)"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="col-span-2">
              <TripParadasEditor
                paradas={paradas}
                onChange={(p) => {
                  setParadas(p);
                  setSelectedRouteId("__custom__");
                }}
              />
            </div>
            <div className="col-span-2">
              <Label>Número de factura</Label>
              <Input
                value={form.num_factura}
                onChange={(e) => setForm({ ...form, num_factura: e.target.value })}
                placeholder="F-8826 (opcional)"
              />
            </div>
            <div>
              <Label>Fecha y hora salida</Label>
              <Input
                type="datetime-local"
                value={form.fecha_salida}
                onChange={(e) => setForm({ ...form, fecha_salida: e.target.value })}
              />
            </div>
            <div>
              <Label>Kilometraje inicial</Label>
              <Input
                type="number"
                value={form.km_inicial}
                disabled={kmLoading}
                onChange={(e) => setForm({ ...form, km_inicial: +e.target.value })}
              />
            </div>
            <div>
              <Label>Tarifa pactada (MXN)</Label>
              <Input
                type="number"
                value={form.tarifa}
                onChange={(e) => setForm({ ...form, tarifa: +e.target.value })}
              />
            </div>
            <div>
              <Label>Tipo de viaje</Label>
              <Select
                value={form.tipo_viaje}
                onValueChange={(v) => setForm({ ...form, tipo_viaje: v as TripType })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="local">Local</SelectItem>
                  <SelectItem value="foraneo">Foráneo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Viáticos entregados</Label>
              <Input
                type="number"
                value={form.viaticos_entregados}
                onChange={(e) => setForm({ ...form, viaticos_entregados: +e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={submit} className="bg-primary text-primary-foreground hover:bg-primary-glow">
              Abrir viaje
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={beforeLastMessage !== null}
        onOpenChange={(o) => !o && setBeforeLastMessage(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Fecha anterior al último viaje</AlertDialogTitle>
            <AlertDialogDescription>{beforeLastMessage}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Entendido</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={manageStatusesOpen} onOpenChange={setManageStatusesOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Estados de viaje</DialogTitle>
          </DialogHeader>
          <div className="flex justify-end mb-2">
            <Button size="sm" onClick={openNewStatus}>
              <Plus className="h-4 w-4 mr-1" /> Nuevo estado
            </Button>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Color</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="w-[90px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tripStatuses.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>{s.nombre}</TableCell>
                  <TableCell>
                    <span
                      className="inline-block h-4 w-4 rounded-full border"
                      style={{ backgroundColor: s.color }}
                    />
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {s.is_system ? "Sistema" : s.activo === false ? "Inactivo" : "Personalizado"}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1 justify-end">
                      <Button variant="ghost" size="icon" onClick={() => openEditStatus(s)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      {!s.is_system && (
                        <Button variant="ghost" size="icon" onClick={() => void removeStatus(s)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DialogContent>
      </Dialog>

      <Dialog open={statusesOpen} onOpenChange={setStatusesOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{statusForm.id ? "Editar estado" : "Nuevo estado"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nombre</Label>
              <Input
                value={statusForm.nombre}
                onChange={(e) => setStatusForm({ ...statusForm, nombre: e.target.value })}
                placeholder="Pendiente factura"
                disabled={!!statusForm.is_system}
              />
            </div>
            <div>
              <Label>Color</Label>
              <Select
                value={statusForm.color}
                onValueChange={(v) => setStatusForm({ ...statusForm, color: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TRIP_STATUS_COLOR_OPTIONS.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      <span className="inline-flex items-center gap-2">
                        <span
                          className="h-3 w-3 rounded-full border"
                          style={{ backgroundColor: c.value }}
                        />
                        {c.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {!statusForm.is_system && (
              <div className="flex items-center gap-2">
                <Switch
                  checked={statusForm.activo !== false}
                  onCheckedChange={(v) => setStatusForm({ ...statusForm, activo: v })}
                />
                <Label>Activo</Label>
              </div>
            )}
            {statusForm.is_system && (
              <p className="text-xs text-muted-foreground">
                Estado de sistema: no se puede eliminar ni renombrar.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStatusesOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => void saveStatus()} disabled={statusesLoading}>
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
