import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTlo } from "@/context/TloContext";
import { useAuth } from "@/context/AuthContext";
import {
  autoProrateFuel,
  confirmFuelTicketProration,
  createFuelTicket,
  deleteConfirmedFuelTicketProration,
  deleteFuelTicket,
  fetchFuelProration,
  fetchFuelSummary,
  fetchFuelTickets,
  previewFuelImport,
  reopenFuelTicketProration,
  saveFuelTicketProrationAssignments,
  syncFuelTickets,
  updateFuelTicket,
} from "@/lib/tloApi";
import type {
  FuelImportPreviewResult,
  FuelImportPreviewTicket,
  FuelProrationReport,
  FuelProrationTripRef,
  FuelProrationUnitReport,
  FuelSummaryRow,
  FuelTicket,
  ProratedTicketBlock,
  ProratedTripRow,
} from "@/types/tlo";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
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
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { fmtMXN, fmtNumber, formatTripRoute } from "@/lib/format";
import { ArrowDown, ArrowUp, ArrowUpDown, Check, Download, Fuel, Pencil, Plus, RefreshCw, Trash2, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

function monthRange(): { inicio: string; fin: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const last = new Date(y, now.getMonth() + 1, 0).getDate();
  return { inicio: `${y}-${m}-01`, fin: `${y}-${m}-${String(last).padStart(2, "0")}` };
}

function formatIsoDateEs(iso: string): string {
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

type TicketAssignContext = {
  unit: FuelProrationUnitReport;
  block: ProratedTicketBlock;
};

type SortDirection = "asc" | "desc";

type ProrationTripSortColumn = "folio" | "ruta" | "fecha" | "km" | "litros" | "costo";

type ExtraTripSortColumn = "folio" | "ruta" | "fecha" | "km";

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

function getProratedTripSortValue(row: ProratedTripRow, column: ProrationTripSortColumn): string | number {
  switch (column) {
    case "folio":
      return row.folio;
    case "ruta":
      return formatTripRoute(row);
    case "fecha":
      return row.fecha_salida;
    case "km":
      return row.km_recorridos;
    case "litros":
      return row.litros_asignados;
    case "costo":
      return row.costo_asignado;
  }
}

function getExtraTripSortValue(row: FuelProrationTripRef, column: ExtraTripSortColumn): string | number {
  switch (column) {
    case "folio":
      return row.folio;
    case "ruta":
      return formatTripRoute(row);
    case "fecha":
      return row.fecha_salida;
    case "km":
      return row.km_recorridos;
  }
}

function SortableTableHead<C extends string>({
  label,
  column,
  activeColumn,
  direction,
  onSort,
  className,
}: {
  label: string;
  column: C;
  activeColumn: C | null;
  direction: SortDirection;
  onSort: (column: C) => void;
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

function useColumnSort<C extends string>(defaultColumn: C | null = null) {
  const [sortColumn, setSortColumn] = useState<C | null>(defaultColumn);
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  const onSort = useCallback((column: C) => {
    setSortColumn((prev) => {
      if (prev === column) {
        setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
        return prev;
      }
      setSortDirection("asc");
      return column;
    });
  }, []);

  return { sortColumn, sortDirection, onSort };
}

function ProrationTripsTable({
  viajes,
  showManualBadge = false,
}: {
  viajes: ProratedTripRow[];
  showManualBadge?: boolean;
}) {
  const { sortColumn, sortDirection, onSort } = useColumnSort<ProrationTripSortColumn>();

  const sortedViajes = useMemo(() => {
    if (!sortColumn) return viajes;
    return [...viajes].sort((a, b) => {
      const va = getProratedTripSortValue(a, sortColumn);
      const vb = getProratedTripSortValue(b, sortColumn);
      return compareSortValues(va, vb, sortDirection);
    });
  }, [viajes, sortColumn, sortDirection]);

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <SortableTableHead
            label="Folio"
            column="folio"
            activeColumn={sortColumn}
            direction={sortDirection}
            onSort={onSort}
          />
          <SortableTableHead
            label="Ruta"
            column="ruta"
            activeColumn={sortColumn}
            direction={sortDirection}
            onSort={onSort}
          />
          <SortableTableHead
            label="Fecha"
            column="fecha"
            activeColumn={sortColumn}
            direction={sortDirection}
            onSort={onSort}
          />
          <SortableTableHead
            label="Km"
            column="km"
            activeColumn={sortColumn}
            direction={sortDirection}
            onSort={onSort}
            className="text-right"
          />
          <SortableTableHead
            label="L asignados"
            column="litros"
            activeColumn={sortColumn}
            direction={sortDirection}
            onSort={onSort}
            className="text-right"
          />
          <SortableTableHead
            label="Costo"
            column="costo"
            activeColumn={sortColumn}
            direction={sortDirection}
            onSort={onSort}
            className="text-right"
          />
        </TableRow>
      </TableHeader>
      <TableBody>
        {sortedViajes.map((v) => (
          <TableRow key={v.trip_id}>
            <TableCell className="font-mono">
              <span>{v.folio}</span>
              {showManualBadge && v.asignacion_manual && (
                <Badge variant="outline" className="ml-2 text-[10px] px-1 py-0">
                  Manual
                </Badge>
              )}
            </TableCell>
            <TableCell>{formatTripRoute(v)}</TableCell>
            <TableCell>{formatIsoDateEs(v.fecha_salida)}</TableCell>
            <TableCell className="text-right">{fmtNumber(v.km_recorridos)}</TableCell>
            <TableCell className="text-right">{fmtNumber(v.litros_asignados, 2)}</TableCell>
            <TableCell className="text-right">{fmtMXN(v.costo_asignado)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function eligibleTripsForTicket(unit: FuelProrationUnitReport, block: ProratedTicketBlock): FuelProrationTripRef[] {
  const seen = new Set<string>();
  const rows: FuelProrationTripRef[] = [];
  for (const v of block.viajes) {
    if (seen.has(v.trip_id)) continue;
    seen.add(v.trip_id);
    rows.push({
      trip_id: v.trip_id,
      folio: v.folio,
      origen: v.origen,
      destino: v.destino,
      fecha_salida: v.fecha_salida,
      km_recorridos: v.km_recorridos,
    });
  }
  for (const v of unit.viajes_sin_asignar ?? []) {
    if (seen.has(v.trip_id)) continue;
    seen.add(v.trip_id);
    rows.push(v);
  }
  return rows.sort((a, b) => a.fecha_salida.localeCompare(b.fecha_salida) || a.folio.localeCompare(b.folio));
}

function TicketAssignDialog({
  context,
  open,
  saving,
  selectedTripIds,
  onToggleTrip,
  onClose,
  onSave,
}: {
  context: TicketAssignContext;
  open: boolean;
  saving: boolean;
  selectedTripIds: Set<string>;
  onToggleTrip: (tripId: string, checked: boolean) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  const { unit, block } = context;
  const trips = eligibleTripsForTicket(unit, block);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Asignar viajes — Ticket {formatIsoDateEs(block.fecha)} · {fmtNumber(block.litros, 2)} L
          </DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          Unidad {unit.numero_economico}. Marque los viajes que consumieron combustible de este ticket.
        </p>
        {trips.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No hay viajes con km disponibles para asignar a este ticket.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10" />
                <TableHead>Folio</TableHead>
                <TableHead>Ruta</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead className="text-right">Km</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {trips.map((trip) => (
                <TableRow key={trip.trip_id}>
                  <TableCell>
                    <Checkbox
                      checked={selectedTripIds.has(trip.trip_id)}
                      onCheckedChange={(checked) => onToggleTrip(trip.trip_id, checked === true)}
                    />
                  </TableCell>
                  <TableCell className="font-mono">{trip.folio}</TableCell>
                  <TableCell>{formatTripRoute(trip)}</TableCell>
                  <TableCell>{formatIsoDateEs(trip.fecha_salida)}</TableCell>
                  <TableCell className="text-right">{fmtNumber(trip.km_recorridos)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={onSave} disabled={saving}>
            {saving ? "Guardando…" : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ProrationExtraTripsTable({
  title,
  description,
  rows,
  variant,
}: {
  title: string;
  description: string;
  rows: FuelProrationTripRef[];
  variant: "warning" | "muted";
}) {
  const { sortColumn, sortDirection, onSort } = useColumnSort<ExtraTripSortColumn>();

  const sortedRows = useMemo(() => {
    if (!sortColumn) return rows;
    return [...rows].sort((a, b) => {
      const va = getExtraTripSortValue(a, sortColumn);
      const vb = getExtraTripSortValue(b, sortColumn);
      return compareSortValues(va, vb, sortDirection);
    });
  }, [rows, sortColumn, sortDirection]);

  if (rows.length === 0) return null;
  return (
    <Card className={`overflow-hidden ml-2 border-l-4 ${variant === "warning" ? "border-l-amber-500" : "border-l-muted-foreground/40"}`}>
      <div className={`px-4 py-3 text-sm ${variant === "warning" ? "bg-amber-500/10" : "bg-muted/40"}`}>
        <p className="font-semibold">{title}</p>
        <p className="text-muted-foreground text-xs mt-0.5">{description}</p>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <SortableTableHead
              label="Folio"
              column="folio"
              activeColumn={sortColumn}
              direction={sortDirection}
              onSort={onSort}
            />
            <SortableTableHead
              label="Ruta"
              column="ruta"
              activeColumn={sortColumn}
              direction={sortDirection}
              onSort={onSort}
            />
            <SortableTableHead
              label="Fecha"
              column="fecha"
              activeColumn={sortColumn}
              direction={sortDirection}
              onSort={onSort}
            />
            <SortableTableHead
              label="Km"
              column="km"
              activeColumn={sortColumn}
              direction={sortDirection}
              onSort={onSort}
              className="text-right"
            />
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedRows.map((v) => (
            <TableRow key={v.trip_id}>
              <TableCell className="font-mono">{v.folio}</TableCell>
              <TableCell>{formatTripRoute(v)}</TableCell>
              <TableCell>{formatIsoDateEs(v.fecha_salida)}</TableCell>
              <TableCell className="text-right">{fmtNumber(v.km_recorridos)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

const emptyTicket = (): Omit<FuelTicket, "id" | "numero_economico" | "placas"> => ({
  truck_id: "",
  fecha: new Date().toISOString().slice(0, 10),
  hora: "",
  folio: "",
  tag: "",
  odometro: 0,
  litros: 0,
  precio_litro: 0,
  importe_total: 0,
  ubicacion: "Gasolinera",
  origen: "manual",
});

type ImportReviewStatus = "pendiente" | "guardado" | "omitido";

type ImportReviewItem = {
  ticket: FuelImportPreviewTicket;
  status: ImportReviewStatus;
};

function downloadImportTemplate() {
  const headers = [
    "folio",
    "tag",
    "numero_economico",
    "fecha",
    "hora",
    "ruta",
    "odometro",
    "litros",
    "precio_litro",
    "importe_total",
  ];
  const sample = [
    "2758",
    "00B1E80D",
    "TN04",
    "2025-05-27",
    "08:09:19",
    "TLO",
    "589912",
    "259.101",
    "29.46",
    "7633.12",
  ];
  const csv = [headers.join(","), sample.join(",")].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "plantilla_combustibles.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export default function Combustibles() {
  const { trucks } = useTlo();
  const { hasPermission } = useAuth();
  const canCreate = hasPermission("combustibles.crear");
  const canImport = hasPermission("combustibles.importar");
  const canDelete = hasPermission("combustibles.eliminar");
  const isAdmin = hasPermission("usuarios.gestionar");

  const defaultRange = monthRange();
  const [inicio, setInicio] = useState(defaultRange.inicio);
  const [fin, setFin] = useState(defaultRange.fin);
  const [truckFilter, setTruckFilter] = useState<string>("all");

  const [tickets, setTickets] = useState<FuelTicket[]>([]);
  const [loadingTickets, setLoadingTickets] = useState(false);

  const [activeTab, setActiveTab] = useState("tickets");
  const [proration, setProration] = useState<FuelProrationReport | null>(null);
  const [loadingProration, setLoadingProration] = useState(false);
  const [autoProrating, setAutoProrating] = useState(false);

  const [confirmedProration, setConfirmedProration] = useState<FuelProrationReport | null>(null);
  const [loadingConfirmedProration, setLoadingConfirmedProration] = useState(false);

  const [summary, setSummary] = useState<FuelSummaryRow[]>([]);
  const [loadingSummary, setLoadingSummary] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(emptyTicket());
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const [importOpen, setImportOpen] = useState(false);
  const [importPreview, setImportPreview] = useState<FuelImportPreviewResult | null>(null);

  const [assignContext, setAssignContext] = useState<TicketAssignContext | null>(null);
  const [assignTripIds, setAssignTripIds] = useState<Set<string>>(new Set());
  const [savingAssign, setSavingAssign] = useState(false);
  const [reopenConfirmTicketId, setReopenConfirmTicketId] = useState<string | null>(null);
  const [reopeningTicketId, setReopeningTicketId] = useState<string | null>(null);
  const [deleteConfirmedTicketId, setDeleteConfirmedTicketId] = useState<string | null>(null);
  const [deletingConfirmedTicketId, setDeletingConfirmedTicketId] = useState<string | null>(null);
  const [confirmTicketId, setConfirmTicketId] = useState<string | null>(null);
  const [confirmingTicket, setConfirmingTicket] = useState(false);
  const [importReviewItems, setImportReviewItems] = useState<ImportReviewItem[]>([]);
  const [reviewTicketIndex, setReviewTicketIndex] = useState<number | null>(null);
  const [confirmingImportIndex, setConfirmingImportIndex] = useState<number | null>(null);
  const [confirmingAllImports, setConfirmingAllImports] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const activeTrucks = useMemo(() => trucks.filter((t) => t.estatus !== "baja"), [trucks]);

  const loadTickets = useCallback(
    async (range?: { inicio: string; fin: string }) => {
      const from = range?.inicio ?? inicio;
      const to = range?.fin ?? fin;
      setLoadingTickets(true);
      try {
        const rows = await fetchFuelTickets({
          truck_id: truckFilter === "all" ? undefined : truckFilter,
          inicio: from,
          fin: to,
        });
        setTickets(rows);
      } catch {
        toast.error("No se pudieron cargar los tickets");
      } finally {
        setLoadingTickets(false);
      }
    },
    [truckFilter, inicio, fin],
  );

  useEffect(() => {
    void loadTickets();
  }, [loadTickets]);

  const loadPendingProration = useCallback(async () => {
    setLoadingProration(true);
    try {
      const report = await fetchFuelProration(
        inicio,
        fin,
        "pendiente",
        truckFilter === "all" ? undefined : truckFilter,
      );
      setProration(report);
    } catch {
      toast.error("No se pudieron cargar los tickets pendientes");
    } finally {
      setLoadingProration(false);
    }
  }, [inicio, fin, truckFilter]);

  const loadConfirmedProration = useCallback(async () => {
    setLoadingConfirmedProration(true);
    try {
      const report = await fetchFuelProration(
        inicio,
        fin,
        "confirmado",
        truckFilter === "all" ? undefined : truckFilter,
      );
      setConfirmedProration(report);
    } catch {
      toast.error("No se pudieron cargar los prorrateos confirmados");
    } finally {
      setLoadingConfirmedProration(false);
    }
  }, [inicio, fin, truckFilter]);

  useEffect(() => {
    if (activeTab === "prorrateo") void loadPendingProration();
    if (activeTab === "confirmados") void loadConfirmedProration();
  }, [activeTab, loadPendingProration, loadConfirmedProration, truckFilter]);

  const loadSummary = useCallback(async () => {
    setLoadingSummary(true);
    try {
      const data = await fetchFuelSummary(inicio, fin);
      setSummary(data.unidades);
    } catch {
      toast.error("No se pudo cargar el resumen");
    } finally {
      setLoadingSummary(false);
    }
  }, [inicio, fin]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  const filteredSummary = useMemo(
    () => (truckFilter === "all" ? summary : summary.filter((r) => r.truck_id === truckFilter)),
    [summary, truckFilter],
  );

  const openAssignDialog = (unit: FuelProrationUnitReport, block: ProratedTicketBlock) => {
    const selected = new Set(block.viajes.map((v) => v.trip_id));
    setAssignContext({ unit, block });
    setAssignTripIds(selected);
  };

  const closeAssignDialog = () => {
    if (savingAssign) return;
    setAssignContext(null);
    setAssignTripIds(new Set());
  };

  const handleAssignTripToggle = (tripId: string, checked: boolean) => {
    setAssignTripIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(tripId);
      else next.delete(tripId);
      return next;
    });
  };

  const saveAssignDialog = async () => {
    if (!assignContext) return;
    setSavingAssign(true);
    try {
      const updated = await saveFuelTicketProrationAssignments(
        assignContext.block.ticket_id,
        inicio,
        fin,
        [...assignTripIds],
      );
      setProration((prev) =>
        prev
          ? { ...prev, unidades: prev.unidades.map((u) => (u.truck_id === updated.truck_id ? updated : u)) }
          : prev,
      );
      toast.success("Asignaciones guardadas");
      closeAssignDialog();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudieron guardar las asignaciones");
    } finally {
      setSavingAssign(false);
    }
  };

  const runAutoProrate = async () => {
    setAutoProrating(true);
    try {
      const report = await autoProrateFuel(inicio, fin);
      setProration(report);
      toast.success("Prorrateo automático aplicado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo prorratear automáticamente");
    } finally {
      setAutoProrating(false);
    }
  };

  const runConfirmTicket = async () => {
    if (!confirmTicketId) return;
    setConfirmingTicket(true);
    try {
      await confirmFuelTicketProration(confirmTicketId);
      toast.success("Ticket confirmado y archivado");
      setConfirmTicketId(null);
      await loadPendingProration();
      if (activeTab === "confirmados") await loadConfirmedProration();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo confirmar el ticket");
    } finally {
      setConfirmingTicket(false);
    }
  };

  const runReopenConfirmed = async () => {
    if (!reopenConfirmTicketId) return;
    setReopeningTicketId(reopenConfirmTicketId);
    try {
      await reopenFuelTicketProration(reopenConfirmTicketId);
      setReopenConfirmTicketId(null);
      setActiveTab("prorrateo");
      await loadPendingProration();
      void loadConfirmedProration();
      toast.success("Ticket reabierto. Puede modificar el prorrateo en la pestaña Prorrateo.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo reabrir el prorrateo");
    } finally {
      setReopeningTicketId(null);
    }
  };

  const runDeleteConfirmed = async () => {
    if (!deleteConfirmedTicketId) return;
    setDeletingConfirmedTicketId(deleteConfirmedTicketId);
    try {
      await deleteConfirmedFuelTicketProration(deleteConfirmedTicketId);
      toast.success("Ticket y prorrateo eliminados");
      setDeleteConfirmedTicketId(null);
      await loadConfirmedProration();
      void loadPendingProration();
      void loadTickets();
      void loadSummary();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo eliminar el ticket");
    } finally {
      setDeletingConfirmedTicketId(null);
    }
  };

  const openNew = () => {
    setEditId(null);
    setReviewTicketIndex(null);
    setForm({ ...emptyTicket(), truck_id: activeTrucks[0]?.id ?? "" });
    setDialogOpen(true);
  };

  const openEdit = (t: FuelTicket) => {
    setReviewTicketIndex(null);
    setEditId(t.id);
    setForm({
      truck_id: t.truck_id,
      fecha: t.fecha,
      hora: t.hora ?? "",
      folio: t.folio ?? "",
      tag: t.tag ?? "",
      odometro: t.odometro,
      litros: t.litros,
      precio_litro: t.precio_litro,
      importe_total: t.importe_total,
      ubicacion: t.ubicacion,
      origen: t.origen,
    });
    setDialogOpen(true);
  };

  const openImportReview = (ticket: FuelImportPreviewTicket, index: number) => {
    setEditId(null);
    setReviewTicketIndex(index);
    setForm({
      truck_id: ticket.truck_id,
      fecha: ticket.fecha,
      hora: ticket.hora ?? "",
      folio: ticket.folio,
      tag: ticket.tag ?? "",
      odometro: ticket.odometro,
      litros: ticket.litros,
      precio_litro: ticket.precio_litro,
      importe_total: ticket.importe_total,
      ubicacion: ticket.ubicacion,
      origen: "import_excel",
      external_id: ticket.external_id,
    });
    setDialogOpen(true);
  };

  const confirmImportRow = async (index: number) => {
    const item = importReviewItems[index];
    if (!item || item.status !== "pendiente") return;
    const ticket = item.ticket;
    if (!ticket.truck_id || ticket.litros <= 0 || ticket.precio_litro <= 0) {
      toast.error("Datos inválidos en la fila");
      return;
    }
    setConfirmingImportIndex(index);
    try {
      await createFuelTicket({
        truck_id: ticket.truck_id,
        fecha: ticket.fecha,
        hora: ticket.hora,
        folio: ticket.folio,
        tag: ticket.tag,
        odometro: ticket.odometro,
        litros: ticket.litros,
        precio_litro: ticket.precio_litro,
        importe_total: ticket.importe_total,
        ubicacion: ticket.ubicacion,
        origen: "import_excel",
        external_id: ticket.external_id,
      });
      setImportReviewItems((prev) =>
        prev.map((row, i) => (i === index ? { ...row, status: "guardado" } : row)),
      );
      toast.success(`Ticket fila ${ticket.fila} guardado`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar el ticket");
    } finally {
      setConfirmingImportIndex(null);
    }
  };

  const saveTicket = async () => {
    if (!form.truck_id || form.litros <= 0 || form.precio_litro <= 0) {
      toast.error("Completa camión, litros y precio");
      return;
    }
    try {
      const body = {
        ...form,
        hora: form.hora || null,
        folio: form.folio || null,
        tag: form.tag || null,
        importe_total: form.importe_total || form.litros * form.precio_litro,
      };
      if (reviewTicketIndex != null) {
        await createFuelTicket({
          ...body,
          origen: "import_excel",
          external_id: form.external_id ?? importReviewItems[reviewTicketIndex]?.ticket.external_id,
        });
        setImportReviewItems((prev) =>
          prev.map((item, i) => (i === reviewTicketIndex ? { ...item, status: "guardado" } : item)),
        );
        toast.success(`Ticket fila ${importReviewItems[reviewTicketIndex]?.ticket.fila} guardado`);
        setReviewTicketIndex(null);
        setDialogOpen(false);
        return;
      }
      if (editId) await updateFuelTicket(editId, body);
      else await createFuelTicket(body);
      toast.success(editId ? "Ticket actualizado" : "Ticket registrado");
      setDialogOpen(false);
      await loadTickets();
      void loadSummary();
      void loadPendingProration();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar el ticket");
    }
  };

  const runDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteFuelTicket(deleteId);
      toast.success("Ticket eliminado");
      setDeleteId(null);
      await loadTickets();
      void loadSummary();
      void loadPendingProration();
    } catch {
      toast.error("No se pudo eliminar");
    }
  };

  const onSyncProvider = async () => {
    setSyncing(true);
    try {
      const result = await syncFuelTickets({ inicio, fin });
      const imp = result.import;
      toast.success(
        imp
          ? `Sincronizado: ${imp.creados} nuevos, ${imp.duplicados} duplicados${result.unidades_con_tickets != null ? `, ${result.unidades_con_tickets} unidades` : ""}.`
          : "Sincronización completada.",
      );
      if (imp?.errores.length) {
        toast.warning(`${imp.errores.length} fila(s) con error en el archivo del proveedor.`);
      }
      await loadTickets();
      void loadSummary();
      void loadPendingProration();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al sincronizar con el proveedor");
    } finally {
      setSyncing(false);
    }
  };

  const omitImportRow = (index: number) => {
    setImportReviewItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, status: "omitido" } : item)),
    );
  };

  const omitImportRowAndClose = () => {
    if (reviewTicketIndex == null) return;
    omitImportRow(reviewTicketIndex);
    setReviewTicketIndex(null);
    setDialogOpen(false);
  };

  const confirmAllPendingImportRows = async () => {
    const pendingIndices = importReviewItems
      .map((item, index) => (item.status === "pendiente" ? index : -1))
      .filter((index) => index >= 0);
    if (pendingIndices.length === 0) return;

    setConfirmingAllImports(true);
    let saved = 0;
    let failed = 0;
    const nextItems = [...importReviewItems];

    for (const index of pendingIndices) {
      const ticket = nextItems[index]!.ticket;
      if (!ticket.truck_id || ticket.litros <= 0 || ticket.precio_litro <= 0) {
        failed++;
        continue;
      }
      try {
        await createFuelTicket({
          truck_id: ticket.truck_id,
          fecha: ticket.fecha,
          hora: ticket.hora,
          folio: ticket.folio,
          tag: ticket.tag,
          odometro: ticket.odometro,
          litros: ticket.litros,
          precio_litro: ticket.precio_litro,
          importe_total: ticket.importe_total,
          ubicacion: ticket.ubicacion,
          origen: "import_excel",
          external_id: ticket.external_id,
        });
        nextItems[index] = { ...nextItems[index]!, status: "guardado" };
        saved++;
      } catch {
        failed++;
      }
    }

    setImportReviewItems(nextItems);
    setConfirmingAllImports(false);
    if (saved > 0) toast.success(`${saved} ticket(s) guardados`);
    if (failed > 0) toast.warning(`${failed} ticket(s) no se pudieron guardar`);
  };

  const handleImportOpenChange = (open: boolean) => {
    if (!open && (importPreview || importReviewItems.length > 0)) {
      const saved = importReviewItems.filter((i) => i.status === "guardado").length;
      const omitted = importReviewItems.filter((i) => i.status === "omitido").length;
      const fileErrors = importPreview?.errores.length ?? 0;

      if (saved > 0) {
        const range =
          importPreview?.inicio && importPreview?.fin
            ? { inicio: importPreview.inicio, fin: importPreview.fin }
            : undefined;
        if (range) {
          setInicio(range.inicio);
          setFin(range.fin);
          toast.info(
            `Filtro ajustado al periodo del reporte (${formatIsoDateEs(range.inicio)} – ${formatIsoDateEs(range.fin)})`,
          );
        }
        void loadTickets(range);
        if (range) {
          void fetchFuelSummary(range.inicio, range.fin).then((data) => setSummary(data.unidades));
          void fetchFuelProration(range.inicio, range.fin, "pendiente").then(setProration);
        } else {
          void loadSummary();
          void loadPendingProration();
        }
      }

      if (saved > 0 || omitted > 0 || fileErrors > 0) {
        toast.info(`${saved} guardados · ${omitted} omitidos · ${fileErrors} errores en archivo`);
      }

      setImportPreview(null);
      setImportReviewItems([]);
    }
    setImportOpen(open);
  };

  const onImportFile = async (file: File) => {
    setImporting(true);
    setImportPreview(null);
    setImportReviewItems([]);
    try {
      const result = await previewFuelImport(file);
      setImportPreview(result);
      setImportReviewItems(result.tickets.map((ticket) => ({ ticket, status: "pendiente" })));

      const catalogError = result.errores.find(
        (e) => e.fila === 0 && e.mensaje.startsWith("Catálogo de camiones ambiguo"),
      );
      if (catalogError) {
        toast.error(catalogError.mensaje);
      } else if (result.tickets.length > 0) {
        toast.info(`${result.tickets.length} ticket(s) listos para revisar`);
      } else if (result.errores.length > 0) {
        toast.warning("Sin tickets válidos; revisa los errores.");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al importar archivo");
    } finally {
      setImporting(false);
    }
  };

  const importReviewPendingCount = importReviewItems.filter((i) => i.status === "pendiente").length;

  const dateFilters = (
    <div className="flex flex-wrap gap-3 items-end">
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Desde</Label>
        <Input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Hasta</Label>
        <Input type="date" value={fin} onChange={(e) => setFin(e.target.value)} />
      </div>
    </div>
  );

  const truckFilterSelect = (
    <div className="space-y-1 min-w-[160px]">
      <Label className="text-xs text-muted-foreground">Unidad</Label>
      <Select value={truckFilter} onValueChange={setTruckFilter}>
        <SelectTrigger>
          <SelectValue placeholder="Todas" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todas las unidades</SelectItem>
          {activeTrucks.map((t) => (
            <SelectItem key={t.id} value={t.id}>
              {t.numero_economico} — {t.placas}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Fuel className="h-5 w-5" /> Combustibles y prorrateo
          </h2>
          <p className="text-sm text-muted-foreground">
            Tickets de carga por unidad y reparto de litros entre viajes por kilómetros.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canImport && (
            <>
              <Button variant="outline" size="sm" onClick={() => void onSyncProvider()} disabled={syncing}>
                <RefreshCw className={`h-4 w-4 mr-1 ${syncing ? "animate-spin" : ""}`} />
                {syncing ? "Sincronizando…" : "Descargar del proveedor"}
              </Button>
              <Button variant="outline" size="sm" onClick={downloadImportTemplate}>
                <Download className="h-4 w-4 mr-1" /> Plantilla
              </Button>
              <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
                <Upload className="h-4 w-4 mr-1" /> Importar Excel
              </Button>
            </>
          )}
          {canCreate && (
            <Button size="sm" onClick={openNew}>
              <Plus className="h-4 w-4 mr-1" /> Agregar ticket
            </Button>
          )}
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="tickets">Tickets</TabsTrigger>
          <TabsTrigger value="prorrateo">Prorrateo</TabsTrigger>
          <TabsTrigger value="confirmados">Prorrateos confirmados</TabsTrigger>
          <TabsTrigger value="resumen">Resumen mensual</TabsTrigger>
        </TabsList>

        <TabsContent value="tickets" className="space-y-4 mt-4">
          <Card className="p-4 space-y-3">
            <div className="flex flex-wrap gap-3 items-end">
              {dateFilters}
              {truckFilterSelect}
              <Button variant="secondary" onClick={() => void loadTickets()} disabled={loadingTickets}>
                Actualizar
              </Button>
            </div>
          </Card>

          <Card className="tlo-shadow-md overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-secondary/50">
                  <TableHead>Fecha</TableHead>
                  <TableHead>Folio/Tag</TableHead>
                  <TableHead>Unidad</TableHead>
                  <TableHead className="text-right">Odómetro</TableHead>
                  <TableHead className="text-right">Litros</TableHead>
                  <TableHead className="text-right">Precio/L</TableHead>
                  <TableHead className="text-right">Importe</TableHead>
                  <TableHead>Origen</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingTickets ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                      Cargando…
                    </TableCell>
                  </TableRow>
                ) : tickets.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                      Sin tickets en el período
                    </TableCell>
                  </TableRow>
                ) : (
                  tickets.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell>{formatIsoDateEs(t.fecha)}</TableCell>
                      <TableCell className="font-mono text-sm">
                        {t.folio ?? "—"}
                        {t.tag ? (
                          <span className="text-muted-foreground text-xs block">{t.tag}</span>
                        ) : null}
                      </TableCell>
                      <TableCell className="font-mono font-medium">
                        {t.numero_economico ?? "—"}
                        <span className="text-muted-foreground text-xs block">{t.placas}</span>
                      </TableCell>
                      <TableCell className="text-right">{fmtNumber(t.odometro)}</TableCell>
                      <TableCell className="text-right">{fmtNumber(t.litros, 2)}</TableCell>
                      <TableCell className="text-right">{fmtMXN(t.precio_litro)}</TableCell>
                      <TableCell className="text-right">{fmtMXN(t.importe_total)}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{t.origen}</Badge>
                      </TableCell>
                      <TableCell className="text-right space-x-1">
                        {canCreate && (
                          <Button variant="ghost" size="icon" onClick={() => openEdit(t)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                        {canDelete && (
                          <Button variant="ghost" size="icon" onClick={() => setDeleteId(t.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="prorrateo" className="space-y-4 mt-4">
          <Card className="p-4">
            <div className="flex flex-wrap gap-3 items-end">
              {dateFilters}
              {truckFilterSelect}
              <Button variant="secondary" onClick={() => void loadPendingProration()} disabled={loadingProration}>
                Actualizar
              </Button>
              {canCreate && (
                <Button
                  variant="secondary"
                  onClick={() => void runAutoProrate()}
                  disabled={autoProrating || loadingProration}
                >
                  {autoProrating ? "Prorrateando…" : "Prorratear automáticamente"}
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              Solo se muestran tickets sin confirmar. Use &quot;Prorratear automáticamente&quot; o edite cada ticket
              manualmente; al confirmar, el prorrateo se guarda y el ticket desaparece de esta vista.
            </p>
          </Card>

          {loadingProration && (
            <p className="text-sm text-muted-foreground text-center py-6">Calculando todas las unidades…</p>
          )}

          {proration && !loadingProration && proration.unidades.length === 0 && (
            <p className="text-muted-foreground text-center py-6">
              No hay tickets de combustible en el período seleccionado.
            </p>
          )}

          {proration &&
            !loadingProration &&
            proration.unidades.map((unit) => (
              <div key={unit.truck_id} className="space-y-3 mb-6">
                <Card className="p-4 flex flex-wrap gap-6 text-sm border-l-4 border-l-primary">
                  <div>
                    <span className="text-muted-foreground">Unidad</span>
                    <p className="font-semibold font-mono text-lg">{unit.numero_economico}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Litros (período)</span>
                    <p className="font-semibold">{fmtNumber(unit.resumen.total_litros, 2)} L</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Km prorrateados</span>
                    <p className="font-semibold">{fmtNumber(unit.resumen.total_km_viajes)} km</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Viajes prorrateados</span>
                    <p className="font-semibold">{unit.resumen.total_viajes}</p>
                    {unit.resumen.viajes_en_periodo !== unit.resumen.total_viajes && (
                      <p className="text-xs text-muted-foreground">
                        {unit.resumen.viajes_en_periodo} en el período
                      </p>
                    )}
                  </div>
                  {(unit.resumen.viajes_sin_asignar > 0 || unit.resumen.viajes_sin_km > 0) && (
                    <div>
                      <span className="text-muted-foreground">Pendientes</span>
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {unit.resumen.viajes_sin_asignar > 0 && (
                          <Badge variant="outline" className="border-amber-500/60 text-amber-700 dark:text-amber-400">
                            {unit.resumen.viajes_sin_asignar} sin ticket
                          </Badge>
                        )}
                        {unit.resumen.viajes_sin_km > 0 && (
                          <Badge variant="outline">
                            {unit.resumen.viajes_sin_km} sin km
                          </Badge>
                        )}
                      </div>
                    </div>
                  )}
                  <div>
                    <span className="text-muted-foreground">Rendimiento</span>
                    <p className="font-semibold">
                      {unit.resumen.rendimiento != null
                        ? `${fmtNumber(unit.resumen.rendimiento, 2)} km/L`
                        : "—"}
                    </p>
                  </div>
                </Card>

                {unit.tickets.map((block) => (
                  <Card key={block.ticket_id} className="overflow-hidden ml-2">
                    <div className="bg-secondary/40 px-4 py-3 flex flex-wrap justify-between gap-2 text-sm">
                      <div>
                        <span className="font-semibold">
                          Ticket {formatIsoDateEs(block.fecha)}
                        </span>
                        <span className="text-muted-foreground ml-2">
                          {fmtNumber(block.litros, 2)} L · {fmtMXN(block.importe_total)} · odómetro{" "}
                          {fmtNumber(block.odometro)}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-3">
                        {block.sin_asignar ? (
                          <Badge variant="destructive">Sin viajes asignados</Badge>
                        ) : (
                          <>
                            <span>{fmtNumber(block.km_total_periodo)} km</span>
                            <span className="font-medium">
                              {block.rendimiento_periodo != null
                                ? `${fmtNumber(block.rendimiento_periodo, 2)} km/L`
                                : "—"}
                            </span>
                          </>
                        )}
                        {canCreate && (
                          <>
                            <Button variant="outline" size="sm" onClick={() => openAssignDialog(unit, block)}>
                              <Pencil className="h-4 w-4 mr-1.5" />
                              Editar
                            </Button>
                            <Button
                              variant="default"
                              size="sm"
                              disabled={block.sin_asignar}
                              onClick={() => setConfirmTicketId(block.ticket_id)}
                            >
                              <Check className="h-4 w-4 mr-1.5" />
                              Confirmar
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                    {block.viajes.length > 0 && (
                      <ProrationTripsTable viajes={block.viajes} showManualBadge />
                    )}
                  </Card>
                ))}

                <ProrationExtraTripsTable
                  title="Viajes sin prorratear"
                  description="Tienen km registrado en el período pero no caen en la ventana de ningún ticket de combustible."
                  rows={unit.viajes_sin_asignar ?? []}
                  variant="warning"
                />
                <ProrationExtraTripsTable
                  title="Viajes sin km (no prorrateables)"
                  description="Viajes en el período sin km final; no reciben litros hasta cerrarse."
                  rows={unit.viajes_sin_km ?? []}
                  variant="muted"
                />
              </div>
            ))}

        </TabsContent>

        <TabsContent value="confirmados" className="space-y-4 mt-4">
          <Card className="p-4 flex flex-wrap gap-3 items-end">
            {dateFilters}
            {truckFilterSelect}
            <Button
              variant="secondary"
              onClick={() => void loadConfirmedProration()}
              disabled={loadingConfirmedProration}
            >
              Actualizar
            </Button>
          </Card>

          {loadingConfirmedProration && (
            <p className="text-sm text-muted-foreground text-center py-6">Cargando prorrateos confirmados…</p>
          )}

          {confirmedProration && !loadingConfirmedProration && confirmedProration.unidades.length === 0 && (
            <p className="text-muted-foreground text-center py-6">
              No hay tickets confirmados en el período seleccionado.
            </p>
          )}

          {confirmedProration &&
            !loadingConfirmedProration &&
            confirmedProration.unidades.map((unit) => (
              <div key={unit.truck_id} className="space-y-3 mb-6">
                <Card className="p-4 flex flex-wrap gap-6 text-sm border-l-4 border-l-green-600">
                  <div>
                    <span className="text-muted-foreground">Unidad</span>
                    <p className="font-semibold font-mono text-lg">{unit.numero_economico}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Litros (período)</span>
                    <p className="font-semibold">{fmtNumber(unit.resumen.total_litros, 2)} L</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Km prorrateados</span>
                    <p className="font-semibold">{fmtNumber(unit.resumen.total_km_viajes)} km</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Viajes prorrateados</span>
                    <p className="font-semibold">{unit.resumen.total_viajes}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Rendimiento</span>
                    <p className="font-semibold">
                      {unit.resumen.rendimiento != null
                        ? `${fmtNumber(unit.resumen.rendimiento, 2)} km/L`
                        : "—"}
                    </p>
                  </div>
                </Card>

                {unit.tickets.map((block) => (
                  <Card key={block.ticket_id} className="overflow-hidden ml-2">
                    <div className="bg-green-500/10 px-4 py-3 flex flex-wrap justify-between gap-2 text-sm">
                      <div>
                        <span className="font-semibold">Ticket {formatIsoDateEs(block.fecha)}</span>
                        <span className="text-muted-foreground ml-2">
                          {fmtNumber(block.litros, 2)} L · {fmtMXN(block.importe_total)} · odómetro{" "}
                          {fmtNumber(block.odometro)}
                        </span>
                        {block.prorrateo_confirmado_at && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Confirmado {formatIsoDateEs(block.prorrateo_confirmado_at.slice(0, 10))}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-3">
                        <span>{fmtNumber(block.km_total_periodo)} km</span>
                        <span className="font-medium">
                          {block.rendimiento_periodo != null
                            ? `${fmtNumber(block.rendimiento_periodo, 2)} km/L`
                            : "—"}
                        </span>
                        {canDelete && (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={reopeningTicketId === block.ticket_id}
                            onClick={() => setReopenConfirmTicketId(block.ticket_id)}
                          >
                            <Pencil className="h-4 w-4 mr-1.5" />
                            Editar
                          </Button>
                        )}
                        {isAdmin && (
                          <Button
                            variant="ghost"
                            size="icon"
                            disabled={deletingConfirmedTicketId === block.ticket_id}
                            onClick={() => setDeleteConfirmedTicketId(block.ticket_id)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </div>
                    {block.viajes.length > 0 && <ProrationTripsTable viajes={block.viajes} />}
                  </Card>
                ))}
              </div>
            ))}
        </TabsContent>

        <TabsContent value="resumen" className="space-y-4 mt-4">
          <Card className="p-4 flex flex-wrap gap-3 items-end">
            {dateFilters}
            {truckFilterSelect}
            <Button variant="secondary" onClick={() => void loadSummary()} disabled={loadingSummary}>
              Actualizar
            </Button>
          </Card>
          <Card className="tlo-shadow-md overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-secondary/50">
                  <TableHead>No. económico</TableHead>
                  <TableHead>Placas</TableHead>
                  <TableHead className="text-right">Viajes</TableHead>
                  <TableHead className="text-right">Km</TableHead>
                  <TableHead className="text-right">Litros</TableHead>
                  <TableHead className="text-right">Rendimiento</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingSummary ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      Cargando…
                    </TableCell>
                  </TableRow>
                ) : filteredSummary.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      Sin datos en el período
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredSummary.map((row) => (
                    <TableRow key={row.truck_id}>
                      <TableCell className="font-mono font-semibold">{row.numero_economico}</TableCell>
                      <TableCell>{row.placas}</TableCell>
                      <TableCell className="text-right">{row.viajes}</TableCell>
                      <TableCell className="text-right">{fmtNumber(row.km_recorridos)}</TableCell>
                      <TableCell className="text-right">{fmtNumber(row.litros, 2)}</TableCell>
                      <TableCell className="text-right">
                        {row.rendimiento != null ? `${fmtNumber(row.rendimiento, 2)} km/L` : "—"}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open) setReviewTicketIndex(null);
          setDialogOpen(open);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {reviewTicketIndex != null
                ? `Editar ticket importado (fila ${importReviewItems[reviewTicketIndex]?.ticket.fila ?? "—"})`
                : editId
                  ? "Editar ticket"
                  : "Nuevo ticket de combustible"}
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            <div className="col-span-2 space-y-1">
              <Label>Unidad</Label>
              <Select value={form.truck_id} onValueChange={(v) => setForm({ ...form, truck_id: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {activeTrucks.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.numero_economico} — {t.placas}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Fecha</Label>
              <Input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Odómetro</Label>
              <Input
                type="number"
                value={form.odometro || ""}
                onChange={(e) => setForm({ ...form, odometro: +e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Folio</Label>
              <Input value={form.folio ?? ""} onChange={(e) => setForm({ ...form, folio: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>TAG</Label>
              <Input value={form.tag ?? ""} onChange={(e) => setForm({ ...form, tag: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Litros</Label>
              <Input
                type="number"
                step="0.01"
                value={form.litros || ""}
                onChange={(e) => setForm({ ...form, litros: +e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Precio / L</Label>
              <Input
                type="number"
                step="0.0001"
                value={form.precio_litro || ""}
                onChange={(e) => setForm({ ...form, precio_litro: +e.target.value })}
              />
            </div>
            <div className="col-span-2 space-y-1">
              <Label>Ubicación</Label>
              <Input value={form.ubicacion} onChange={(e) => setForm({ ...form, ubicacion: e.target.value })} />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:justify-between">
            {reviewTicketIndex != null ? (
              <>
                <Button variant="ghost" onClick={omitImportRowAndClose}>
                  Omitir
                </Button>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setReviewTicketIndex(null);
                      setDialogOpen(false);
                    }}
                  >
                    Cancelar
                  </Button>
                  <Button onClick={() => void saveTicket()}>Guardar</Button>
                </div>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button onClick={() => void saveTicket()}>Guardar</Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={importOpen} onOpenChange={handleImportOpenChange}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Importar consumos (Excel / CSV)</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Compatible con reporte Tothem: Folio, Tag, Numero Econ, Fecha, Hora, Ruta (ubicación), Odometro,
              Litros, Precio por litro, Importe. Se omiten Id Tothem, descripción corta y tag despachado.
            </p>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onImportFile(f);
                e.target.value = "";
              }}
            />
            <div
              className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:bg-muted/50"
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files[0];
                if (f) void onImportFile(f);
              }}
            >
              <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm">{importing ? "Analizando archivo…" : "Arrastra un archivo o haz clic"}</p>
            </div>
            {importPreview && (
              <div className="text-sm space-y-3 rounded-md border p-3 bg-muted/30">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p>
                    <strong>{importReviewItems.length}</strong> listos para revisar ·{" "}
                    <strong>{importPreview.errores.length}</strong> errores
                    {importPreview.inicio && importPreview.fin && (
                      <>
                        {" "}
                        · periodo {formatIsoDateEs(importPreview.inicio)} –{" "}
                        {formatIsoDateEs(importPreview.fin)}
                      </>
                    )}
                  </p>
                  {importReviewPendingCount > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={confirmingAllImports || confirmingImportIndex != null}
                      onClick={() => void confirmAllPendingImportRows()}
                    >
                      {confirmingAllImports ? "Confirmando…" : "Confirmar todos"}
                    </Button>
                  )}
                </div>
                {importPreview.errores.some((e) => e.fila === 0) && (
                  <div className="rounded border border-destructive/50 bg-destructive/10 p-2 text-destructive text-xs">
                    {importPreview.errores
                      .filter((e) => e.fila === 0)
                      .map((err, i) => (
                        <p key={i}>{err.mensaje}</p>
                      ))}
                  </div>
                )}
                {importPreview.errores.some((e) => e.fila > 0) && (
                  <ul className="max-h-32 overflow-auto text-destructive text-xs list-disc pl-4">
                    {importPreview.errores
                      .filter((e) => e.fila > 0)
                      .map((err, i) => (
                        <li key={i}>
                          Fila {err.fila}: {err.mensaje}
                        </li>
                      ))}
                  </ul>
                )}
                {importReviewItems.length > 0 && (
                  <div className="overflow-x-auto rounded-md border bg-background">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Fila</TableHead>
                          <TableHead>Fecha</TableHead>
                          <TableHead>Folio/TAG</TableHead>
                          <TableHead>Unidad</TableHead>
                          <TableHead className="text-right">Litros</TableHead>
                          <TableHead className="text-right">Importe</TableHead>
                          <TableHead>Estado</TableHead>
                          <TableHead></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {importReviewItems.map((item, index) => (
                          <TableRow
                            key={`${item.ticket.fila}-${item.ticket.folio}`}
                            className={item.status !== "pendiente" ? "opacity-60" : undefined}
                          >
                            <TableCell>{item.ticket.fila}</TableCell>
                            <TableCell>{formatIsoDateEs(item.ticket.fecha)}</TableCell>
                            <TableCell className="font-mono text-sm">
                              {item.ticket.folio}
                              {item.ticket.tag ? (
                                <span className="text-muted-foreground text-xs block">{item.ticket.tag}</span>
                              ) : null}
                            </TableCell>
                            <TableCell className="font-mono">
                              {item.ticket.numero_economico}
                              <span className="text-muted-foreground text-xs block">{item.ticket.placas}</span>
                            </TableCell>
                            <TableCell className="text-right">{fmtNumber(item.ticket.litros, 2)}</TableCell>
                            <TableCell className="text-right">{fmtMXN(item.ticket.importe_total)}</TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-1">
                                {item.status === "pendiente" && (
                                  <Badge variant="outline">Pendiente</Badge>
                                )}
                                {item.status === "guardado" && (
                                  <Badge variant="secondary">Guardado</Badge>
                                )}
                                {item.status === "omitido" && (
                                  <Badge variant="outline" className="text-muted-foreground">
                                    Omitido
                                  </Badge>
                                )}
                                {item.ticket.posible_duplicado && item.status === "pendiente" && (
                                  <Badge variant="outline" className="border-amber-500/60 text-amber-700 dark:text-amber-400">
                                    Duplicado
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-right space-x-1">
                              {item.status === "pendiente" && canCreate && (
                                <>
                                  <Button
                                    size="sm"
                                    disabled={confirmingImportIndex === index || confirmingAllImports}
                                    onClick={() => void confirmImportRow(index)}
                                  >
                                    {confirmingImportIndex === index ? "Guardando…" : "Confirmar"}
                                  </Button>
                                  <Button variant="outline" size="sm" onClick={() => openImportReview(item.ticket, index)}>
                                    Editar
                                  </Button>
                                </>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {assignContext && (
        <TicketAssignDialog
          context={assignContext}
          open={!!assignContext}
          saving={savingAssign}
          selectedTripIds={assignTripIds}
          onToggleTrip={handleAssignTripToggle}
          onClose={closeAssignDialog}
          onSave={() => void saveAssignDialog()}
        />
      )}

      <AlertDialog open={!!confirmTicketId} onOpenChange={(o) => !o && !confirmingTicket && setConfirmTicketId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Confirmar prorrateo del ticket?</AlertDialogTitle>
            <AlertDialogDescription>
              Se guardará el prorrateo con los viajes asignados y el ticket dejará de aparecer en pendientes. Esta
              acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={confirmingTicket}>Cancelar</AlertDialogCancel>
            <Button onClick={() => void runConfirmTicket()} disabled={confirmingTicket}>
              {confirmingTicket ? "Confirmando…" : "Confirmar"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar ticket?</AlertDialogTitle>
            <AlertDialogDescription>Esta acción no se puede deshacer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <Button variant="destructive" onClick={() => void runDelete()}>
              Eliminar
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!reopenConfirmTicketId}
        onOpenChange={(o) => !o && !reopeningTicketId && setReopenConfirmTicketId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Reabrir prorrateo confirmado?</AlertDialogTitle>
            <AlertDialogDescription>
              El ticket volverá a la pestaña Prorrateo como pendiente. Podrá modificar las asignaciones de viajes y
              guardar los cambios antes de confirmarlo de nuevo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!reopeningTicketId}>Cancelar</AlertDialogCancel>
            <Button onClick={() => void runReopenConfirmed()} disabled={!!reopeningTicketId}>
              {reopeningTicketId ? "Reabriendo…" : "Reabrir y editar"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!deleteConfirmedTicketId}
        onOpenChange={(o) => !o && !deletingConfirmedTicketId && setDeleteConfirmedTicketId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar ticket y prorrateo confirmado?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará el ticket de combustible, las cargas registradas en los viajes y las asignaciones de
              prorrateo. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!deletingConfirmedTicketId}>Cancelar</AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={() => void runDeleteConfirmed()}
              disabled={!!deletingConfirmedTicketId}
            >
              {deletingConfirmedTicketId ? "Eliminando…" : "Eliminar ticket"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
