import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import type { PdfBranding } from "@/types/pdfTemplate";

const hexRe = /^#[0-9A-Fa-f]{6}$/;

function ColorField({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (v: string) => void }) {
  const safe = hexRe.test(value) ? value : "#000000";
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex gap-2 items-center">
        <input
          id={id}
          type="color"
          value={safe}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-12 cursor-pointer rounded border border-input"
        />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#212529"
          className="font-mono text-sm"
        />
      </div>
    </div>
  );
}

export interface BrandingFormProps {
  branding: PdfBranding;
  onChange: (next: PdfBranding) => void;
  logoPreview: string | null;
  hasLogo: boolean;
  onLogoFile: (file: File | null) => void;
  onLogoRemove: () => void;
  disabled?: boolean;
}

export function BrandingForm({ branding, onChange, logoPreview, hasLogo, onLogoFile, onLogoRemove, disabled }: BrandingFormProps) {
  const update = (patch: Partial<PdfBranding>) => onChange({ ...branding, ...patch });

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="pdf-logo">Logo del PDF (PNG/JPG, máx. 2 MB)</Label>
        <Input
          id="pdf-logo"
          type="file"
          accept="image/png,image/jpeg"
          className="mt-1"
          onChange={(e) => onLogoFile(e.target.files?.[0] ?? null)}
          disabled={disabled}
        />
        {logoPreview && (
          <img src={logoPreview} alt="Logo" className="mt-2 h-14 object-contain border rounded p-1 bg-white" />
        )}
        {(hasLogo || logoPreview) && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={onLogoRemove}
            disabled={disabled}
          >
            <Trash2 className="h-3.5 w-3.5 mr-1" />
            Quitar logo
          </Button>
        )}
      </div>

      <div>
        <Label htmlFor="pdf-titulo">Título del documento</Label>
        <Input
          id="pdf-titulo"
          value={branding.titulo}
          onChange={(e) => update({ titulo: e.target.value })}
          maxLength={80}
          className="mt-1"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <ColorField id="ch" label="Encabezado (fondo)" value={branding.color_header} onChange={(v) => update({ color_header: v })} />
        <ColorField id="cht" label="Encabezado (texto)" value={branding.color_header_text} onChange={(v) => update({ color_header_text: v })} />
        <ColorField id="ca" label="Acento" value={branding.color_accent} onChange={(v) => update({ color_accent: v })} />
      </div>

      <div>
        <Label htmlFor="pdf-pie">Pie de página (opcional)</Label>
        <Textarea
          id="pdf-pie"
          value={branding.pie_pagina}
          onChange={(e) => update({ pie_pagina: e.target.value })}
          maxLength={200}
          rows={2}
          className="mt-1"
        />
      </div>
    </div>
  );
}
