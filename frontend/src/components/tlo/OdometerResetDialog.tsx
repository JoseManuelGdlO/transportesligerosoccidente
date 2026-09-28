import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  createTruckOdometerReset,
  deleteTruckOdometerReset,
  fetchOdometerResetPreview,
  fetchTruckOdometerResets,
} from "@/lib/tloApi";
import { fmtDateTime, fmtNumber, parseDateOnlyLocal } from "@/lib/format";
import { chainError, linkChain, type ChainDraft } from "@/lib/odometerResetChain";
import type { OdometerResetAffectedTrip, OdometerResetPreview, TruckOdometerReset } from "@/types/tlo";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  truckId: string;
  numeroEconomico: string;
  onApplied?: () => void;
};

type Step = "fecha" | "cadena";

type DraftRow = ChainDraft & {
  origen: string;
  destino: string;
  fecha_salida: string;
  kmInicialActual: number;
  kmFinalActual: number | null;
};

function todayDateInput(): string {
  const d = new Date();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

function dateInputToIso(value: string): string | null {
  const local = parseDateOnlyLocal(value);
  if (!local) return null;
  return local.toISOString();
}

function draftsFromAffected(affected: OdometerResetAffectedTrip[], newKm: number): DraftRow[] {
  return affected.map((trip, index) => ({
    id: trip.id,
    folio: trip.folio,
    origen: trip.origen,
    destino: trip.destino,
    fecha_salida: trip.fecha_salida,
    cerrado: trip.cerrado,
    kmInicialActual: trip.km_inicial,
    kmFinalActual: trip.km_final,
    kmInicial: index === 0 ? newKm : Number.NaN,
    kmFinal: "",
  }));
}

export function OdometerResetDialog({
  open,
  onOpenChange,
  truckId,
  numeroEconomico,
  onApplied,
}: Props) {
  const [step, setStep] = useState<Step>("fecha");
  const [effectiveDate, setEffectiveDate] = useState(todayDateInput);
  const [newKm, setNewKm] = useState("");
  const [motivo, setMotivo] = useState("");
  const [preview, setPreview] = useState<OdometerResetPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [resets, setResets] = useState<TruckOdometerReset[]>([]);
  const [rows, setRows] = useState<DraftRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const linked = useMemo(() => linkChain(rows), [rows]);

  const loadResets = useCallback(async () => {
    const list = await fetchTruckOdometerResets(truckId);
    setResets(
      [...list].sort((a, b) => new Date(b.effective_at).getTime() - new Date(a.effective_at).getTime()),
    );
  }, [truckId]);

  const loadPreview = useCallback(
    async (dateValue: string) => {
      const iso = dateInputToIso(dateValue);
      if (!iso) {
        setPreview(null);
        return;
      }
      setPreviewLoading(true);
      try {
        setPreview(await fetchOdometerResetPreview(truckId, iso));
      } catch (e) {
        setPreview(null);
        toast.error(e instanceof Error ? e.message : "No se pudieron cargar los viajes afectados");
      } finally {
        setPreviewLoading(false);
      }
    },
    [truckId],
  );

  useEffect(() => {
    if (!open) return;
    setStep("fecha");
    setEffectiveDate(todayDateInput());
    setNewKm("");
    setMotivo("");
    setRows([]);
    setPreview(null);
    void loadResets().catch((e) => {
      toast.error(e instanceof Error ? e.message : "No se pudieron cargar reinicios previos");
    });
  }, [open, loadResets]);

  useEffect(() => {
    if (!open || step !== "fecha") return;
    void loadPreview(effectiveDate);
  }, [open, step, effectiveDate, loadPreview]);

  const parsedNewKm = Number(newKm);
  const newKmValid = newKm.trim() !== "" && Number.isInteger(parsedNewKm) && parsedNewKm >= 0;

  const openChain = () => {
    if (!newKmValid) {
      toast.error("Indica el kilometraje nuevo (entero, 0 o mayor)");
      return;
    }
    if (motivo.trim().length < 3) {
      toast.error("El motivo debe tener al menos 3 caracteres");
      return;
    }
    if (!preview || preview.blocked_reason) return;
    setRows(draftsFromAffected(preview.affected, parsedNewKm));
    setStep("cadena");
  };

  const save = async (adjustments: DraftRow[]) => {
    const iso = dateInputToIso(effectiveDate);
    if (!iso) {
      toast.error("La fecha no es válida");
      return;
    }
    if (adjustments.length === 0 && !newKmValid) {
      toast.error("Indica el kilometraje nuevo (entero, 0 o mayor)");
      return;
    }
    const startKm = adjustments[0]?.kmInicial ?? parsedNewKm;
    if (!Number.isInteger(startKm) || startKm < 0) {
      toast.error("Indica el kilometraje nuevo (entero, 0 o mayor)");
      return;
    }
    if (motivo.trim().length < 3) {
      toast.error("El motivo debe tener al menos 3 caracteres");
      return;
    }
    const error = adjustments.length > 0 ? chainError(adjustments) : null;
    if (error) {
      toast.error(error);
      return;
    }
    const linkedRows = linkChain(adjustments);
    setSaving(true);
    try {
      await createTruckOdometerReset(truckId, {
        effective_at: iso,
        new_km: startKm,
        motivo: motivo.trim(),
        adjustments: linkedRows.map((row) => ({
          trip_id: row.id,
          km_inicial: row.kmInicial,
          km_final: row.cerrado ? Number(row.kmFinal) : null,
        })),
      });
      toast.success("Kilometraje reiniciado");
      onApplied?.();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo registrar el reinicio");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (resetId: string) => {
    setDeletingId(resetId);
    try {
      await deleteTruckOdometerReset(truckId, resetId);
      toast.success("Reinicio eliminado");
      await loadResets();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo eliminar el reinicio");
    } finally {
      setDeletingId(null);
    }
  };

  const affected = preview?.affected ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Reiniciar kilometraje</DialogTitle>
          <DialogDescription>
            Unidad <span className="font-mono text-foreground">{numeroEconomico}</span>. Los viajes anteriores a la
            fecha conservan su kilometraje. Desde esa fecha ajustas la cadena nueva.
          </DialogDescription>
        </DialogHeader>

        {step === "fecha" ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="odometer-reset-date">Fecha desde la que aplica</Label>
                <Input
                  id="odometer-reset-date"
                  type="date"
                  value={effectiveDate}
                  onChange={(e) => setEffectiveDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="odometer-reset-new-km">Nuevo kilometraje inicial</Label>
                <Input
                  id="odometer-reset-new-km"
                  type="number"
                  min={0}
                  step={1}
                  inputMode="numeric"
                  value={newKm}
                  onChange={(e) => setNewKm(e.target.value)}
                  placeholder="Ej. 1221"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="odometer-reset-motivo">Motivo</Label>
              <Textarea
                id="odometer-reset-motivo"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Ej. el hubodómetro de la llanta es más exacto que el tablero"
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">Viajes que se van a afectar</p>
              {previewLoading ? (
                <p className="text-sm text-muted-foreground">Cargando viajes…</p>
              ) : preview?.blocked_reason ? (
                <p className="text-sm text-destructive">{preview.blocked_reason}</p>
              ) : affected.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No hay viajes cerrados ni en curso desde esta fecha. Los viajes nuevos usarán el kilometraje
                  inicial que captures.
                </p>
              ) : (
                <ul className="divide-y border rounded-md text-sm max-h-48 overflow-y-auto">
                  {affected.map((trip) => (
                    <li key={trip.id} className="px-3 py-2">
                      <p className="font-medium">
                        {trip.folio}
                        {!trip.cerrado ? " · en curso" : ""}
                      </p>
                      <p className="text-muted-foreground">
                        {fmtDateTime(trip.fecha_salida)} · {trip.origen} → {trip.destino}
                      </p>
                      <p className="font-mono text-xs">
                        Actual: {fmtNumber(trip.km_inicial)}
                        {trip.km_final != null ? ` → ${fmtNumber(trip.km_final)}` : ""} km
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {resets.length > 0 ? (
              <div className="space-y-2">
                <p className="text-sm font-medium">Reinicios previos</p>
                <ul className="divide-y border rounded-md text-sm">
                  {resets.map((reset) => (
                    <li key={reset.id} className="flex items-start gap-2 px-3 py-2">
                      <div className="flex-1 min-w-0">
                        <p>
                          {fmtDateTime(reset.effective_at)} · {fmtNumber(reset.old_km)} → {fmtNumber(reset.new_km)} km
                        </p>
                        <p className="text-muted-foreground break-words">{reset.motivo}</p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="shrink-0 text-destructive hover:text-destructive"
                        disabled={deletingId === reset.id}
                        aria-label="Eliminar reinicio"
                        onClick={() => void handleDelete(reset.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              El primer viaje no tiene que empatar con el kilometraje anterior. El km final de cada viaje pasa a ser
              el km inicial del siguiente, hasta el último viaje de la unidad.
            </p>
            <div className="border rounded-md overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Viaje</TableHead>
                    <TableHead>Km inicial</TableHead>
                    <TableHead>Km final</TableHead>
                    <TableHead>Actual</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {linked.map((row, index) => {
                    const draft = row as DraftRow;
                    return (
                      <TableRow key={row.id}>
                        <TableCell>
                          <p className="font-medium">{row.folio}</p>
                          <p className="text-xs text-muted-foreground">
                            {fmtDateTime(draft.fecha_salida)}
                            <br />
                            {draft.origen} → {draft.destino}
                          </p>
                        </TableCell>
                        <TableCell>
                          {index === 0 ? (
                            <Input
                              type="number"
                              min={0}
                              step={1}
                              className="w-28"
                              value={Number.isNaN(row.kmInicial) ? "" : row.kmInicial}
                              onChange={(e) => {
                                const value = e.target.value === "" ? Number.NaN : Number(e.target.value);
                                setNewKm(e.target.value);
                                setRows((prev) =>
                                  prev.map((item) => (item.id === row.id ? { ...item, kmInicial: value } : item)),
                                );
                              }}
                            />
                          ) : (
                            <span className="font-mono">
                              {Number.isInteger(row.kmInicial) ? fmtNumber(row.kmInicial) : "—"}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          {row.cerrado ? (
                            <Input
                              type="number"
                              min={0}
                              step={1}
                              className="w-28"
                              value={row.kmFinal}
                              onChange={(e) =>
                                setRows((prev) =>
                                  prev.map((item) =>
                                    item.id === row.id ? { ...item, kmFinal: e.target.value } : item,
                                  ),
                                )
                              }
                            />
                          ) : (
                            <span className="text-sm text-muted-foreground">En curso</span>
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {fmtNumber(draft.kmInicialActual)}
                          {draft.kmFinalActual != null ? ` → ${fmtNumber(draft.kmFinalActual)}` : ""}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            {chainError(rows) ? <p className="text-sm text-destructive">{chainError(rows)}</p> : null}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          {step === "cadena" ? (
            <Button type="button" variant="outline" onClick={() => setStep("fecha")} disabled={saving}>
              Volver
            </Button>
          ) : (
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cerrar
            </Button>
          )}
          {step === "fecha" && affected.length > 0 ? (
            <Button
              type="button"
              onClick={openChain}
              disabled={previewLoading || Boolean(preview?.blocked_reason) || !preview}
            >
              Ajustar viajes
            </Button>
          ) : (
            <Button
              type="button"
              onClick={() => void save(step === "cadena" ? rows : [])}
              disabled={
                saving ||
                previewLoading ||
                Boolean(preview?.blocked_reason) ||
                (step === "fecha" && affected.length > 0)
              }
            >
              {saving ? "Guardando…" : "Registrar reinicio"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
