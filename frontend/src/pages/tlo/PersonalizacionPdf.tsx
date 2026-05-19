import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/context/AuthContext";
import { apiFetch, apiBaseUrl, getStoredToken, hasApiConfigured, readJson } from "@/lib/api";
import { previewSettlementPdfBlobUrl } from "@/lib/settlementPdf";
import { previewTripPdfBlobUrl } from "@/lib/tripPdf";
import { SAMPLE_DRIVER, SAMPLE_PERIOD, SAMPLE_SETTLEMENT_SUMMARY } from "@/lib/settlementPdfSample";
import { SAMPLE_TRIP, SAMPLE_TRIP_CLIENT, SAMPLE_TRIP_DRIVER, SAMPLE_TRIP_TRUCK } from "@/lib/tripPdfSample";
import {
  DEFAULT_PDF_TEMPLATES,
  type PdfTemplate,
  type PdfTemplatesConfig,
  type TemplateKind,
} from "@/types/pdfTemplate";
import { TemplateEditor } from "@/components/tlo/pdfEditor/TemplateEditor";
import { toast } from "sonner";
import { RotateCcw, Save } from "lucide-react";

type PdfConfigResponse = {
  pdf_config: PdfTemplatesConfig;
  has_pdf_logo: boolean;
  has_pdf_trip_logo: boolean;
};

