import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTlo } from "@/context/TloContext";
import { useAuth } from "@/context/AuthContext";
import { apiFetch, readJson } from "@/lib/api";
import {
  createMaintenanceRecordApi,
  deleteMaintenanceInvoice,
  fetchMaintenanceCategories,
  fetchMaintenanceRecords,
  fetchSuppliers,
  openAuthenticatedFile,
  updateMaintenanceRecordApi,
  uploadMaintenanceInvoice,
} from "@/lib/tloApi";
import type {
  MaintenanceCategory,
  MaintenanceOverviewUnit,
  MaintenanceRecordRow,
  MaintenanceType,
  Supplier,
} from "@/types/tlo";
import { KpiCard } from "@/components/tlo/KpiCard";
import { CategoryCombobox } from "@/components/tlo/CategoryCombobox";
import { MaintenanceCategoriesTab } from "@/components/tlo/MaintenanceCategoriesTab";
import { SupplierCombobox } from "@/components/tlo/SupplierCombobox";
import { ConceptosEditor } from "@/components/tlo/ConceptosEditor";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CalendarClock,
  CheckCircle2,
  ClipboardPlus,
  ExternalLink,
  FileText,
  Gauge,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
  Wrench,
  X,
} from "lucide-react";
import { fmtDate, fmtMXN, fmtNumber } from "@/lib/format";
import {
  emptyConcepto,
  filledConceptos,
  validateConceptos,
  type DocumentConcepto,
} from "@/lib/documentConceptos";
import { normalizeSearch, slicePage } from "@/lib/tableFilters";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const tipoLabel: Record<MaintenanceType, string> = {
  preventivo: "Preventivo",
  menor: "Menor",
  intermedio: "Intermedio",
  mayor: "Mayor",
  correctivo: "Correctivo",
};

const KM_ALERT_THRESHOLD = 1000;
const DAYS_ALERT_THRESHOLD = 30;
const FACTURA_ACCEPT = ".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png";

type StatusFilter = "todos" | "vencidos" | "proximos" | "al_dia" | "sin_prog";
type UnitHealth = "vencido" | "proximo" | "al_dia" | "sin_prog";
type PendingDelete = { truckId: string; tipo: MaintenanceType; label: string };
type BitacoraSortColumn =
  | "fecha"
  | "unidad"
  | "tipo"
  | "km"
  | "km_recorridos"
  | "costo"
  | "categoria"
  | "proveedor"
  | "descripcion"
  | "folio";
type SortDirection = "asc" | "desc";
type MainTab = "unidades" | "bitacora" | "categorias";

/** Orden cronológico de servicios de una misma unidad (fecha, luego odómetro). */
function compareRecordsChronological(a: MaintenanceRecordRow, b: MaintenanceRecordRow): number {
  const fa = String(a.fecha).slice(0, 10);
  const fb = String(b.fecha).slice(0, 10);
  if (fa !== fb) return fa.localeCompare(fb);
  if (a.km_odometro !== b.km_odometro) return a.km_odometro - b.km_odometro;
  return a.id.localeCompare(b.id);
}

function addDaysIso(dateIso: string, days: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dateIso).trim());
  if (!m) return dateIso;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + days);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function isNearDue(p: MaintenanceOverviewUnit["proximos"][number]): boolean {
  if (p.vencido) return false;
  const kmNear = p.km_restantes != null && p.km_restantes <= KM_ALERT_THRESHOLD;
  const daysNear = p.dias_restantes != null && p.dias_restantes <= DAYS_ALERT_THRESHOLD;
  return kmNear || daysNear;
}

function unitHealth(u: MaintenanceOverviewUnit): UnitHealth {
  if (u.proximos.length === 0) return "sin_prog";
  if (u.proximos.some((p) => p.vencido)) return "vencido";
  if (u.proximos.some(isNearDue)) return "proximo";
  return "al_dia";
}

const healthMeta: Record<
  UnitHealth,
  { label: string; badge: "destructive" | "secondary" | "outline" | "default"; className: string }
> = {
  vencido: {
    label: "Vencido",
    badge: "destructive",
    className: "border-destructive/40 bg-destructive/[0.03]",
  },
  proximo: {
    label: "Por vencer",
    badge: "secondary",
    className: "border-warning/50 bg-warning/5",
  },
  al_dia: {
    label: "Al día",
    badge: "outline",
    className: "",
  },
  sin_prog: {
    label: "Sin programación",
    badge: "outline",
    className: "border-dashed",
  },
};

function kmProgressPct(kmRestantes: number | null, intervaloHint = 20000): number {
  if (kmRestantes == null) return 0;
  if (kmRestantes <= 0) return 100;
  const used = Math.max(0, intervaloHint - kmRestantes);
  return Math.min(100, Math.round((used / intervaloHint) * 100));
}

function daysProgressPct(diasRestantes: number | null, intervaloHint = 180): number {
  if (diasRestantes == null) return 0;
  if (diasRestantes <= 0) return 100;
  const used = Math.max(0, intervaloHint - diasRestantes);
  return Math.min(100, Math.round((used / intervaloHint) * 100));
}

function isAllowedFactura(file: File): boolean {
  const mimeOk = ["image/jpeg", "image/png", "application/pdf"].includes(file.type);
  const name = file.name.toLowerCase();
  const extOk = name.endsWith(".pdf") || name.endsWith(".jpg") || name.endsWith(".jpeg") || name.endsWith(".png");
  return mimeOk || extOk;
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
  if (typeof a === "number" && typeof b === "number") cmp = a - b;
  else cmp = String(a).localeCompare(String(b), "es", { numeric: true, sensitivity: "base" });
  return direction === "asc" ? cmp : -cmp;
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
  column: BitacoraSortColumn;
  activeColumn: BitacoraSortColumn | null;
  direction: SortDirection;
  onSort: (column: BitacoraSortColumn) => void;
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
        <Icon className={cn("h-3.5 w-3.5 shrink-0", !active && "text-muted-foreground opacity-60")} />
      </button>
    </TableHead>
  );
}

