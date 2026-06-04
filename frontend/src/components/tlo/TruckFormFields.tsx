import type { ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Truck, TruckStatus } from "@/types/tlo";
import type { TruckFormErrors } from "@/lib/validateTruckForm";
import { cn } from "@/lib/utils";

interface TruckFormFieldsProps {
  form: Truck;
  onChange: (patch: Partial<Truck>) => void;
  fieldErrors?: TruckFormErrors;
  onClearError?: (field: keyof TruckFormErrors) => void;
}

function ValidatedField({
  id,
  label,
  required,
  error,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <Label htmlFor={id}>
        {label}
        {required && <span className="text-destructive ml-0.5">*</span>}
      </Label>
      {children}
      {error && <p className="text-sm text-destructive mt-1">{error}</p>}
    </div>
  );
}

export function TruckFormFields({ form, onChange, fieldErrors, onClearError }: TruckFormFieldsProps) {
  const patch = (p: Partial<Truck>, clearField?: keyof TruckFormErrors) => {
    onChange(p);
    if (clearField) onClearError?.(clearField);
  };

  const inputClass = (field?: keyof TruckFormErrors) =>
    cn(fieldErrors?.[field as keyof TruckFormErrors] && "border-destructive");

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <ValidatedField
          id="numero_economico"
          label="No. económico"
          required
          error={fieldErrors?.numero_economico}
        >
          <Input
            id="numero_economico"
            required
            value={form.numero_economico}
            aria-invalid={!!fieldErrors?.numero_economico}
            className={inputClass("numero_economico")}
            onChange={(e) => patch({ numero_economico: e.target.value }, "numero_economico")}
          />
        </ValidatedField>
        <ValidatedField id="placas" label="Placas" required error={fieldErrors?.placas}>
          <Input
            id="placas"
            required
            value={form.placas}
            aria-invalid={!!fieldErrors?.placas}
            className={inputClass("placas")}
            onChange={(e) => patch({ placas: e.target.value }, "placas")}
          />
        </ValidatedField>
        <div>
          <Label htmlFor="folio_tag">Folio TAG</Label>
          <Input
            id="folio_tag"
            value={form.folio_tag ?? ""}
            onChange={(e) => onChange({ folio_tag: e.target.value })}
            placeholder="ID proveedor combustible"
          />
        </div>
        <div>
          <Label htmlFor="vin">VIN / No. serie</Label>
          <Input
            id="vin"
            value={form.vin ?? ""}
            onChange={(e) => onChange({ vin: e.target.value.toUpperCase() })}
            maxLength={17}
          />
        </div>
        <div>
          <Label htmlFor="capacidad_carga_kg">Capacidad de carga (kg)</Label>
          <Input
            id="capacidad_carga_kg"
            type="number"
            value={form.capacidad_carga_kg ?? ""}
            onChange={(e) =>
              onChange({
                capacidad_carga_kg: e.target.value === "" ? undefined : +e.target.value,
              })
            }
          />
        </div>
        <ValidatedField id="marca" label="Marca" required error={fieldErrors?.marca}>
          <Input
            id="marca"
            required
            value={form.marca}
            aria-invalid={!!fieldErrors?.marca}
            className={inputClass("marca")}
            onChange={(e) => patch({ marca: e.target.value }, "marca")}
          />
        </ValidatedField>
        <ValidatedField id="modelo" label="Modelo" required error={fieldErrors?.modelo}>
          <Input
            id="modelo"
            required
            value={form.modelo}
            aria-invalid={!!fieldErrors?.modelo}
            className={inputClass("modelo")}
            onChange={(e) => patch({ modelo: e.target.value }, "modelo")}
          />
        </ValidatedField>
        <ValidatedField id="anio" label="Año" required error={fieldErrors?.anio}>
          <Input
            id="anio"
            type="number"
            required
            value={form.anio}
            aria-invalid={!!fieldErrors?.anio}
            className={inputClass("anio")}
            onChange={(e) => patch({ anio: +e.target.value }, "anio")}
          />
        </ValidatedField>
        <ValidatedField
          id="rendimiento_esperado"
          label="Rendimiento (km/l)"
          required
          error={fieldErrors?.rendimiento_esperado}
        >
          <Input
            id="rendimiento_esperado"
            type="number"
            step="0.1"
            required
            value={form.rendimiento_esperado}
            aria-invalid={!!fieldErrors?.rendimiento_esperado}
            className={inputClass("rendimiento_esperado")}
            onChange={(e) => patch({ rendimiento_esperado: +e.target.value }, "rendimiento_esperado")}
          />
        </ValidatedField>
        <ValidatedField
          id="costo_km_ref"
          label="Costo/km referencia"
          required
          error={fieldErrors?.costo_km_ref}
        >
          <Input
            id="costo_km_ref"
            type="number"
            step="0.5"
            required
            value={form.costo_km_ref}
            aria-invalid={!!fieldErrors?.costo_km_ref}
            className={inputClass("costo_km_ref")}
            onChange={(e) => patch({ costo_km_ref: +e.target.value }, "costo_km_ref")}
          />
        </ValidatedField>
      </div>
      <div className="rounded-md border border-dashed p-3 space-y-3">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Carta Porte SAT</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="perm_sct">Permiso SCT</Label>
            <Input
              id="perm_sct"
              value={form.perm_sct ?? ""}
              onChange={(e) => onChange({ perm_sct: e.target.value })}
              placeholder="TPAF01"
            />
          </div>
          <div>
            <Label htmlFor="num_permiso_sct">No. permiso SCT</Label>
            <Input
              id="num_permiso_sct"
              value={form.num_permiso_sct ?? ""}
              onChange={(e) => onChange({ num_permiso_sct: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="config_vehicular">Config. vehicular</Label>
            <Input
              id="config_vehicular"
              value={form.config_vehicular ?? ""}
              onChange={(e) => onChange({ config_vehicular: e.target.value })}
              placeholder="C2"
            />
          </div>
          <div>
            <Label htmlFor="peso_bruto_vehicular">Peso bruto vehicular (kg)</Label>
            <Input
              id="peso_bruto_vehicular"
              type="number"
              value={form.peso_bruto_vehicular ?? ""}
              onChange={(e) =>
                onChange({
                  peso_bruto_vehicular: e.target.value === "" ? undefined : +e.target.value,
                })
              }
            />
          </div>
          <div>
            <Label htmlFor="aseguradora_resp_civil">Aseguradora RC</Label>
            <Input
              id="aseguradora_resp_civil"
              value={form.aseguradora_resp_civil ?? ""}
              onChange={(e) => onChange({ aseguradora_resp_civil: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="poliza_resp_civil">Póliza RC</Label>
            <Input
              id="poliza_resp_civil"
              value={form.poliza_resp_civil ?? ""}
              onChange={(e) => onChange({ poliza_resp_civil: e.target.value })}
            />
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Estatus</Label>
          <Select value={form.estatus} onValueChange={(v: TruckStatus) => onChange({ estatus: v })}>
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
    </div>
  );
}