async function fetchLogoDataUrl(kind: TemplateKind): Promise<string | null> {
  const base = apiBaseUrl();
  const token = getStoredToken();
  if (!base || !token) return null;
  try {
    const res = await fetch(`${base}/tenant/pdf-logo/${kind}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string | null>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

interface TemplateState {
  template: PdfTemplate;
  logoPreview: string | null;
  hasLogo: boolean;
  pendingFile: File | null;
}

export default function PersonalizacionPdf() {
  const { hasPermission, tenant, refreshTenant } = useAuth();
  const [activeKind, setActiveKind] = useState<TemplateKind>("settlement");
  const [settlement, setSettlement] = useState<TemplateState>({
    template: DEFAULT_PDF_TEMPLATES.settlement,
    logoPreview: null,
    hasLogo: false,
    pendingFile: null,
  });
  const [trip, setTrip] = useState<TemplateState>({
    template: DEFAULT_PDF_TEMPLATES.trip,
    logoPreview: null,
    hasLogo: false,
    pendingFile: null,
  });
  const [loading, setLoading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const previewRevoke = useRef<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const state = activeKind === "settlement" ? settlement : trip;
  const setState = activeKind === "settlement" ? setSettlement : setTrip;

  const tenantNombre = tenant?.nombre ?? "Empresa demo";

  const loadConfig = useCallback(async () => {
    if (!hasApiConfigured()) return;
    const res = await apiFetch("/tenant/pdf-config");
    if (!res.ok) return;
    const data = await readJson<PdfConfigResponse>(res);
    setSettlement((s) => ({ ...s, template: data.pdf_config.settlement, hasLogo: data.has_pdf_logo }));
    setTrip((s) => ({ ...s, template: data.pdf_config.trip, hasLogo: data.has_pdf_trip_logo }));
    if (data.has_pdf_logo) {
      const url = await fetchLogoDataUrl("settlement");
      setSettlement((s) => ({ ...s, logoPreview: url }));
    } else {
      setSettlement((s) => ({ ...s, logoPreview: null }));
    }
    if (data.has_pdf_trip_logo) {
      const url = await fetchLogoDataUrl("trip");
      setTrip((s) => ({ ...s, logoPreview: url }));
    } else {
      setTrip((s) => ({ ...s, logoPreview: null }));
    }
  }, []);

  useEffect(() => {
    void loadConfig();
    return () => {
      if (previewRevoke.current) URL.revokeObjectURL(previewRevoke.current);
    };
  }, [loadConfig]);

  const buildPreview = useCallback(() => {
    if (previewRevoke.current) {
      URL.revokeObjectURL(previewRevoke.current);
      previewRevoke.current = null;
    }
    let url: string;
    if (activeKind === "settlement") {
      url = previewSettlementPdfBlobUrl({
        tenantNombre,
        driver: SAMPLE_DRIVER,
        inicio: SAMPLE_PERIOD.inicio,
        fin: SAMPLE_PERIOD.fin,
        summary: SAMPLE_SETTLEMENT_SUMMARY,
        template: settlement.template,
        logoDataUrl: settlement.logoPreview,
      });
    } else {
      url = previewTripPdfBlobUrl({
        tenantNombre,
        trip: SAMPLE_TRIP,
        driver: SAMPLE_TRIP_DRIVER,
        truck: SAMPLE_TRIP_TRUCK,
        client: SAMPLE_TRIP_CLIENT,
        template: trip.template,
        logoDataUrl: trip.logoPreview,
      });
    }
    previewRevoke.current = url;
    setPreviewUrl(url);
  }, [activeKind, settlement.template, settlement.logoPreview, trip.template, trip.logoPreview, tenantNombre]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(buildPreview, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [buildPreview]);

  const onLogoFile = (file: File | null) => {
    if (!file) return;
    if (!["image/jpeg", "image/png"].includes(file.type)) {
      toast.error("Solo PNG o JPG");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error("El archivo debe ser menor a 2 MB");
      return;
    }
    setState((s) => ({ ...s, pendingFile: file }));
    const reader = new FileReader();
    reader.onload = () => {
      const url = typeof reader.result === "string" ? reader.result : null;
      setState((s) => ({ ...s, logoPreview: url }));
    };
    reader.readAsDataURL(file);
  };

  const onLogoRemove = async () => {
    setLoading(true);
    try {
      if (state.hasLogo && hasApiConfigured()) {
        const res = await apiFetch(`/tenant/pdf-logo/${activeKind}`, { method: "DELETE" });
        await readJson<PdfConfigResponse>(res);
      }
      setState((s) => ({ ...s, hasLogo: false, logoPreview: null, pendingFile: null }));
      await refreshTenant();
      toast.success("Logo eliminado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  };

  const save = async () => {
    setLoading(true);
    try {
      const payload = activeKind === "settlement"
        ? { settlement: state.template }
        : { trip: state.template };
      const res = await apiFetch("/tenant/pdf-config", {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      const data = await readJson<PdfConfigResponse>(res);
      if (activeKind === "settlement") {
        setSettlement((s) => ({ ...s, template: data.pdf_config.settlement }));
      } else {
        setTrip((s) => ({ ...s, template: data.pdf_config.trip }));
      }

      if (state.pendingFile) {
        const fd = new FormData();
        fd.append("file", state.pendingFile);
        const up = await apiFetch(`/tenant/pdf-logo/${activeKind}`, { method: "POST", body: fd });
        const upData = await readJson<PdfConfigResponse>(up);
        const hasLogoNow = activeKind === "settlement" ? upData.has_pdf_logo : upData.has_pdf_trip_logo;
        setState((s) => ({ ...s, hasLogo: hasLogoNow, pendingFile: null }));
        const url = await fetchLogoDataUrl(activeKind);
        setState((s) => ({ ...s, logoPreview: url }));
      }

      await refreshTenant();
      toast.success("Personalización guardada");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setLoading(false);
    }
  };

  const resetTemplate = async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/tenant/pdf-config", {
        method: "PATCH",
        body: JSON.stringify({ reset_defaults: activeKind }),
      });
      const data = await readJson<PdfConfigResponse>(res);
      if (activeKind === "settlement") {
        setSettlement((s) => ({ ...s, template: data.pdf_config.settlement }));
      } else {
        setTrip((s) => ({ ...s, template: data.pdf_config.trip }));
      }
      await refreshTenant();
      toast.success("Plantilla restaurada");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  };

  const updateTemplate = (next: PdfTemplate) => {
    setState((s) => ({ ...s, template: next }));
  };

  const tabLabel = useMemo(() => (activeKind === "settlement" ? "Liquidación" : "Detalle de viaje"), [activeKind]);

  if (!hasPermission("marca.gestionar")) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Personalización PDF</h1>
        <p className="text-muted-foreground text-sm">
          Arrastra bloques entre las zonas para diseñar tus plantillas. Cada plantilla tiene su propio logo y colores.
        </p>
      </div>

      <Tabs value={activeKind} onValueChange={(v) => setActiveKind(v as TemplateKind)}>
        <TabsList>
          <TabsTrigger value="settlement">Liquidación</TabsTrigger>
          <TabsTrigger value="trip">Detalle de viaje</TabsTrigger>
        </TabsList>

        {(["settlement", "trip"] as const).map((kind) => (
          <TabsContent key={kind} value={kind} className="mt-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
              <div className="space-y-4 min-w-0">
                <TemplateEditor
                  kind={kind}
                  template={kind === "settlement" ? settlement.template : trip.template}
                  onChange={updateTemplate}
                  logoPreview={kind === "settlement" ? settlement.logoPreview : trip.logoPreview}
                  hasLogo={kind === "settlement" ? settlement.hasLogo : trip.hasLogo}
                  onLogoFile={onLogoFile}
                  onLogoRemove={() => void onLogoRemove()}
                  disabled={loading}
                />
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => void save()} disabled={loading}>
                    <Save className="h-4 w-4 mr-1" />
                    {loading ? "Guardando…" : `Guardar ${tabLabel}`}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => void resetTemplate()} disabled={loading}>
                    <RotateCcw className="h-4 w-4 mr-1" />
                    Restaurar plantilla
                  </Button>
                </div>
              </div>

              <Card className="flex flex-col lg:sticky lg:top-0 lg:self-start lg:max-h-[calc(100vh-6rem)]">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg">Vista previa</CardTitle>
                  <CardDescription>{`Plantilla "${tabLabel}" con datos de ejemplo.`}</CardDescription>
                </CardHeader>
                <CardContent className="flex-1 p-0 min-h-[420px]">
                  {previewUrl ? (
                    <iframe
                      title="Vista previa PDF"
                      src={previewUrl}
                      className="w-full h-[min(70vh,640px)] lg:h-[calc(100vh-12rem)] border-0 rounded-b-lg"
                    />
                  ) : (
                    <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
                      Generando vista previa…
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