function FacturaThumb({
  fileUrl,
  mime,
  nombre,
}: {
  fileUrl: string;
  mime?: string;
  nombre?: string;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const isImage = Boolean(mime?.startsWith("image/"));

  useEffect(() => {
    if (!isImage) {
      setSrc(null);
      return;
    }
    let revoked = false;
    let objectUrl: string | null = null;
    void (async () => {
      try {
        const res = await apiFetch(fileUrl);
        if (!res.ok) return;
        const blob = await res.blob();
        objectUrl = URL.createObjectURL(blob);
        if (!revoked) setSrc(objectUrl);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      revoked = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [fileUrl, isImage]);

  if (isImage && src) {
    return (
      <img
        src={src}
        alt={nombre || "Factura"}
        className="h-10 w-10 rounded object-cover border border-border/60"
      />
    );
  }
  return (
    <span className="flex h-10 w-10 items-center justify-center rounded border border-border/60 bg-secondary">
      <FileText className="h-4 w-4 text-muted-foreground" />
    </span>
  );
}

export default function Mantenimiento() {
  const { trucks } = useTlo();
  const { hasPermission } = useAuth();
  const canEdit = hasPermission("catalogos.editar");
  const navigate = useNavigate();

  const [units, setUnits] = useState<MaintenanceOverviewUnit[]>([]);
  const [records, setRecords] = useState<MaintenanceRecordRow[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [categories, setCategories] = useState<MaintenanceCategory[]>([]);
  const [loading, setLoading] = useState(false);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [mainTab, setMainTab] = useState<MainTab>("unidades");
  const [recordOpen, setRecordOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [porKm, setPorKm] = useState(true);
  const [porDias, setPorDias] = useState(false);
  const [unitFilter, setUnitFilter] = useState("todas");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("todos");
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [savingRecord, setSavingRecord] = useState(false);
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  const [invoicePreviewUrl, setInvoicePreviewUrl] = useState<string | null>(null);
  const [facturaBusyId, setFacturaBusyId] = useState<string | null>(null);

  const [bitSearch, setBitSearch] = useState("");
  const [bitUnit, setBitUnit] = useState("todas");
  const [bitSupplier, setBitSupplier] = useState("todos");
  const [bitCategory, setBitCategory] = useState("todos");
  const [bitTipo, setBitTipo] = useState<MaintenanceType | "todos">("todos");
  const [bitDesde, setBitDesde] = useState("");
  const [bitHasta, setBitHasta] = useState("");
  const [sortColumn, setSortColumn] = useState<BitacoraSortColumn>("fecha");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const [form, setForm] = useState({
    truck_id: "",
    tipo: "preventivo" as MaintenanceType,
    km_odometro: 0,
    fecha: new Date().toISOString().slice(0, 10),
    supplier_id: "",
    category_id: "",
    intervalo_km: 20000,
    intervalo_dias: 180,
    ultimo_km: 0,
    ultima_fecha: new Date().toISOString().slice(0, 10),
  });
  const [numFactura, setNumFactura] = useState("");
  const [conceptos, setConceptos] = useState<DocumentConcepto[]>([emptyConcepto()]);

  const activeSuppliers = useMemo(
    () => suppliers.filter((s) => (s.estatus ?? "activo") === "activo"),
    [suppliers],
  );

  const activeCategories = useMemo(
    () => categories.filter((c) => (c.estatus ?? "activo") === "activo"),
    [categories],
  );

  const categoriesForForm = useMemo(() => {
    if (!form.category_id || activeCategories.some((c) => c.id === form.category_id)) {
      return activeCategories;
    }
    const current = categories.find((c) => c.id === form.category_id);
    return current ? [current, ...activeCategories] : activeCategories;
  }, [activeCategories, categories, form.category_id]);

  const suppliersForForm = useMemo(() => {
    if (!form.supplier_id || activeSuppliers.some((s) => s.id === form.supplier_id)) {
      return activeSuppliers;
    }
    const current = suppliers.find((s) => s.id === form.supplier_id);
    return current ? [current, ...activeSuppliers] : activeSuppliers;
  }, [activeSuppliers, suppliers, form.supplier_id]);

  const truckLabel = useCallback(
    (truckId: string) => {
      const t = trucks.find((x) => x.id === truckId);
      return t?.numero_economico ?? units.find((u) => u.truck_id === truckId)?.numero_economico ?? "—";
    },
    [trucks, units],
  );

  const supplierLabel = useCallback(
    (r: MaintenanceRecordRow) => {
      if (r.supplier_id) {
        const s = suppliers.find((x) => x.id === r.supplier_id);
        if (s) return s.razon_social;
      }
      return r.taller?.trim() || "—";
    },
    [suppliers],
  );

  const categoryLabel = useCallback(
    (r: MaintenanceRecordRow) => {
      if (r.category_id) {
        const c = categories.find((x) => x.id === r.category_id);
        if (c) return c.nombre;
      }
      return "—";
    },
    [categories],
  );

  /** Km actual y tipo sugerido (programación más urgente) al elegir una unidad. */
  const recordDefaultsForTruck = useCallback(
    (truckId: string): { km_odometro: number; tipo: MaintenanceType } => {
      const unit = units.find((u) => u.truck_id === truckId);
      const km_odometro = unit?.km_actual ?? 0;
      if (!unit || unit.proximos.length === 0) {
        return { km_odometro, tipo: "preventivo" };
      }
      const sorted = [...unit.proximos].sort((a, b) => {
        if (a.vencido !== b.vencido) return a.vencido ? -1 : 1;
        const aNear = isNearDue(a);
        const bNear = isNearDue(b);
        if (aNear !== bNear) return aNear ? -1 : 1;
        const aKm = a.km_restantes ?? Number.POSITIVE_INFINITY;
        const bKm = b.km_restantes ?? Number.POSITIVE_INFINITY;
        if (aKm !== bKm) return aKm - bKm;
        const aDays = a.dias_restantes ?? Number.POSITIVE_INFINITY;
        const bDays = b.dias_restantes ?? Number.POSITIVE_INFINITY;
        return aDays - bDays;
      });
      return { km_odometro, tipo: sorted[0].tipo };
    },
    [units],
  );

  const applyTruckToRecordForm = useCallback(
    (truckId: string) => {
      const defaults = recordDefaultsForTruck(truckId);
      setForm((f) => ({
        ...f,
        truck_id: truckId,
        km_odometro: defaults.km_odometro,
        tipo: defaults.tipo,
      }));
    },
    [recordDefaultsForTruck],
  );

  const loadOverview = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/maintenance/overview");
      const data = await readJson<MaintenanceOverviewUnit[]>(res);
      setUnits(data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al cargar mantenimiento");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadRecords = useCallback(async () => {
    setRecordsLoading(true);
    try {
      setRecords(await fetchMaintenanceRecords());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al cargar bitácora");
    } finally {
      setRecordsLoading(false);
    }
  }, []);

  const load = useCallback(async () => {
    await Promise.all([loadOverview(), loadRecords()]);
  }, [loadOverview, loadRecords]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void fetchSuppliers()
      .then(setSuppliers)
      .catch(() => toast.error("No se pudieron cargar los proveedores"));
  }, []);

  useEffect(() => {
    void fetchMaintenanceCategories()
      .then(setCategories)
      .catch(() => toast.error("No se pudieron cargar las categorías"));
  }, []);

  const onCategoriesChanged = useCallback((rows: MaintenanceCategory[]) => {
    setCategories(rows);
  }, []);

  useEffect(() => {
    if (!invoiceFile) {
      setInvoicePreviewUrl(null);
      return;
    }
    if (!invoiceFile.type.startsWith("image/")) {
      setInvoicePreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(invoiceFile);
    setInvoicePreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [invoiceFile]);

  const stats = useMemo(() => {
    let vencidos = 0;
    let proximos = 0;
    let alDia = 0;
    let sinProg = 0;
    for (const u of units) {
      const h = unitHealth(u);
      if (h === "vencido") vencidos += 1;
      else if (h === "proximo") proximos += 1;
      else if (h === "al_dia") alDia += 1;
      else sinProg += 1;
    }
    return { total: units.length, vencidos, proximos, alDia, sinProg };
  }, [units]);

  const filteredUnits = useMemo(() => {
    const healthOrder: Record<UnitHealth, number> = {
      vencido: 0,
      proximo: 1,
      sin_prog: 2,
      al_dia: 3,
    };

    return units
      .filter((u) => {
        const h = unitHealth(u);
        if (statusFilter === "vencidos" && h !== "vencido") return false;
        if (statusFilter === "proximos" && h !== "proximo") return false;
        if (statusFilter === "al_dia" && h !== "al_dia") return false;
        if (statusFilter === "sin_prog" && h !== "sin_prog") return false;
        if (unitFilter !== "todas" && u.truck_id !== unitFilter) return false;
        return true;
      })
      .sort((a, b) => {
        const ha = unitHealth(a);
        const hb = unitHealth(b);
        if (healthOrder[ha] !== healthOrder[hb]) return healthOrder[ha] - healthOrder[hb];
        return a.numero_economico.localeCompare(b.numero_economico, "es", { numeric: true });
      });
  }, [units, unitFilter, statusFilter]);

  /** Km recorridos entre el servicio anterior y éste (por unidad). */
  const kmRecorridosById = useMemo(() => {
    const byTruck = new Map<string, MaintenanceRecordRow[]>();
    for (const r of records) {
      const list = byTruck.get(r.truck_id) ?? [];
      list.push(r);
      byTruck.set(r.truck_id, list);
    }
    const map = new Map<string, number | null>();
    for (const list of byTruck.values()) {
      list.sort(compareRecordsChronological);
      for (let i = 0; i < list.length; i++) {
        const cur = list[i];
        if (i === 0) {
          map.set(cur.id, null);
        } else {
          map.set(cur.id, cur.km_odometro - list[i - 1].km_odometro);
        }
      }
    }
    return map;
  }, [records]);

  const lastRecordForFormTruck = useMemo(() => {
    if (!form.truck_id) return null;
    const fechaForm = String(form.fecha).slice(0, 10);
    const earlier = records
      .filter((r) => r.truck_id === form.truck_id)
      .filter((r) => !editingRecordId || r.id !== editingRecordId)
      .filter((r) => {
        const fecha = String(r.fecha).slice(0, 10);
        if (fecha < fechaForm) return true;
        if (fecha > fechaForm) return false;
        return r.km_odometro < form.km_odometro;
      })
      .sort((a, b) => compareRecordsChronological(b, a));
    return earlier[0] ?? null;
  }, [records, form.truck_id, form.fecha, form.km_odometro, editingRecordId]);

  const kmDesdeUltimoServicio =
    lastRecordForFormTruck != null ? form.km_odometro - lastRecordForFormTruck.km_odometro : null;

  const editingRecord = editingRecordId
    ? records.find((r) => r.id === editingRecordId) ?? null
    : null;

  const filteredRecords = useMemo(() => {
    const q = normalizeSearch(bitSearch);
    return records.filter((r) => {
      if (bitUnit !== "todas" && r.truck_id !== bitUnit) return false;
      if (bitSupplier === "sin") {
        if (r.supplier_id) return false;
      } else if (bitSupplier !== "todos" && r.supplier_id !== bitSupplier) {
        return false;
      }
      if (bitCategory === "sin") {
        if (r.category_id) return false;
      } else if (bitCategory !== "todos" && r.category_id !== bitCategory) {
        return false;
      }
      if (bitTipo !== "todos" && r.tipo !== bitTipo) return false;
      const fecha = String(r.fecha).slice(0, 10);
      if (bitDesde && fecha < bitDesde) return false;
      if (bitHasta && fecha > bitHasta) return false;
      if (q) {
        const hay = normalizeSearch(
          `${r.descripcion} ${r.num_factura ?? ""} ${supplierLabel(r)} ${categoryLabel(r)} ${truckLabel(r.truck_id)} ${tipoLabel[r.tipo]}`,
        );
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [
    records,
    bitSearch,
    bitUnit,
    bitSupplier,
    bitCategory,
    bitTipo,
    bitDesde,
    bitHasta,
    supplierLabel,
    categoryLabel,
    truckLabel,
  ]);

  const sortedRecords = useMemo(() => {
    const rows = [...filteredRecords];
    rows.sort((a, b) => {
      let va: string | number | null = null;
      let vb: string | number | null = null;
      switch (sortColumn) {
        case "fecha":
          va = a.fecha;
          vb = b.fecha;
          break;
        case "unidad":
          va = truckLabel(a.truck_id);
          vb = truckLabel(b.truck_id);
          break;
        case "tipo":
          va = tipoLabel[a.tipo];
          vb = tipoLabel[b.tipo];
          break;
        case "km":
          va = a.km_odometro;
          vb = b.km_odometro;
          break;
        case "km_recorridos":
          va = kmRecorridosById.get(a.id) ?? null;
          vb = kmRecorridosById.get(b.id) ?? null;
          break;
        case "costo":
          va = a.costo;
          vb = b.costo;
          break;
        case "categoria":
          va = categoryLabel(a);
          vb = categoryLabel(b);
          break;
        case "proveedor":
          va = supplierLabel(a);
          vb = supplierLabel(b);
          break;
        case "descripcion":
          va = a.descripcion;
          vb = b.descripcion;
          break;
        case "folio":
          va = a.num_factura ?? "";
          vb = b.num_factura ?? "";
          break;
      }
      return compareSortValues(va, vb, sortDirection);
    });
    return rows;
  }, [
    filteredRecords,
    sortColumn,
    sortDirection,
    truckLabel,
    supplierLabel,
    categoryLabel,
    kmRecorridosById,
  ]);

  const pageData = useMemo(
    () => slicePage(sortedRecords, page, pageSize),
    [sortedRecords, page, pageSize],
  );

  useEffect(() => {
    setPage(1);
  }, [bitSearch, bitUnit, bitSupplier, bitCategory, bitTipo, bitDesde, bitHasta, pageSize]);

  const toggleSort = (column: BitacoraSortColumn) => {
    if (sortColumn === column) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(column);
      setSortDirection(column === "fecha" ? "desc" : "asc");
    }
  };

  const clearInvoiceFile = () => setInvoiceFile(null);

  const onPickInvoice = (file: File | null) => {
    if (!file) {
      clearInvoiceFile();
      return;
    }
    if (!isAllowedFactura(file)) {
      toast.error("Solo se permiten archivos PDF, JPG o PNG");
      return;
    }
    setInvoiceFile(file);
  };

  const openSchedule = (truckId?: string, kmActual = 0) => {
    setForm((f) => ({
      ...f,
      truck_id: truckId ?? "",
      km_odometro: kmActual,
      ultimo_km: kmActual,
      ultima_fecha: new Date().toISOString().slice(0, 10),
      tipo: "preventivo",
      intervalo_km: 20000,
      intervalo_dias: 180,
    }));
    setPorKm(true);
    setPorDias(false);
    setScheduleOpen(true);
  };

  const openRecord = (truckId?: string) => {
    const defaults = truckId
      ? recordDefaultsForTruck(truckId)
      : { km_odometro: 0, tipo: "preventivo" as MaintenanceType };
    setEditingRecordId(null);
    setForm((f) => ({
      ...f,
      truck_id: truckId ?? "",
      km_odometro: defaults.km_odometro,
      fecha: new Date().toISOString().slice(0, 10),
      supplier_id: "",
      category_id: "",
      tipo: defaults.tipo,
    }));
    setNumFactura("");
    setConceptos([emptyConcepto()]);
    clearInvoiceFile();
    setRecordOpen(true);
  };

  const openEditRecord = (r: MaintenanceRecordRow) => {
    setEditingRecordId(r.id);
    setForm((f) => ({
      ...f,
      truck_id: r.truck_id,
      tipo: r.tipo,
      km_odometro: r.km_odometro,
      fecha: String(r.fecha).slice(0, 10),
      supplier_id: r.supplier_id ?? "",
      category_id: r.category_id ?? "",
    }));
    setNumFactura(r.num_factura ?? "");
    setConceptos(r.conceptos);
    clearInvoiceFile();
    setRecordOpen(true);
  };

  const saveSchedule = async () => {
    if (!form.truck_id) {
      toast.error("Selecciona una unidad");
      return;
    }
    if (!porKm && !porDias) {
      toast.error("Selecciona al menos un criterio: por kilómetros o por días");
      return;
    }
    if (porKm && (!form.intervalo_km || form.intervalo_km <= 0)) {
      toast.error("Indica un intervalo de kilómetros mayor a cero");
      return;
    }
    if (porDias && (!form.intervalo_dias || form.intervalo_dias <= 0)) {
      toast.error("Indica un intervalo de días mayor a cero");
      return;
    }
    if (porDias && !form.ultima_fecha) {
      toast.error("Indica la fecha del último servicio");
      return;
    }
    try {
      await apiFetch("/maintenance/schedules", {
        method: "PUT",
        body: JSON.stringify({
          truck_id: form.truck_id,
          tipo: form.tipo,
          intervalo_km: porKm ? form.intervalo_km : null,
          intervalo_dias: porDias ? form.intervalo_dias : null,
          ultimo_km: form.ultimo_km,
          ultima_fecha: porDias ? form.ultima_fecha : null,
        }),
      });
      toast.success("Programación guardada");
      setScheduleOpen(false);
      await loadOverview();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    }
  };

  const confirmRemoveSchedule = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      const params = new URLSearchParams({
        truck_id: pendingDelete.truckId,
        tipo: pendingDelete.tipo,
      });
      const res = await apiFetch(`/maintenance/schedules?${params}`, { method: "DELETE" });
      if (!res.ok) await readJson(res);
      toast.success("Programación eliminada");
      setPendingDelete(null);
      await loadOverview();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al eliminar");
    } finally {
      setDeleting(false);
    }
  };

  const saveRecord = async () => {
    if (!form.truck_id) {
      toast.error("Selecciona una unidad");
      return;
    }
    const conceptoError = validateConceptos(conceptos);
    if (conceptoError) {
      toast.error(conceptoError);
      return;
    }
    const lineas = filledConceptos(conceptos);
    setSavingRecord(true);
    const body = {
      truck_id: form.truck_id,
      tipo: form.tipo,
      km_odometro: form.km_odometro,
      fecha: form.fecha,
      num_factura: numFactura.trim() || null,
      conceptos: lineas,
      supplier_id: form.supplier_id || null,
      category_id: form.category_id || null,
    };
    try {
      const row = editingRecordId
        ? await updateMaintenanceRecordApi(editingRecordId, body)
        : await createMaintenanceRecordApi(body);
      if (invoiceFile) {
        try {
          await uploadMaintenanceInvoice(row.id, invoiceFile);
        } catch (e) {
          toast.error(
            e instanceof Error
              ? `Servicio guardado, pero falló la factura: ${e.message}`
              : "Servicio guardado, pero falló la factura",
          );
          setRecordOpen(false);
          setEditingRecordId(null);
          clearInvoiceFile();
          await load();
          return;
        }
      }
      toast.success(editingRecordId ? "Servicio actualizado" : "Servicio registrado");
      setRecordOpen(false);
      setEditingRecordId(null);
      clearInvoiceFile();
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setSavingRecord(false);
    }
  };

  const viewFactura = async (r: MaintenanceRecordRow) => {
    if (!r.factura_url) return;
    try {
      await openAuthenticatedFile(r.factura_url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo abrir la factura");
    }
  };

  const removeFactura = async (r: MaintenanceRecordRow) => {
    setFacturaBusyId(r.id);
    try {
      const updated = await deleteMaintenanceInvoice(r.id);
      setRecords((prev) => prev.map((x) => (x.id === r.id ? updated : x)));
      toast.success("Factura eliminada");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al eliminar factura");
    } finally {
      setFacturaBusyId(null);
    }
  };

  const filterChips: { id: StatusFilter; label: string; count: number }[] = [
    { id: "todos", label: "Todas", count: stats.total },
    { id: "vencidos", label: "Vencidas", count: stats.vencidos },
    { id: "proximos", label: "Por vencer", count: stats.proximos },
    { id: "al_dia", label: "Al día", count: stats.alDia },
    { id: "sin_prog", label: "Sin prog.", count: stats.sinProg },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-2xl space-y-1">
          <p className="text-sm text-muted-foreground">
            Programa intervalos por km o por tiempo, registra servicios realizados y prioriza unidades
            vencidas. El odómetro se estima con el último viaje cerrado o ticket de combustible.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading || recordsLoading}>
            <RefreshCw className={cn("h-4 w-4 mr-2", (loading || recordsLoading) && "animate-spin")} />
            Actualizar
          </Button>
          <Button variant="outline" onClick={() => openSchedule()}>
            <CalendarClock className="h-4 w-4 mr-2" />
            Programar
          </Button>
          <Button onClick={() => openRecord()} className="bg-primary text-primary-foreground hover:bg-primary-glow">
            <ClipboardPlus className="h-4 w-4 mr-2" />
            Registrar servicio
          </Button>
        </div>
      </div>

      <Tabs
        value={mainTab}
        onValueChange={(v) => setMainTab(v as MainTab)}
      >
        <TabsList>
          <TabsTrigger value="unidades">Unidades</TabsTrigger>
          <TabsTrigger value="bitacora">Bitácora</TabsTrigger>
          <TabsTrigger value="categorias">Categorías</TabsTrigger>
        </TabsList>

        <TabsContent value="unidades" className="space-y-6 mt-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard
              label="Unidades"
              value={String(stats.total)}
              hint="Activas en flota"
              icon={Wrench}
              tone="default"
            />
            <KpiCard
              label="Vencidas"
              value={String(stats.vencidos)}
              hint="Requieren servicio ya"
              icon={AlertTriangle}
              tone={stats.vencidos > 0 ? "destructive" : "success"}
            />
            <KpiCard
              label="Por vencer"
              value={String(stats.proximos)}
              hint={`≤ ${fmtNumber(KM_ALERT_THRESHOLD)} km o ${DAYS_ALERT_THRESHOLD} días`}
              icon={CalendarClock}
              tone={stats.proximos > 0 ? "warning" : "success"}
            />
            <KpiCard
              label="Sin programación"
              value={String(stats.sinProg)}
              hint="Aún sin intervalos"
              icon={Plus}
              tone={stats.sinProg > 0 ? "accent" : "success"}
            />
          </div>

          <Card className="tlo-shadow-md border-border/60">
            <CardContent className="p-4 space-y-3">
              <div className="flex flex-wrap gap-2">
                {filterChips.map((chip) => (
                  <Button
                    key={chip.id}
                    size="sm"
                    variant={statusFilter === chip.id ? "default" : "outline"}
                    className={cn(
                      "h-8",
                      statusFilter === chip.id && "bg-primary text-primary-foreground hover:bg-primary-glow",
                    )}
                    onClick={() => setStatusFilter(chip.id)}
                  >
                    {chip.label}
                    <Badge
                      variant="secondary"
                      className={cn(
                        "ml-2 h-5 min-w-5 justify-center px-1.5 text-[10px]",
                        statusFilter === chip.id && "bg-primary-foreground/20 text-primary-foreground",
                      )}
                    >
                      {chip.count}
                    </Badge>
                  </Button>
                ))}
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2 w-full sm:max-w-xs">
                  <Label htmlFor="unit-filter" className="shrink-0 text-sm">
                    Unidad:
                  </Label>
                  <Select value={unitFilter} onValueChange={setUnitFilter}>
                    <SelectTrigger id="unit-filter" className="w-full">
                      <SelectValue placeholder="Todas" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todas">Todas</SelectItem>
                      {units.map((u) => (
                        <SelectItem key={u.truck_id} value={u.truck_id}>
                          {u.numero_economico} · {u.placas}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <p className="text-xs text-muted-foreground sm:text-right">
                  Mostrando <span className="font-medium text-foreground">{filteredUnits.length}</span> de{" "}
                  {stats.total}
                </p>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filteredUnits.map((u) => {
              const health = unitHealth(u);
              const meta = healthMeta[health];
              return (
                <Card key={u.truck_id} className={cn("tlo-shadow-md flex flex-col", meta.className)}>
                  <CardHeader className="pb-3 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-base flex items-center gap-2 min-w-0">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary">
                          <Wrench className="h-4 w-4" />
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate font-semibold">{u.numero_economico}</span>
                          <span className="block text-xs font-normal text-muted-foreground">{u.placas}</span>
                        </span>
                      </CardTitle>
                      <Badge variant={meta.badge} className="shrink-0 gap-1">
                        {health === "vencido" && <AlertTriangle className="h-3 w-3" />}
                        {health === "al_dia" && <CheckCircle2 className="h-3 w-3" />}
                        {meta.label}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Gauge className="h-3.5 w-3.5" />
                      Odómetro estimado:{" "}
                      <span className="font-medium tabular-nums text-foreground">
                        {fmtNumber(u.km_actual)} km
                      </span>
                    </div>
                  </CardHeader>

                  <CardContent className="flex flex-1 flex-col gap-3 pt-0 text-sm">
                    {u.proximos.length === 0 ? (
                      <div className="rounded-lg border border-dashed px-3 py-4 text-center space-y-2">
                        <p className="text-muted-foreground text-xs">
                          Esta unidad no tiene intervalos programados. Define cuándo debe hacerse el
                          próximo servicio.
                        </p>
                        <Button size="sm" variant="outline" onClick={() => openSchedule(u.truck_id, u.km_actual)}>
                          <CalendarClock className="h-3.5 w-3.5 mr-1.5" />
                          Crear programación
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                          Próximos servicios
                        </p>
                        {u.proximos.map((p) => {
                          const near = isNearDue(p);
                          return (
                            <div
                              key={p.tipo}
                              className={cn(
                                "rounded-lg border px-3 py-2.5 space-y-2",
                                p.vencido && "border-destructive/50 bg-destructive/5",
                                !p.vencido && near && "border-warning/40 bg-warning/5",
                              )}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0 space-y-0.5">
                                  <p className="font-medium">{tipoLabel[p.tipo]}</p>
                                  {p.vencido ? (
                                    <Badge variant="destructive" className="gap-1 h-5 text-[10px]">
                                      <AlertTriangle className="h-3 w-3" /> Vencido
                                    </Badge>
                                  ) : near ? (
                                    <Badge variant="secondary" className="h-5 text-[10px]">
                                      Por vencer
                                    </Badge>
                                  ) : null}
                                </div>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                                  aria-label={`Eliminar programación ${tipoLabel[p.tipo]}`}
                                  onClick={() =>
                                    setPendingDelete({
                                      truckId: u.truck_id,
                                      tipo: p.tipo,
                                      label: `${u.numero_economico} · ${tipoLabel[p.tipo]}`,
                                    })
                                  }
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>

                              {p.km_proximo != null && (
                                <div className="space-y-1">
                                  <div className="flex items-center justify-between gap-2 text-xs">
                                    <span className="flex items-center gap-1 text-muted-foreground">
                                      <Gauge className="h-3 w-3" />
                                      Por km
                                    </span>
                                    <span className="tabular-nums font-medium">
                                      {p.vencido_km
                                        ? "Vencido"
                                        : p.km_restantes != null
                                          ? `${fmtNumber(p.km_restantes)} km rest.`
                                          : "—"}
                                    </span>
                                  </div>
                                  <Progress
                                    value={p.vencido_km ? 100 : kmProgressPct(p.km_restantes)}
                                    className={cn(
                                      "h-1.5",
                                      p.vencido_km && "[&>div]:bg-destructive",
                                      !p.vencido_km &&
                                        p.km_restantes != null &&
                                        p.km_restantes <= KM_ALERT_THRESHOLD &&
                                        "[&>div]:bg-warning",
                                    )}
                                  />
                                  <p className="text-[11px] text-muted-foreground">
                                    Meta: {fmtNumber(p.km_proximo)} km
                                  </p>
                                </div>
                              )}

                              {p.fecha_proxima && (
                                <div className="space-y-1">
                                  <div className="flex items-center justify-between gap-2 text-xs">
                                    <span className="flex items-center gap-1 text-muted-foreground">
                                      <CalendarClock className="h-3 w-3" />
                                      Por tiempo
                                    </span>
                                    <span className="tabular-nums font-medium">
                                      {p.vencido_tiempo
                                        ? "Vencido"
                                        : p.dias_restantes != null
                                          ? `${fmtNumber(p.dias_restantes)} días rest.`
                                          : "—"}
                                    </span>
                                  </div>
                                  <Progress
                                    value={p.vencido_tiempo ? 100 : daysProgressPct(p.dias_restantes)}
                                    className={cn(
                                      "h-1.5",
                                      p.vencido_tiempo && "[&>div]:bg-destructive",
                                      !p.vencido_tiempo &&
                                        p.dias_restantes != null &&
                                        p.dias_restantes <= DAYS_ALERT_THRESHOLD &&
                                        "[&>div]:bg-warning",
                                    )}
                                  />
                                  <p className="text-[11px] text-muted-foreground">
                                    Meta: {fmtDate(p.fecha_proxima)}
                                  </p>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {u.ultimos_registros.length > 0 && (
                      <div className="border-t pt-3 space-y-1.5">
                        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                          Últimos servicios
                        </p>
                        {u.ultimos_registros.map((r) => (
                          <div key={r.id} className="text-xs leading-snug">
                            <span className="text-muted-foreground">{fmtDate(r.fecha)}</span>
                            {" · "}
                            <span className="font-medium">{tipoLabel[r.tipo]}</span>
                            <span className="text-muted-foreground">
                              {" "}
                              @ {fmtNumber(r.km_odometro)} km — {r.descripcion}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="mt-auto flex gap-2 pt-1">
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1"
                        onClick={() => openSchedule(u.truck_id, u.km_actual)}
                      >
                        <CalendarClock className="h-3.5 w-3.5 mr-1.5" />
                        Programar
                      </Button>
                      <Button size="sm" className="flex-1" onClick={() => openRecord(u.truck_id)}>
                        <ClipboardPlus className="h-3.5 w-3.5 mr-1.5" />
                        Registrar
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {filteredUnits.length === 0 && !loading && (
            <Card className="tlo-shadow-md">
              <CardContent className="py-12 text-center space-y-3">
                <Wrench className="h-8 w-8 mx-auto text-muted-foreground/60" />
                <div className="space-y-1">
                  <p className="font-medium">
                    {units.length === 0
                      ? "No hay unidades activas"
                      : "Ninguna unidad coincide con el filtro"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {units.length === 0
                      ? "Cuando tengas camiones activos aparecerán aquí para programar y registrar mantenimiento."
                      : "Prueba otra unidad o selecciona «Todas»."}
                  </p>
                </div>
                {units.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setUnitFilter("todas");
                      setStatusFilter("todos");
                    }}
                  >
                    Limpiar filtros
                  </Button>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="bitacora" className="space-y-4 mt-4">
          <Card className="p-4 tlo-shadow-md space-y-3">
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
              <div className="lg:col-span-2">
                <Label htmlFor="bit-search">Buscar</Label>
                <Input
                  id="bit-search"
                  value={bitSearch}
                  onChange={(e) => setBitSearch(e.target.value)}
                  placeholder="Descripción, categoría, proveedor o unidad…"
                />
              </div>
              <div>
                <Label>Unidad</Label>
                <Select value={bitUnit} onValueChange={setBitUnit}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todas">Todas</SelectItem>
                    {trucks
                      .filter((t) => t.estatus !== "baja")
                      .map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.numero_economico}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Categoría</Label>
                <Select value={bitCategory} onValueChange={setBitCategory}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todas</SelectItem>
                    <SelectItem value="sin">Sin categoría</SelectItem>
                    {categories
                      .slice()
                      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" }))
                      .map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.nombre}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Proveedor</Label>
                <Select value={bitSupplier} onValueChange={setBitSupplier}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    <SelectItem value="sin">Sin proveedor</SelectItem>
                    {suppliers
                      .slice()
                      .sort((a, b) =>
                        a.razon_social.localeCompare(b.razon_social, "es", { sensitivity: "base" }),
                      )
                      .map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.razon_social}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Tipo</Label>
                <Select
                  value={bitTipo}
                  onValueChange={(v) => setBitTipo(v as MaintenanceType | "todos")}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    <SelectItem value="preventivo">Preventivo</SelectItem>
                    <SelectItem value="menor">Menor</SelectItem>
                    <SelectItem value="intermedio">Intermedio</SelectItem>
                    <SelectItem value="mayor">Mayor</SelectItem>
                    <SelectItem value="correctivo">Correctivo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Desde</Label>
                <Input type="date" value={bitDesde} onChange={(e) => setBitDesde(e.target.value)} />
              </div>
              <div>
                <Label>Hasta</Label>
                <Input type="date" value={bitHasta} onChange={(e) => setBitHasta(e.target.value)} />
              </div>
            </div>
          </Card>

          <Card className="tlo-shadow-md overflow-hidden">
            {recordsLoading ? (
              <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                Cargando bitácora…
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-secondary/50 [&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-secondary/95">
                    <SortableTableHead
                      label="Fecha"
                      column="fecha"
                      activeColumn={sortColumn}
                      direction={sortDirection}
                      onSort={toggleSort}
                    />
                    <SortableTableHead
                      label="Unidad"
                      column="unidad"
                      activeColumn={sortColumn}
                      direction={sortDirection}
                      onSort={toggleSort}
                    />
                    <SortableTableHead
                      label="Tipo"
                      column="tipo"
                      activeColumn={sortColumn}
                      direction={sortDirection}
                      onSort={toggleSort}
                    />
                    <SortableTableHead
                      label="Km"
                      column="km"
                      activeColumn={sortColumn}
                      direction={sortDirection}
                      onSort={toggleSort}
                      className="text-right"
                    />
                    <SortableTableHead
                      label="Km recorridos"
                      column="km_recorridos"
                      activeColumn={sortColumn}
                      direction={sortDirection}
                      onSort={toggleSort}
                      className="text-right"
                    />
                    <SortableTableHead
                      label="Costo"
                      column="costo"
                      activeColumn={sortColumn}
                      direction={sortDirection}
                      onSort={toggleSort}
                      className="text-right"
                    />
                    <SortableTableHead
                      label="Categoría"
                      column="categoria"
                      activeColumn={sortColumn}
                      direction={sortDirection}
                      onSort={toggleSort}
                    />
                    <SortableTableHead
                      label="Proveedor"
                      column="proveedor"
                      activeColumn={sortColumn}
                      direction={sortDirection}
                      onSort={toggleSort}
                    />
                    <SortableTableHead
                      label="Descripción"
                      column="descripcion"
                      activeColumn={sortColumn}
                      direction={sortDirection}
                      onSort={toggleSort}
                    />
                    <SortableTableHead
                      label="Folio"
                      column="folio"
                      activeColumn={sortColumn}
                      direction={sortDirection}
                      onSort={toggleSort}
                    />
                    <TableHead>Factura</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageData.slice.map((r) => {
                    const kmRecorridos = kmRecorridosById.get(r.id);
                    return (
                      <TableRow key={r.id} className="hover:bg-muted/40">
                        <TableCell className="whitespace-nowrap">{fmtDate(r.fecha)}</TableCell>
                        <TableCell className="font-medium">{truckLabel(r.truck_id)}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{tipoLabel[r.tipo]}</Badge>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {fmtNumber(r.km_odometro)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {kmRecorridos == null ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            fmtNumber(kmRecorridos)
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{fmtMXN(r.costo)}</TableCell>
                        <TableCell className="max-w-[10rem] truncate">{categoryLabel(r)}</TableCell>
                        <TableCell className="max-w-[10rem] truncate">{supplierLabel(r)}</TableCell>
                        <TableCell className="max-w-[16rem] truncate text-muted-foreground">
                          {r.descripcion}
                        </TableCell>
                        <TableCell className="whitespace-nowrap tabular-nums">
                          {r.num_factura ? r.num_factura : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell>
                          {r.factura_url ? (
                            <div className="flex items-center gap-2">
                              <FacturaThumb
                                fileUrl={r.factura_url}
                                mime={r.factura_mime}
                                nombre={r.factura_nombre}
                              />
                              <div className="flex flex-col gap-1">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 px-2 justify-start"
                                  onClick={() => void viewFactura(r)}
                                >
                                  <ExternalLink className="h-3.5 w-3.5 mr-1" />
                                  Ver
                                </Button>
                                {canEdit && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 px-2 justify-start"
                                    onClick={() => openEditRecord(r)}
                                  >
                                    <Pencil className="h-3.5 w-3.5 mr-1" />
                                    Editar
                                  </Button>
                                )}
                              </div>
                            </div>
                          ) : canEdit ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2"
                              onClick={() => openEditRecord(r)}
                            >
                              <Pencil className="h-3.5 w-3.5 mr-1.5" />
                              Editar
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {!pageData.slice.length && (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center text-muted-foreground py-10">
                        Sin resultados
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </Card>

          {!recordsLoading && pageData.total > 0 && (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">
                Mostrando {pageData.rangeStart}–{pageData.rangeEnd} de {pageData.total}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
                  <SelectTrigger className="w-[100px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="20">20</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Anterior
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= pageData.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Siguiente
                </Button>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="categorias" className="mt-4">
          <MaintenanceCategoriesTab canEdit={canEdit} onChanged={onCategoriesChanged} />
        </TabsContent>
      </Tabs>

      <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Programar servicio</DialogTitle>
            <DialogDescription>
              Define cada cuántos kilómetros y/o días debe repetirse un tipo de servicio. La alerta
              se dispara con el primer criterio que se cumpla.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Unidad</Label>
                <Select value={form.truck_id} onValueChange={(v) => setForm({ ...form, truck_id: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona" />
                  </SelectTrigger>
                  <SelectContent>
                    {trucks
                      .filter((t) => t.estatus !== "baja")
                      .map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.numero_economico}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Tipo de servicio</Label>
                <Select
                  value={form.tipo}
                  onValueChange={(v) => setForm({ ...form, tipo: v as MaintenanceType })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="preventivo">Preventivo</SelectItem>
                    <SelectItem value="menor">Menor</SelectItem>
                    <SelectItem value="intermedio">Intermedio</SelectItem>
                    <SelectItem value="mayor">Mayor</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1">
              <p className="text-sm font-medium">Criterios de alerta</p>
              <p className="text-xs text-muted-foreground">
                Activa uno o ambos. Puedes combinar km y tiempo en la misma programación.
              </p>
            </div>

            <div className={cn("rounded-lg border p-3 space-y-3", !porKm && "bg-muted/40")}>
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox checked={porKm} onCheckedChange={(v) => setPorKm(v === true)} />
                <Gauge className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Por kilómetros</span>
              </label>
              {porKm && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Cada (km)</Label>
                    <Input
                      type="number"
                      min={1}
                      value={form.intervalo_km}
                      onChange={(e) => setForm({ ...form, intervalo_km: +e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Último servicio (km)</Label>
                    <Input
                      type="number"
                      min={0}
                      value={form.ultimo_km}
                      onChange={(e) => setForm({ ...form, ultimo_km: +e.target.value })}
                    />
                  </div>
                  <p className="col-span-2 text-xs text-muted-foreground rounded-md bg-secondary/60 px-2.5 py-2">
                    Próximo servicio a los{" "}
                    <span className="font-medium text-foreground">
                      {fmtNumber((form.ultimo_km || 0) + (form.intervalo_km || 0))} km
                    </span>
                    .
                  </p>
                </div>
              )}
            </div>

            <div className={cn("rounded-lg border p-3 space-y-3", !porDias && "bg-muted/40")}>
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox checked={porDias} onCheckedChange={(v) => setPorDias(v === true)} />
                <CalendarClock className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Por días</span>
              </label>
              {porDias && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Cada (días)</Label>
                    <Input
                      type="number"
                      min={1}
                      value={form.intervalo_dias}
                      onChange={(e) => setForm({ ...form, intervalo_dias: +e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Último servicio (fecha)</Label>
                    <Input
                      type="date"
                      value={form.ultima_fecha}
                      onChange={(e) => setForm({ ...form, ultima_fecha: e.target.value })}
                    />
                  </div>
                  {form.ultima_fecha && form.intervalo_dias > 0 && (
                    <p className="col-span-2 text-xs text-muted-foreground rounded-md bg-secondary/60 px-2.5 py-2">
                      Próximo servicio el{" "}
                      <span className="font-medium text-foreground">
                        {fmtDate(addDaysIso(form.ultima_fecha, form.intervalo_dias))}
                      </span>
                      .
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setScheduleOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => void saveSchedule()} disabled={!porKm && !porDias}>
              Guardar programación
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={recordOpen}
        onOpenChange={(open) => {
          setRecordOpen(open);
          if (!open) {
            clearInvoiceFile();
            setEditingRecordId(null);
            setNumFactura("");
            setConceptos([emptyConcepto()]);
          }
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingRecordId ? "Editar servicio" : "Registrar servicio"}</DialogTitle>
            <DialogDescription>
              {editingRecordId
                ? "Actualiza los datos del mantenimiento. Reemplazar o borrar la factura se aplica desde aquí."
                : "Captura un mantenimiento ya realizado (conceptos, proveedor, factura y odómetro). Si hay programación del mismo tipo, el último servicio se toma del registro más reciente."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label>Unidad</Label>
              <Select
                value={form.truck_id}
                onValueChange={(v) => {
                  if (editingRecordId) setForm({ ...form, truck_id: v });
                  else applyTruckToRecordForm(v);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona" />
                </SelectTrigger>
                <SelectContent>
                  {trucks
                    .filter((t) => t.estatus !== "baja" || t.id === form.truck_id)
                    .map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.numero_economico}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Tipo</Label>
              <Select
                value={form.tipo}
                onValueChange={(v) => setForm({ ...form, tipo: v as MaintenanceType })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="preventivo">Preventivo</SelectItem>
                  <SelectItem value="menor">Menor</SelectItem>
                  <SelectItem value="intermedio">Intermedio</SelectItem>
                  <SelectItem value="mayor">Mayor</SelectItem>
                  <SelectItem value="correctivo">Correctivo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Fecha</Label>
              <Input
                type="date"
                value={form.fecha}
                onChange={(e) => setForm({ ...form, fecha: e.target.value })}
              />
            </div>
            <div>
              <Label>Km odómetro</Label>
              <Input
                type="number"
                value={form.km_odometro}
                onChange={(e) => setForm({ ...form, km_odometro: +e.target.value })}
              />
              {form.truck_id ? (
                lastRecordForFormTruck && kmDesdeUltimoServicio != null ? (
                  <p
                    className={cn(
                      "text-xs mt-1.5",
                      kmDesdeUltimoServicio < 0 ? "text-destructive" : "text-muted-foreground",
                    )}
                  >
                    {kmDesdeUltimoServicio < 0
                      ? `El odómetro es menor al del último servicio (${fmtNumber(lastRecordForFormTruck.km_odometro)} km el ${fmtDate(lastRecordForFormTruck.fecha)}).`
                      : `${fmtNumber(kmDesdeUltimoServicio)} km desde el último servicio (${fmtNumber(lastRecordForFormTruck.km_odometro)} km el ${fmtDate(lastRecordForFormTruck.fecha)}).`}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground mt-1.5">
                    Sin servicios previos en bitácora para esta unidad.
                  </p>
                )
              ) : null}
            </div>
            <div className="col-span-2">
              <Label>Categoría</Label>
              <CategoryCombobox
                categories={categoriesForForm}
                value={form.category_id}
                onChange={(categoryId) => setForm({ ...form, category_id: categoryId })}
                placeholder="Opcional — buscar categoría…"
                onCreateNavigate={() => {
                  setRecordOpen(false);
                  setMainTab("categorias");
                }}
              />
            </div>
            <div className="col-span-2">
              <Label>Proveedor</Label>
              <SupplierCombobox
                suppliers={suppliersForForm}
                value={form.supplier_id}
                onChange={(supplierId) => setForm({ ...form, supplier_id: supplierId })}
                placeholder="Opcional — buscar proveedor…"
                onCreateNavigate={() => {
                  setRecordOpen(false);
                  navigate("/proveedores");
                }}
              />
            </div>
            <div className="col-span-2">
              <ConceptosEditor value={conceptos} onChange={setConceptos} disabled={savingRecord} />
            </div>
            <div className="col-span-2">
              <Label>Número de factura</Label>
              <Input
                value={numFactura}
                onChange={(e) => setNumFactura(e.target.value)}
                placeholder="Opcional"
                maxLength={64}
              />
            </div>
            <div className="col-span-2 space-y-2">
              <Label>Factura</Label>
              {invoiceFile ? (
                <div className="rounded-lg border p-3 flex items-start gap-3">
                  {invoicePreviewUrl ? (
                    <img
                      src={invoicePreviewUrl}
                      alt="Vista previa"
                      className="h-16 w-16 rounded object-cover border"
                    />
                  ) : (
                    <span className="flex h-16 w-16 items-center justify-center rounded border bg-secondary">
                      <FileText className="h-6 w-6 text-muted-foreground" />
                    </span>
                  )}
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="text-sm font-medium truncate">{invoiceFile.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {(invoiceFile.size / 1024).toFixed(0)} KB · se subirá al guardar
                    </p>
                    <div className="flex gap-2 pt-1">
                      <Button type="button" size="sm" variant="outline" onClick={clearInvoiceFile}>
                        <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                        Quitar
                      </Button>
                      <label className="inline-flex">
                        <Button type="button" size="sm" variant="ghost" asChild>
                          <span>
                            <Upload className="h-3.5 w-3.5 mr-1.5" />
                            Cambiar
                          </span>
                        </Button>
                        <input
                          type="file"
                          accept={FACTURA_ACCEPT}
                          className="hidden"
                          onChange={(e) => onPickInvoice(e.target.files?.[0] ?? null)}
                        />
                      </label>
                    </div>
                  </div>
                </div>
              ) : editingRecord?.factura_url ? (
                <div className="rounded-lg border p-3 flex items-start gap-3">
                  <FacturaThumb
                    fileUrl={editingRecord.factura_url}
                    mime={editingRecord.factura_mime}
                    nombre={editingRecord.factura_nombre}
                  />
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="text-sm font-medium truncate">
                      {editingRecord.factura_nombre || "Factura"}
                    </p>
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => void viewFactura(editingRecord)}
                      >
                        <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                        Ver
                      </Button>
                      <label className="inline-flex">
                        <Button type="button" size="sm" variant="ghost" asChild>
                          <span>
                            <Upload className="h-3.5 w-3.5 mr-1.5" />
                            Reemplazar
                          </span>
                        </Button>
                        <input
                          type="file"
                          accept={FACTURA_ACCEPT}
                          className="hidden"
                          onChange={(e) => onPickInvoice(e.target.files?.[0] ?? null)}
                        />
                      </label>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        disabled={facturaBusyId === editingRecord.id}
                        onClick={() => void removeFactura(editingRecord)}
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                        Borrar
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <Input
                  type="file"
                  accept={FACTURA_ACCEPT}
                  onChange={(e) => onPickInvoice(e.target.files?.[0] ?? null)}
                />
              )}
              <p className="text-xs text-muted-foreground">PDF, JPG o PNG.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRecordOpen(false)} disabled={savingRecord}>
              Cancelar
            </Button>
            <Button onClick={() => void saveRecord()} disabled={savingRecord}>
              {savingRecord
                ? "Guardando…"
                : editingRecordId
                  ? "Guardar cambios"
                  : "Registrar servicio"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={pendingDelete != null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar programación?</AlertDialogTitle>
            <AlertDialogDescription>
              Se quitará la alerta de{" "}
              <span className="font-medium text-foreground">{pendingDelete?.label}</span>. Los
              registros de servicio ya capturados no se borran.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={deleting}
              onClick={() => void confirmRemoveSchedule()}
            >
              {deleting ? "Eliminando…" : "Eliminar"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
