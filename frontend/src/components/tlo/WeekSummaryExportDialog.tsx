import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { fmtDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

const STORAGE_KEY = "tlo.weekSummaryExport";

const CONCEPTS = [
  "tipo_unidad",
  "facturacion",
  "comision",
  "viaticos",
  "comprobaciones",
  "descuentos",
  "deposito_nomina",
  "compensacion",
  "anticipo",
  "total_efectivo",
] as const;

const EXTRA_CONCEPTS = [
  "viaticos_no_comprobados",
  "viaticos_a_favor",
  "subtotal",
  "saldo_anterior",
  "abono_cuenta",
  "saldo_actual",
  "neto_pagar",
  "km",
  "viajes",
] as const;

type ConceptKey = (typeof CONCEPTS)[number];
type ExtraKey = (typeof EXTRA_CONCEPTS)[number];
type Fuente = "preliquidacion" | "liquidacion";

const CONCEPT_LABEL: Record<ConceptKey, string> = {
  tipo_unidad: "Tipo de unidad",
  facturacion: "Facturación",
  comision: "% operador",
  viaticos: "Viáticos",
  comprobaciones: "Comprobaciones",
  descuentos: "Descuentos",
  deposito_nomina: "Depósito de nómina",
  compensacion: "Compensación",
  anticipo: "Anticipo",
  total_efectivo: "Total efectivo",
};

const EXTRA_LABEL: Record<ExtraKey, string> = {
  viaticos_no_comprobados: "Viáticos no comprobados",
  viaticos_a_favor: "Viáticos a favor",
  subtotal: "Subtotal",
  saldo_anterior: "Saldo anterior",
  abono_cuenta: "Abono a cuenta",
  saldo_actual: "Saldo actual",
  neto_pagar: "Neto a pagar",
  km: "Km",
  viajes: "Viajes",
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  inicio: string;
  fin: string;
  driverIds: string[];
};

function loadPrefs(): { fuente: Fuente; conceptos: ConceptKey[]; adicionales: ExtraKey[] } {
  const fallback = { fuente: "liquidacion" as const, conceptos: [...CONCEPTS], adicionales: [] as ExtraKey[] };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as { fuente?: string; conceptos?: unknown; adicionales?: unknown };
    const fuente: Fuente = parsed.fuente === "preliquidacion" ? "preliquidacion" : "liquidacion";
    const selected = new Set(Array.isArray(parsed.conceptos) ? parsed.conceptos : []);
    const conceptos = CONCEPTS.filter((key) => selected.has(key));
    const extraSelected = new Set(Array.isArray(parsed.adicionales) ? parsed.adicionales : []);
    const adicionales = EXTRA_CONCEPTS.filter((key) => extraSelected.has(key));
    return { fuente, conceptos: conceptos.length > 0 ? conceptos : [...CONCEPTS], adicionales };
  } catch {
    return fallback;
  }
}

export function WeekSummaryExportDialog({ open, onOpenChange, inicio, fin, driverIds }: Props) {
  const [fuente, setFuente] = useState<Fuente>("liquidacion");
  const [conceptos, setConceptos] = useState<ConceptKey[]>([...CONCEPTS]);
  const [adicionales, setAdicionales] = useState<ExtraKey[]>([]);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!open) return;
    const prefs = loadPrefs();
    setFuente(prefs.fuente);
    setConceptos(prefs.conceptos);
    setAdicionales(prefs.adicionales);
  }, [open]);

  const toggleConcept = (key: ConceptKey, checked: boolean) => {
    setConceptos((current) => {
      if (checked) return CONCEPTS.filter((item) => item === key || current.includes(item));
      return current.filter((item) => item !== key);
    });
  };

  const toggleExtra = (key: ExtraKey, checked: boolean) => {
    setAdicionales((current) => {
      if (checked) return EXTRA_CONCEPTS.filter((item) => item === key || current.includes(item));
      return current.filter((item) => item !== key);
    });
  };

  const download = async () => {
    if (driverIds.length === 0) {
      toast.error("Marca al menos un operador en el resumen");
      return;
    }
    if (conceptos.length === 0) {
      toast.error("Deja al menos un concepto");
      return;
    }
    setDownloading(true);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ fuente, conceptos, adicionales }));
      const res = await apiFetch("/settlements/week-summary/export", {
        method: "POST",
        body: JSON.stringify({
          inicio,
          fin,
          fuente,
          conceptos,
          adicionales,
          driver_ids: driverIds,
        }),
      });
      if (!res.ok) {
        let message = "No se pudo descargar el resumen";
        try {
          const body = (await res.json()) as { error?: unknown };
          if (typeof body.error === "string" && body.error) message = body.error;
        } catch {
          /* el cuerpo no era JSON */
        }
        throw new Error(message);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `resumen-liquidaciones-${inicio}-al-${fin}.xlsx`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success("Resumen descargado");
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo descargar el resumen");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Descargar resumen</DialogTitle>
          <DialogDescription>
            Periodo {fmtDate(inicio)} – {fmtDate(fin)}. El Excel usa los operadores marcados en la tabla.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Tomar valores de</Label>
            <RadioGroup value={fuente} onValueChange={(value) => setFuente(value as Fuente)} className="gap-2">
              <div className="flex items-start gap-2">
                <RadioGroupItem value="liquidacion" id="fuente-liquidacion" className="mt-1" />
                <Label htmlFor="fuente-liquidacion" className="font-normal leading-snug">
                  Liquidación
                  <span className="block text-xs text-muted-foreground">Montos del cierre. Si aún no hay, usa el cálculo en vivo.</span>
                </Label>
              </div>
              <div className="flex items-start gap-2">
                <RadioGroupItem value="preliquidacion" id="fuente-preliquidacion" className="mt-1" />
                <Label htmlFor="fuente-preliquidacion" className="font-normal leading-snug">
                  Preliquidación
                  <span className="block text-xs text-muted-foreground">
                    Montos del borrador. Si el operador ya está liquidado y no hay borrador, no entra al Excel.
                  </span>
                </Label>
              </div>
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label>Conceptos</Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {CONCEPTS.map((key) => (
                <div
                  key={key}
                  className="flex items-center gap-2 text-sm cursor-pointer"
                  onClick={() => toggleConcept(key, !conceptos.includes(key))}
                >
                  <Checkbox
                    checked={conceptos.includes(key)}
                    onClick={(event) => event.stopPropagation()}
                    onCheckedChange={(value) => toggleConcept(key, value === true)}
                  />
                  {CONCEPT_LABEL[key]}
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Quitar un concepto lo saca de la tabla y del total efectivo. Descuentos incluye los abonos a la cuenta.
              El depósito de nómina es el descuento de tipo nómina.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Conceptos adicionales</Label>
            <p className="text-xs text-muted-foreground">
              Son las métricas del PDF de liquidación. Cada columna toma el monto de ese operador.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {EXTRA_CONCEPTS.map((key) => (
                <div
                  key={key}
                  className="flex items-center gap-2 text-sm cursor-pointer"
                  onClick={() => toggleExtra(key, !adicionales.includes(key))}
                >
                  <Checkbox
                    checked={adicionales.includes(key)}
                    onClick={(event) => event.stopPropagation()}
                    onCheckedChange={(value) => toggleExtra(key, value === true)}
                  />
                  {EXTRA_LABEL[key]}
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={downloading}>
            Cancelar
          </Button>
          <Button type="button" onClick={() => void download()} disabled={downloading || driverIds.length === 0}>
            <Download className="h-4 w-4 mr-2" />
            {downloading ? "Descargando…" : `Descargar (${driverIds.length})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
