import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/context/AuthContext";
import { apiFetch, hasApiConfigured } from "@/lib/api";
import type { Tenant } from "@/types/tlo";
import { toast } from "sonner";
import { Building2 } from "lucide-react";

export default function Empresa() {
  const { tenant: ctxTenant, hasPermission, refreshTenant, apiMode } = useAuth();
  const canEdit = hasPermission("empresa.gestionar");
  const [tenant, setTenant] = useState<Tenant | null>(ctxTenant);
  const [nombre, setNombre] = useState(ctxTenant?.nombre ?? "");
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
    })();
  }, []);

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

  return (
    <div className="max-w-lg space-y-4">
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
    </div>
  );
}
