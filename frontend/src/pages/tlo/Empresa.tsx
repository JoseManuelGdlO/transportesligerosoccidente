import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/context/AuthContext";
import { apiFetch, hasApiConfigured } from "@/lib/api";
import type { Tenant, TenantFiscal } from "@/types/tlo";
import { toast } from "sonner";
import { Building2, FileText } from "lucide-react";
import { FEATURE_CARTA_PORTE } from "@/config/features";

export default function Empresa() {
  const { tenant: ctxTenant, hasPermission, refreshTenant, apiMode } = useAuth();
  const canEdit = hasPermission("empresa.gestionar");
  const canFiscal = hasPermission("fiscal.configurar");
  const [tenant, setTenant] = useState<Tenant | null>(ctxTenant);
  const [nombre, setNombre] = useState(ctxTenant?.nombre ?? "");
  const [fiscal, setFiscal] = useState<TenantFiscal>({});
  const [pacToken, setPacToken] = useState("");
  const [csdPassword, setCsdPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setTenant(ctxTenant);
    setNombre(ctxTenant?.nombre ?? "");
  }, [ctxTenant]);

  useEffect(() => {
    if (!hasApiConfigured()) return;
    (async () => {
      const res = await apiFetch("/tenant");
      if (!res.ok) return;
      const data = (await res.json()) as Tenant;
      setTenant(data);
      setNombre(data.nombre);
      if (canFiscal) {
        const fr = await apiFetch("/tenant/fiscal");
        if (fr.ok) setFiscal((await fr.json()) as TenantFiscal);
      }
    })();
  }, [canFiscal]);

  const save = async () => {
    if (!canEdit || !nombre.trim()) {
      toast.error("Nombre inválido o sin permiso");
      return;
    }
    if (!apiMode) {
      toast.success("Modo demo: los datos no se envían al servidor.");
      return;
    }
    setLoading(true);
    try {
      const res = await apiFetch("/tenant", { method: "PATCH", body: JSON.stringify({ nombre: nombre.trim() }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(typeof body.error === "string" ? body.error : "No se pudo guardar");
        return;
      }
      setTenant(body as Tenant);
      await refreshTenant();
      toast.success("Empresa actualizada");
    } finally {
      setLoading(false);
    }
  };

  const saveFiscal = async () => {
    if (!canFiscal || !apiMode) return;
    setLoading(true);
    try {
      const body: Record<string, unknown> = { ...fiscal };
      if (pacToken) body.pac_token = pacToken;
      if (csdPassword) body.csd_password = csdPassword;
      const res = await apiFetch("/tenant/fiscal", { method: "PATCH", body: JSON.stringify(body) });
      if (!res.ok) {
        toast.error("No se pudo guardar configuración fiscal");
        return;
      }
      setFiscal((await res.json()) as TenantFiscal);
      setPacToken("");
      setCsdPassword("");
      toast.success("Configuración fiscal guardada");
    } finally {
      setLoading(false);
    }
  };

  const uploadCsd = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const cer = e.target.files?.[0];
    const keyInput = document.getElementById("csd-key") as HTMLInputElement | null;
    const key = keyInput?.files?.[0];
    if (!cer || !key) {
      toast.error("Selecciona archivo .cer y .key");
      return;
    }
    const fd = new FormData();
    fd.append("cer", cer);
    fd.append("key", key);
    const res = await apiFetch("/tenant/fiscal/csd", { method: "POST", body: fd });
    if (!res.ok) {
      toast.error("No se pudieron subir los certificados");
      return;
    }
    setFiscal((await res.json()) as TenantFiscal);
    toast.success("CSD cargado");
  };

  return (
    <div className="max-w-2xl space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Empresa
          </CardTitle>
          <CardDescription>Datos visibles de la empresa. El código (slug) no se modifica desde aquí.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {tenant && (
            <div className="flex flex-wrap gap-2 text-sm">
              <Badge variant="secondary">Slug: {tenant.slug}</Badge>
              <Badge variant="outline">Estado: {tenant.estatus}</Badge>
            </div>
          )}
          <div>
            <Label htmlFor="nombre">Nombre comercial</Label>
            <Input id="nombre" value={nombre} onChange={e => setNombre(e.target.value)} disabled={!canEdit} />
          </div>
          {!canEdit && (
            <p className="text-sm text-muted-foreground">No tienes permiso para editar la empresa (empresa.gestionar).</p>
          )}
          <Button onClick={() => void save()} disabled={!canEdit || loading} className="bg-primary text-primary-foreground">
            {loading ? "Guardando…" : "Guardar cambios"}
          </Button>
        </CardContent>
      </Card>
      {FEATURE_CARTA_PORTE && canFiscal && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><FileText className="h-5 w-5" /> Datos fiscales (Carta Porte)</CardTitle>
            <CardDescription>RFC, régimen, CP fiscal y certificado CSD para timbrado SAT.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>RFC</Label><Input value={fiscal.rfc || ""} onChange={e => setFiscal({ ...fiscal, rfc: e.target.value })} placeholder="XAXX010101000" /></div>
              <div><Label>Régimen fiscal</Label><Input value={fiscal.regimen_fiscal || ""} onChange={e => setFiscal({ ...fiscal, regimen_fiscal: e.target.value })} placeholder="601" /></div>
              <div className="col-span-2"><Label>Razón social</Label><Input value={fiscal.razon_social || ""} onChange={e => setFiscal({ ...fiscal, razon_social: e.target.value })} /></div>
              <div><Label>CP fiscal</Label><Input value={fiscal.cp_fiscal || ""} onChange={e => setFiscal({ ...fiscal, cp_fiscal: e.target.value })} maxLength={5} placeholder="44100" /></div>
            </div>
            <div className="pt-3 border-t space-y-3">
              <p className="text-sm font-medium">PAC Sicofi</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Proveedor</Label>
                  <Input
                    value={fiscal.pac_proveedor || "stub"}
                    onChange={(e) => setFiscal({ ...fiscal, pac_proveedor: e.target.value })}
                    placeholder="stub | sicofi"
                  />
                </div>
                <div>
                  <Label>URL API base</Label>
                  <Input
                    value={fiscal.pac_url || ""}
                    onChange={(e) => setFiscal({ ...fiscal, pac_url: e.target.value })}
                    placeholder="https://demo.sicofi.com.mx/DFWSR/api"
                  />
                </div>
                <div>
                  <Label>Usuario Sicofi</Label>
                  <Input
                    value={fiscal.pac_usuario || ""}
                    onChange={(e) => setFiscal({ ...fiscal, pac_usuario: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Contraseña Sicofi</Label>
                  <Input
                    type="password"
                    value={pacToken}
                    onChange={(e) => setPacToken(e.target.value)}
                    placeholder={fiscal.has_pac_token ? "•••••• (dejar vacío para no cambiar)" : ""}
                  />
                </div>
                <div>
                  <Label>Método pago default</Label>
                  <Input
                    value={fiscal.metodo_pago_default || "PPD"}
                    onChange={(e) => setFiscal({ ...fiscal, metodo_pago_default: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Forma pago default</Label>
                  <Input
                    value={fiscal.forma_pago_default || "99"}
                    onChange={(e) => setFiscal({ ...fiscal, forma_pago_default: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Uso CFDI default</Label>
                  <Input
                    value={fiscal.uso_cfdi_default || "G03"}
                    onChange={(e) => setFiscal({ ...fiscal, uso_cfdi_default: e.target.value })}
                  />
                </div>
                <div>
                  <Label>IVA % default</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={fiscal.iva_tasa_default != null ? fiscal.iva_tasa_default * 100 : 16}
                    onChange={(e) =>
                      setFiscal({
                        ...fiscal,
                        iva_tasa_default: Number(e.target.value) / 100,
                      })
                    }
                  />
                </div>
                <div>
                  <Label>Retención % default</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={
                      fiscal.retencion_tasa_default != null ? fiscal.retencion_tasa_default * 100 : 4
                    }
                    onChange={(e) =>
                      setFiscal({
                        ...fiscal,
                        retencion_tasa_default: Number(e.target.value) / 100,
                      })
                    }
                  />
                </div>
                <div className="col-span-2">
                  <Label>Condiciones de pago</Label>
                  <Input
                    value={fiscal.condiciones_pago_default || ""}
                    onChange={(e) =>
                      setFiscal({ ...fiscal, condiciones_pago_default: e.target.value })
                    }
                  />
                </div>
              </div>
            </div>
            <div className="pt-3 border-t space-y-2">
              <p className="text-sm font-medium">Certificado CSD</p>
              {fiscal.has_csd ? <Badge variant="outline">CSD cargado</Badge> : <p className="text-xs text-muted-foreground">Selecciona .cer y .key; al elegir .cer se suben ambos archivos</p>}
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Archivo .cer</Label><Input type="file" accept=".cer" onChange={e => void uploadCsd(e)} /></div>
                <div><Label>Archivo .key</Label><Input id="csd-key" type="file" accept=".key" /></div>
                <div className="col-span-2"><Label>Contraseña llave</Label><Input type="password" value={csdPassword} onChange={e => setCsdPassword(e.target.value)} placeholder="Contraseña del CSD" /></div>
              </div>
            </div>
            <Button onClick={() => void saveFiscal()} disabled={loading}>Guardar datos fiscales</Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
