import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2 } from "lucide-react";
import { fmtMXN } from "@/lib/format";
import {
  emptyConcepto,
  parsePrecioInput,
  sumConceptos,
  type DocumentConcepto,
} from "@/lib/documentConceptos";

type Props = {
  value: DocumentConcepto[];
  onChange: (conceptos: DocumentConcepto[]) => void;
  disabled?: boolean;
};

export function ConceptosEditor({ value, onChange, disabled }: Props) {
  const rows = value.length ? value : [emptyConcepto()];
  const total = sumConceptos(rows);

  const update = (index: number, patch: Partial<DocumentConcepto>) => {
    const next = rows.map((row, i) => (i === index ? { ...row, ...patch } : row));
    onChange(next);
  };

  const add = () => onChange([...rows, emptyConcepto()]);

  const remove = (index: number) => {
    if (rows.length <= 1) {
      onChange([emptyConcepto()]);
      return;
    }
    onChange(rows.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Label>Conceptos</Label>
        <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={add}>
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          Agregar
        </Button>
      </div>
      <div className="space-y-2">
        {rows.map((row, i) => (
          <div key={i} className="flex items-start gap-2">
            <Textarea
              value={row.descripcion}
              onChange={(e) => update(i, { descripcion: e.target.value })}
              placeholder="Descripción"
              disabled={disabled}
              rows={2}
              className="min-h-[2.5rem] flex-1 resize-y"
            />
            <Input
              type="number"
              min={0}
              step={0.01}
              inputMode="decimal"
              value={row.precio}
              onChange={(e) => update(i, { precio: parsePrecioInput(e.target.value) })}
              placeholder="Precio"
              disabled={disabled}
              className="w-28"
            />
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="shrink-0 text-destructive hover:text-destructive"
              disabled={disabled}
              onClick={() => remove(i)}
              aria-label="Quitar concepto"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>
      <p className="text-sm font-medium text-right">Total: {fmtMXN(total)}</p>
    </div>
  );
}
