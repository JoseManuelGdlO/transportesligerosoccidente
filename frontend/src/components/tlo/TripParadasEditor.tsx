import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import type { TripStop } from "@/types/tlo";

export type ParadaDraft = { etiqueta: string; client_ubicacion_id?: string };

type Props = {
  paradas: ParadaDraft[];
  onChange: (paradas: ParadaDraft[]) => void;
  disabled?: boolean;
};

export function paradasToTripStops(paradas: ParadaDraft[]): TripStop[] {
  return paradas.map((p, i) => ({
    orden: i + 1,
    etiqueta: p.etiqueta.trim(),
    client_ubicacion_id: p.client_ubicacion_id,
  }));
}

export function tripStopsToParadas(stops: TripStop[]): ParadaDraft[] {
  return [...stops]
    .sort((a, b) => a.orden - b.orden)
    .map((s) => ({ etiqueta: s.etiqueta, client_ubicacion_id: s.client_ubicacion_id }));
}

export function TripParadasEditor({ paradas, onChange, disabled }: Props) {
  const update = (index: number, etiqueta: string) => {
    const next = [...paradas];
    next[index] = { ...next[index], etiqueta };
    onChange(next);
  };

  const add = () => onChange([...paradas, { etiqueta: "" }]);

  const remove = (index: number) => {
    if (paradas.length <= 2) return;
    onChange(paradas.filter((_, i) => i !== index));
  };

  const move = (index: number, dir: -1 | 1) => {
    const j = index + dir;
    if (j < 0 || j >= paradas.length) return;
    const next = [...paradas];
    [next[index], next[j]] = [next[j], next[index]];
    onChange(next);
  };

  return (
    <div className="space-y-2">
      <Label className="text-xs">Paradas de la ruta (mínimo 2)</Label>
      {paradas.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground w-6 shrink-0">{i + 1}.</span>
          <Input
            value={p.etiqueta}
            onChange={(e) => update(i, e.target.value)}
            placeholder={i === 0 ? "Origen (ej. Gdl)" : i === paradas.length - 1 ? "Destino final" : "Parada intermedia"}
            disabled={disabled}
            className="flex-1"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={disabled || i === 0}
            onClick={() => move(i, -1)}
            aria-label="Subir"
          >
            <ChevronUp className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={disabled || i === paradas.length - 1}
            onClick={() => move(i, 1)}
            aria-label="Bajar"
          >
            <ChevronDown className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={disabled || paradas.length <= 2}
            onClick={() => remove(i)}
            aria-label="Quitar parada"
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={add} disabled={disabled}>
        <Plus className="h-4 w-4 mr-1" /> Agregar parada
      </Button>
    </div>
  );
}
