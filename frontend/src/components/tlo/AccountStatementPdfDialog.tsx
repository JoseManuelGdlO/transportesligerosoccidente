import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/context/AuthContext";
import {
  SALDOS_ALCANCE_LABEL,
  buildAccountStatementPdf,
  docsConSaldo,
  empresaLineasParaSaldos,
  entidadKey,
  groupSaldos,
  rowFromAccountDocument,
  type SaldosAlcance,
} from "@/lib/accountStatementPdf";
import { isoDay } from "@/lib/format";
import { loadPdfLogoDataUrl } from "@/lib/settlementPdf";
import { fetchAccountDocuments } from "@/lib/tloApi";
import type { AccountDocument, AccountDocumentTipo } from "@/types/tlo";
import { toast } from "sonner";

interface AccountStatementPdfDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tipo: AccountDocumentTipo;
  listedDocs: AccountDocument[];
}

export function AccountStatementPdfDialog({
  open,
  onOpenChange,
  tipo,
  listedDocs,
}: AccountStatementPdfDialogProps) {
  const { tenant } = useAuth();
  const [alcance, setAlcance] = useState<SaldosAlcance>("activos");
  const [fechaCorte, setFechaCorte] = useState(() => isoDay(new Date()));
  const [remote, setRemote] = useState<AccountDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);
  const [seenOpen, setSeenOpen] = useState(open);
  if (open !== seenOpen) {
    setSeenOpen(open);
    if (open) {
      setAlcance("activos");
      setFechaCorte(isoDay(new Date()));
      setRemote([]);
      setLoading(true);
    }
  }

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void loadPdfLogoDataUrl("settlement").then((url) => {
      if (!cancelled) setLogoDataUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open || alcance === "pantalla") return;
    let cancelled = false;
    setLoading(true);
    void fetchAccountDocuments({ tipo })
      .then((list) => {
        if (!cancelled) setRemote(list);
      })
      .catch((e) => {
        if (!cancelled) {
          setRemote([]);
          toast.error(e instanceof Error ? e.message : "No se pudieron cargar los documentos");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, alcance, tipo]);

  const source = alcance === "pantalla" ? listedDocs : remote;
  const pool = useMemo(
    () => (alcance === "activos" ? docsConSaldo(source) : source),
    [alcance, source],
  );

  const entities = useMemo(() => {
    const map = new Map<string, string>();
    for (const doc of pool) {
      const id = entidadKey(doc);
      if (!map.has(id)) map.set(id, doc.entidad_nombre.trim() || "Sin nombre");
    }
    return [...map.entries()]
      .map(([id, nombre]) => ({ id, nombre }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" }));
  }, [pool]);

  const selectionKey = `${alcance}\0${entities.map((e) => e.id).join("\0")}`;
  const [appliedKey, setAppliedKey] = useState(selectionKey);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  if (appliedKey !== selectionKey) {
    setAppliedKey(selectionKey);
    setSelected(new Set(entities.map((e) => e.id)));
  }

  const entidadEtiqueta = tipo === "cxc" ? "Cliente" : "Proveedor";
  const allChecked = entities.length > 0 && entities.every((e) => selected.has(e.id));
  const someChecked = entities.some((e) => selected.has(e.id));

  const generar = () => {
    if (!fechaCorte) {
      toast.error("Indica la fecha de corte");
      return;
    }
    if (selected.size === 0) {
      toast.error(`Selecciona al menos un ${entidadEtiqueta.toLowerCase()}`);
      return;
    }
    const chosen = pool.filter((doc) => selected.has(entidadKey(doc)));
    if (chosen.length === 0) {
      toast.error("No hay documentos para ese criterio");
      return;
    }
    const { grupos, totales } = groupSaldos(chosen.map(rowFromAccountDocument));
    const todos = entities.every((e) => selected.has(e.id));
    const pdf = buildAccountStatementPdf({
      titulo: tipo === "cxc" ? "Saldos de Clientes" : "Saldos de Proveedores",
      fechaCorte,
      alcanceLabel: SALDOS_ALCANCE_LABEL[alcance],
      entidadEtiqueta: tipo === "cxc" ? "CLIENTE" : "PROVEEDOR",
      seleccionLabel: todos ? null : entities.filter((e) => selected.has(e.id)).map((e) => e.nombre).join(", "),
      empresaLineas: empresaLineasParaSaldos(tenant?.pdf_config, tenant?.nombre ?? ""),
      logoDataUrl,
      grupos,
      totales,
    });
    const prefix = tipo === "cxc" ? "saldos-clientes" : "saldos-proveedores";
    pdf.save(`${prefix}-${fechaCorte}.pdf`);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Estado de saldos</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="saldos-fecha-corte">Fecha de corte</Label>
            <Input
              id="saldos-fecha-corte"
              type="date"
              value={fechaCorte}
              onChange={(e) => setFechaCorte(e.target.value)}
            />
          </div>
          <div>
            <Label>Documentos</Label>
            <Select value={alcance} onValueChange={(v) => setAlcance(v as SaldosAlcance)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="activos">Con saldo (activos)</SelectItem>
                <SelectItem value="todos">Todos los documentos</SelectItem>
                <SelectItem value="pantalla">Los de esta pantalla</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{tipo === "cxc" ? "Clientes" : "Proveedores"}</Label>
            {alcance !== "pantalla" && loading ? (
              <p className="text-sm text-muted-foreground">Cargando…</p>
            ) : entities.length === 0 ? (
              <p className="text-sm text-muted-foreground">No hay documentos en este alcance.</p>
            ) : (
              <div className="max-h-56 space-y-2 overflow-y-auto rounded-md border p-2">
                <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                  <Checkbox
                    checked={allChecked ? true : someChecked ? "indeterminate" : false}
                    onCheckedChange={(v) => {
                      setSelected(v === true ? new Set(entities.map((e) => e.id)) : new Set());
                    }}
                  />
                  Todos
                </label>
                {entities.map((entity) => (
                  <label key={entity.id} className="flex cursor-pointer items-center gap-2 text-sm">
                    <Checkbox
                      checked={selected.has(entity.id)}
                      onCheckedChange={(v) => {
                        setSelected((prev) => {
                          const next = new Set(prev);
                          if (v === true) next.add(entity.id);
                          else next.delete(entity.id);
                          return next;
                        });
                      }}
                    />
                    <span className="min-w-0 truncate">{entity.nombre}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={generar} disabled={(alcance !== "pantalla" && loading) || entities.length === 0}>
            Generar PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
