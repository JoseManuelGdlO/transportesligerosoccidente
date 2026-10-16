import { useId } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

interface ComplementoCorreoFieldsProps {
  enabled: boolean;
  onEnabledChange: (value: boolean) => void;
  email: string;
  onEmailChange: (value: string) => void;
  mensaje: string;
  onMensajeChange: (value: string) => void;
}

export function ComplementoCorreoFields({
  enabled,
  onEnabledChange,
  email,
  onEmailChange,
  mensaje,
  onMensajeChange,
}: ComplementoCorreoFieldsProps) {
  const baseId = useId();
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor={`${baseId}-switch`}>Enviar correo</Label>
        <Switch id={`${baseId}-switch`} checked={enabled} onCheckedChange={onEnabledChange} />
      </div>
      {enabled && (
        <>
          <div>
            <Label htmlFor={`${baseId}-email`}>Correo</Label>
            <Input
              id={`${baseId}-email`}
              type="email"
              value={email}
              onChange={(e) => onEmailChange(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor={`${baseId}-mensaje`}>Mensaje</Label>
            <Textarea
              id={`${baseId}-mensaje`}
              value={mensaje}
              onChange={(e) => onMensajeChange(e.target.value)}
            />
          </div>
        </>
      )}
    </div>
  );
}
