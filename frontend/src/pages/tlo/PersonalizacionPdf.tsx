import { useCallback, useEffect, useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/context/AuthContext";
import { apiFetch, hasApiConfigured, readJson } from "@/lib/api";
import {
  DEFAULT_PDF_BRANDING,
  loadPdfLogoDataUrl,
  previewSettlementPdfBlobUrl,
  type PdfBranding,
} from "@/lib/settlementPdf";
import {
  SAMPLE_DRIVER,
  SAMPLE_PERIOD,
  SAMPLE_SETTLEMENT_SUMMARY,
} from "@/lib/settlementPdfSample";
import type { PdfConfig } from "@/types/tlo";
import { toast } from "sonner";
import { FileImage, RotateCcw, Save, Trash2 } from "lucide-react";

type PdfConfigResponse = { pdf_config: PdfConfig; has_pdf_logo: boolean };

const hexRe = /^#[0-9A-Fa-f]{6}$/;

function ColorField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
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

export default function PersonalizacionPdf() {
  const { hasPermission, tenant, refreshTenant } = useAuth();
  const [titulo, setTitulo] = useState(DEFAULT_PDF_BRANDING.titulo!);
  const [colorHeader, setColorHeader] = useState(DEFAULT_PDF_BRANDING.color_header!);
  const [colorHeaderText, setColorHeaderText] = useState(DEFAULT_PDF_BRANDING.color_header_text!);
  const [piePagina, setPiePagina] = useState("");
  const [hasLogo, setHasLogo] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const previewRevoke = useRef<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const branding = useCallback((): PdfBranding => ({
    titulo,
    color_header: colorHeader,
    color_header_text: colorHeaderText,
    pie_pagina: piePagina,
  }), [titulo, colorHeader, colorHeaderText, piePagina]);

  const setPreview = useCallback(
    (logoDataUrl: string | null) => {
      if (previewRevoke.current) {
        URL.revokeObjectURL(previewRevoke.current);
        previewRevoke.current = null;
      }
      const url = previewSettlementPdfBlobUrl({
        tenantNombre: tenant?.nombre ?? "Empresa demo",
        driver: SAMPLE_DRIVER,
        inicio: SAMPLE_PERIOD.inicio,
        fin: SAMPLE_PERIOD.fin,
        summary: SAMPLE_SETTLEMENT_SUMMARY,
        branding: branding(),
        logoDataUrl,
      });
      previewRevoke.current = url;
      setPreviewUrl(url);
    },
    [tenant?.nombre, branding],
  );

  const loadConfig = useCallback(async () => {
    if (!hasApiConfigured()) return;
    const res = await apiFetch("/tenant/pdf-config");
    if (!res.ok) return;
    const data = await readJson<PdfConfigResponse>(res);
    setTitulo(data.pdf_config.titulo);
    setColorHeader(data.pdf_config.color_header);
    setColorHeaderText(data.pdf_config.color_header_text);
    setPiePagina(data.pdf_config.pie_pagina ?? "");
    setHasLogo(data.has_pdf_logo);
    if (data.has_pdf_logo) {
      const dataUrl = await loadPdfLogoDataUrl();
      setLogoPreview(dataUrl);
    } else {
      setLogoPreview(null);
    }
  }, []);

  useEffect(() => {
    void loadConfig();
    return () => {
      if (previewRevoke.current) URL.revokeObjectURL(previewRevoke.current);
    };
  }, [loadConfig]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPreview(logoPreview);
    }, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [titulo, colorHeader, colorHeaderText, piePagina, logoPreview, setPreview]);

  const onFileSelect = (file: File | null) => {
    if (!file) return;
    if (!["image/jpeg", "image/png"].includes(file.type)) {
      toast.error("Solo PNG o JPG");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error("El archivo debe ser menor a 2 MB");
      return;
    }
    setPendingFile(file);
    const reader = new FileReader();
    reader.onload = () => {
      const url = typeof reader.result === "string" ? reader.result : null;
      setLogoPreview(url);
    };
    reader.readAsDataURL(file);
  };

  const save = async () => {
    if (!hexRe.test(colorHeader) || !hexRe.test(colorHeaderText)) {
      toast.error("Los colores deben ser #RRGGBB");
      return;
    }
    setLoading(true);
    try {
      const res = await apiFetch("/tenant/pdf-config", {
        method: "PATCH",
        body: JSON.stringify({
          titulo: titulo.trim() || DEFAULT_PDF_BRANDING.titulo,
          color_header: colorHeader,
          color_header_text: colorHeaderText,
          pie_pagina: piePagina,
        }),
      });
      await readJson<PdfConfigResponse>(res);

      if (pendingFile) {
        const fd = new FormData();
        fd.append("file", pendingFile);
        const up = await apiFetch("/tenant/pdf-logo", { method: "POST", body: fd });
        const upData = await readJson<PdfConfigResponse>(up);
        setHasLogo(upData.has_pdf_logo);
        setPendingFile(null);
        const dataUrl = await loadPdfLogoDataUrl();
        setLogoPreview(dataUrl);
      }

      await refreshTenant();
      toast.success("Personalización guardada");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setLoading(false);
    }
  };

  const restoreDefaults = async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/tenant/pdf-config", {
        method: "PATCH",
        body: JSON.stringify({ reset_defaults: true }),
      });
      const data = await readJson<PdfConfigResponse>(res);
      setTitulo(data.pdf_config.titulo);
      setColorHeader(data.pdf_config.color_header);
      setColorHeaderText(data.pdf_config.color_header_text);
      setPiePagina(data.pdf_config.pie_pagina ?? "");
      await refreshTenant();
      toast.success("Valores restaurados");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  };

  const removeLogo = async () => {
    setLoading(true);
    try {
      if (hasLogo && hasApiConfigured()) {
        const res = await apiFetch("/tenant/pdf-logo", { method: "DELETE" });
        await readJson<PdfConfigResponse>(res);
      }
      setHasLogo(false);
      setLogoPreview(null);
      setPendingFile(null);
      await refreshTenant();
      toast.success("Logo eliminado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  };

  if (!hasPermission("marca.gestionar")) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Personalización PDF</h1>
        <p className="text-muted-foreground text-sm">
          Colores y logo del PDF de liquidaciones. La vista previa usa datos de ejemplo.
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <FileImage className="h-5 w-5" />
              Apariencia
            </CardTitle>
            <CardDescription>Logo PNG/JPG (máx. 2 MB) y colores del encabezado de tablas.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="pdf-logo">Logo del PDF</Label>
              <Input
                id="pdf-logo"
                type="file"
                accept="image/png,image/jpeg"
                className="mt-1"
                onChange={(e) => onFileSelect(e.target.files?.[0] ?? null)}
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
                  onClick={() => void removeLogo()}
                  disabled={loading}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1" />
                  Quitar logo
                </Button>
              )}
            </div>

            <div>
              <Label htmlFor="titulo">Título del documento</Label>
              <Input id="titulo" value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={80} className="mt-1" />
            </div>

            <ColorField id="ch" label="Color encabezado (tablas y neto)" value={colorHeader} onChange={setColorHeader} />
            <ColorField id="cht" label="Color texto encabezado" value={colorHeaderText} onChange={setColorHeaderText} />

            <div>
              <Label htmlFor="pie">Pie de página (opcional)</Label>
              <Textarea
                id="pie"
                value={piePagina}
                onChange={(e) => setPiePagina(e.target.value)}
                maxLength={200}
                rows={2}
                className="mt-1"
              />
            </div>

            <div className="flex flex-wrap gap-2 pt-2">
              <Button onClick={() => void save()} disabled={loading}>
                <Save className="h-4 w-4 mr-1" />
                {loading ? "Guardando…" : "Guardar"}
              </Button>
              <Button type="button" variant="outline" onClick={() => void restoreDefaults()} disabled={loading}>
                <RotateCcw className="h-4 w-4 mr-1" />
                Restaurar valores
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="flex flex-col min-h-[480px]">
          <CardHeader>
            <CardTitle className="text-lg">Vista previa</CardTitle>
            <CardDescription>Actualización automática al cambiar colores o logo.</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 p-0 min-h-[420px]">
            {previewUrl ? (
              <iframe
                title="Vista previa PDF"
                src={previewUrl}
                className="w-full h-[min(70vh,560px)] border-0 rounded-b-lg"
              />
            ) : (
              <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
                Generando vista previa…
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
