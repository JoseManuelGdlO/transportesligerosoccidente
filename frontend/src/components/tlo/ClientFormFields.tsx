import type { ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Client, ClientStatus } from "@/types/tlo";
import type { ClientFormErrors } from "@/lib/validateClientForm";
import { cn } from "@/lib/utils";
import { DomicilioSatFields } from "@/components/tlo/DomicilioSatFields";

interface ClientFormFieldsProps {
  form: Client;
  onChange: (patch: Partial<Client>) => void;
  fieldErrors?: ClientFormErrors;
  onClearError?: (field: keyof ClientFormErrors) => void;
  isEditing?: boolean;
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

export function ClientFormFields({
  form,
  onChange,
  fieldErrors,
  onClearError,
  isEditing = false,
}: ClientFormFieldsProps) {
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
        <DomicilioSatFields
          value={form}
          onChange={(patch) => {
            onChange(patch);
            if (patch.cp != null) onClearError?.("cp");
            if (patch.estado != null) onClearError?.("estado");
            if (patch.pais != null) onClearError?.("pais");
          }}
          cpError={fieldErrors?.cp}
          estadoError={fieldErrors?.estado}
          paisError={fieldErrors?.pais}
          requiredFields={
            isEditing ? { pais: true, estado: true, cp: true } : undefined
          }
        />
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
