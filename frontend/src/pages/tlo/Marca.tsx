import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { apiFetch, hasApiConfigured } from "@/lib/api";
import { applyTenantThemeCss } from "@/lib/theme";
import type { Tenant } from "@/types/tlo";
import { toast } from "sonner";
import { Palette } from "lucide-react";

const hex = /^#[0-9A-Fa-f]{6}$/;

export default function Marca() {
  const { hasPermission, refreshTenant, tenant: ctxTenant, apiMode } = useAuth();
  const [tenant, setTenant] = useState<Tenant | null>(ctxTenant);
  const [logoUrl, setLogoUrl] = useState(ctxTenant?.logo_url ?? "");
  const [colorPrimary, setColorPrimary] = useState(ctxTenant?.color_primary ?? "");
  const [colorAccent, setColorAccent] = useState(ctxTenant?.color_accent ?? "");
  const [colorSidebar, setColorSidebar] = useState(ctxTenant?.color_sidebar ?? "");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setTenant(ctxTenant);
    setLogoUrl(ctxTenant?.logo_url ?? "");
    setColorPrimary(ctxTenant?.color_primary ?? "");
    setColorAccent(ctxTenant?.color_accent ?? "");
    setColorSidebar(ctxTenant?.color_sidebar ?? "");
  }, [ctxTenant]);

  useEffect(() => {
    if (!hasApiConfigured()) return;
    (async () => {
      const res = await apiFetch("/tenant");
      if (!res.ok) return;
      const data = (await res.json()) as Tenant;
      setTenant(data);
      setLogoUrl(data.logo_url ?? "");
      setColorPrimary(data.color_primary ?? "");
      setColorAccent(data.color_accent ?? "");
      setColorSidebar(data.color_sidebar ?? "");
    })();
  }, []);

  const previewTheme = () => {
    const t: Tenant = {
      id: tenant?.id ?? "",
      slug: tenant?.slug ?? "",
      nombre: tenant?.nombre ?? "",
      estatus: tenant?.estatus ?? "activo",
      logo_url: logoUrl || undefined,
      color_primary: colorPrimary || undefined,
      color_accent: colorAccent || undefined,
      color_sidebar: colorSidebar || undefined,
    };
    applyTenantThemeCss(t);
  };

  const save = async () => {
    const colors = [colorPrimary, colorAccent, colorSidebar].filter(Boolean);
    for (const c of colors) {
      if (c && !hex.test(c)) {
        toast.error("Los colores deben ser hex de 6 dígitos, p. ej. #1a2b3c");
        return;
      }
    }
    if (!apiMode) {
      applyTenantThemeCss({
        id: "demo",
        slug: "tlo",
        nombre: "TLO",
        estatus: "activo",
        logo_url: logoUrl || undefined,
        color_primary: colorPrimary || undefined,
        color_accent: colorAccent || undefined,
        color_sidebar: colorSidebar || undefined,
      });
      toast.success("Modo demo: tema aplicado solo en este navegador.");
      return;
    }
    setLoading(true);
    try {
      const payload: Record<string, string | null> = {};
      if (logoUrl.trim() === "") payload.logo_url = "";
      else if (logoUrl.trim()) payload.logo_url = logoUrl.trim();
      if (colorPrimary) payload.color_primary = colorPrimary;
      else payload.color_primary = null;
      if (colorAccent) payload.color_accent = colorAccent;
      else payload.color_accent = null;
      if (colorSidebar) payload.color_sidebar = colorSidebar;
      else payload.color_sidebar = null;

      const res = await apiFetch("/tenant/theme", { method: "PATCH", body: JSON.stringify(payload) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(typeof body.error === "string" ? body.error : "No se pudo guardar el tema");
        return;
      }
      const next = body as Tenant;
      setTenant(next);
      applyTenantThemeCss(next);
      await refreshTenant();
      toast.success("Marca actualizada");
    } finally {
      setLoading(false);
    }
  };

  if (!hasPermission("marca.gestionar")) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="max-w-lg space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5" />
            Marca y tema
          </CardTitle>
          <CardDescription>Logo (URL) y colores de la interfaz. Los colores usan formato #RRGGBB.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="logo">URL del logo</Label>
            <Input id="logo" type="url" value={logoUrl} onChange={e => setLogoUrl(e.target.value)} placeholder="https://…" />
            <p className="text-[11px] text-muted-foreground mt-1">Dejar vacío y guardar quita el logo personalizado.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <Label htmlFor="cp">Primario</Label>
              <Input id="cp" value={colorPrimary} onChange={e => setColorPrimary(e.target.value)} placeholder="#141a22" />
            </div>
            <div>
              <Label htmlFor="ca">Acento</Label>
              <Input id="ca" value={colorAccent} onChange={e => setColorAccent(e.target.value)} placeholder="#2563eb" />
            </div>
            <div>
              <Label htmlFor="cs">Barra lateral</Label>
              <Input id="cs" value={colorSidebar} onChange={e => setColorSidebar(e.target.value)} placeholder="#0f172a" />
            </div>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={previewTheme}>
              Vista previa
            </Button>
            <Button onClick={() => void save()} disabled={loading} className="bg-primary text-primary-foreground">
              {loading ? "Guardando…" : "Guardar"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
