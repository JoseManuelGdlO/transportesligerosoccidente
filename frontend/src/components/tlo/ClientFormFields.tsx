import type { ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Client, ClientStatus } from "@/types/tlo";
import type { ClientFormErrors } from "@/lib/validateClientForm";
import { cn } from "@/lib/utils";

interface ClientFormFieldsProps {
  form: Client;
  onChange: (patch: Partial<Client>) => void;
  fieldErrors?: ClientFormErrors;
  onClearError?: (field: keyof ClientFormErrors) => void;
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

export function ClientFormFields({ form, onChange, fieldErrors, onClearError }: ClientFormFieldsProps) {
  const patch = (p: Partial<Client>, clearField?: keyof ClientFormErrors) => {
    onChange(p);
    if (clearField) onClearError?.(clearField);
  };

  const inputClass = (field?: keyof ClientFormErrors) =>
    cn(fieldErrors?.[field as keyof ClientFormErrors] && "border-destructive");

  return (
    <div className="space-y-3">
      <ValidatedField id="razon_social" label="Razón social" required error={fieldErrors?.razon_social}>
        <Input
          id="razon_social"
          required
          value={form.razon_social}
          aria-invalid={!!fieldErrors?.razon_social}
          className={inputClass("razon_social")}
          onChange={(e) => patch({ razon_social: e.target.value }, "razon_social")}
        />
      </ValidatedField>
      <div className="grid grid-cols-2 gap-3">
        <ValidatedField id="rfc" label="RFC" required error={fieldErrors?.rfc}>
          <Input
            id="rfc"
            required
            value={form.rfc}
            aria-invalid={!!fieldErrors?.rfc}
            className={inputClass("rfc")}
            onChange={(e) => patch({ rfc: e.target.value }, "rfc")}
          />
        </ValidatedField>
        <ValidatedField id="telefono" label="Teléfono" required error={fieldErrors?.telefono}>
          <Input
            id="telefono"
            required
            value={form.telefono}
            aria-invalid={!!fieldErrors?.telefono}
            className={inputClass("telefono")}
            onChange={(e) => patch({ telefono: e.target.value }, "telefono")}
          />
        </ValidatedField>
        <ValidatedField id="contacto" label="Contacto" required error={fieldErrors?.contacto}>
          <Input
            id="contacto"
            required
            value={form.contacto}
            aria-invalid={!!fieldErrors?.contacto}
            className={inputClass("contacto")}
            onChange={(e) => patch({ contacto: e.target.value }, "contacto")}
          />
        </ValidatedField>
        <ValidatedField id="email" label="Correo electrónico" error={fieldErrors?.email}>
          <Input
            id="email"
            type="email"
            value={form.email ?? ""}
            aria-invalid={!!fieldErrors?.email}
            className={inputClass("email")}
            onChange={(e) => patch({ email: e.target.value }, "email")}
          />
        </ValidatedField>
        <div>
          <Label htmlFor="regimen_fiscal">Régimen fiscal</Label>
          <Input
            id="regimen_fiscal"
            value={form.regimen_fiscal ?? ""}
            onChange={(e) => onChange({ regimen_fiscal: e.target.value })}
            placeholder="601"
          />
        </div>
        <div>
          <Label>Estatus</Label>
          <Select
            value={form.estatus ?? "activo"}
            onValueChange={(v: ClientStatus) => onChange({ estatus: v })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="activo">Activo</SelectItem>
              <SelectItem value="inactivo">Inactivo</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="rounded-md border border-dashed p-3 space-y-3">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Domicilio fiscal (Carta Porte)
        </p>
        <div>
          <Label htmlFor="calle">Calle</Label>
          <Input id="calle" value={form.calle ?? ""} onChange={(e) => onChange({ calle: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="numero_exterior">No. exterior</Label>
            <Input
              id="numero_exterior"
              value={form.numero_exterior ?? ""}
              onChange={(e) => onChange({ numero_exterior: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="numero_interior">No. interior</Label>
            <Input
              id="numero_interior"
              value={form.numero_interior ?? ""}
              onChange={(e) => onChange({ numero_interior: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="colonia">Colonia</Label>
            <Input id="colonia" value={form.colonia ?? ""} onChange={(e) => onChange({ colonia: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="localidad">Localidad</Label>
            <Input
              id="localidad"
              value={form.localidad ?? ""}
              onChange={(e) => onChange({ localidad: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="municipio">Municipio</Label>
            <Input
              id="municipio"
              value={form.municipio ?? ""}
              onChange={(e) => onChange({ municipio: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="estado">Estado</Label>
            <Input id="estado" value={form.estado ?? ""} onChange={(e) => onChange({ estado: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="cp">C.P.</Label>
            <Input
              id="cp"
              value={form.cp ?? ""}
              onChange={(e) => onChange({ cp: e.target.value })}
              maxLength={5}
            />
          </div>
          <div>
            <Label htmlFor="pais">País</Label>
            <Input
              id="pais"
              value={form.pais ?? "MEX"}
              onChange={(e) => onChange({ pais: e.target.value })}
              maxLength={3}
            />
          </div>
        </div>
      </div>
      <div>
        <Label htmlFor="observaciones">Observaciones</Label>
        <Textarea
          id="observaciones"
          value={form.observaciones ?? ""}
          onChange={(e) => onChange({ observaciones: e.target.value })}
          rows={3}
        />
      </div>
    </div>
  );
}
