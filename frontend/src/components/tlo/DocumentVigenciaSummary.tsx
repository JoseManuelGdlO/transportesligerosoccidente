import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { fmtDate } from "@/lib/format";
import type { DocumentCatalogItem, DocumentCatalogStatus } from "@/types/tlo";
import {
  fetchDriverDocumentsCatalog,
  fetchTruckDocumentsCatalog,
} from "@/lib/tloApi";

type SlugDef = { slug: string; label: string };

const TRUCK_SLUGS: SlugDef[] = [
  { slug: "tarjeta_circulacion", label: "Tarjeta de circulación" },
  { slug: "fisico_mecanica", label: "Verificación físico-mecánica" },
  { slug: "verificacion_contaminantes", label: "Verificación de emisiones" },
  { slug: "permiso_sct", label: "Permiso SCT" },
];

const DRIVER_SLUGS: SlugDef[] = [
  { slug: "licencia_federal", label: "Licencia federal" },
  { slug: "apto_medico", label: "Apto médico" },
];

function statusBadge(status: DocumentCatalogStatus) {
  const map: Record<DocumentCatalogStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    pendiente: { label: "Pendiente", variant: "secondary" },
    vigente: { label: "Vigente", variant: "default" },
    por_vencer: { label: "Por vencer", variant: "outline" },
    vencido: { label: "Vencido", variant: "destructive" },
    sin_vigencia: { label: "Sin vigencia", variant: "secondary" },
  };
  const x = map[status];
  return <Badge variant={x.variant}>{x.label}</Badge>;
}

type Props = {
  kind: "driver" | "truck";
  entityId: string | null;
};

export function DocumentVigenciaSummary({ kind, entityId }: Props) {
  const [items, setItems] = useState<DocumentCatalogItem[]>([]);
  const slugs = kind === "driver" ? DRIVER_SLUGS : TRUCK_SLUGS;

  const load = useCallback(async () => {
    if (!entityId) return;
    const rows =
      kind === "driver"
        ? await fetchDriverDocumentsCatalog(entityId)
        : await fetchTruckDocumentsCatalog(entityId);
    setItems(rows);
  }, [entityId, kind]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!entityId) return null;

  return (
    <div className="rounded-md border border-dashed p-3 space-y-2">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        Vigencias (documentación)
      </p>
      <div className="space-y-2">
        {slugs.map(({ slug, label }) => {
          const row = items.find((i) => i.document_type.slug === slug);
          const doc = row?.document;
          return (
            <div key={slug} className="flex items-center justify-between gap-2 text-sm">
              <span className="text-muted-foreground">{label}</span>
              <div className="flex items-center gap-2">
                {doc?.vigencia_fin ? (
                  <span className="font-mono text-xs">{fmtDate(doc.vigencia_fin)}</span>
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
                {statusBadge(row?.status ?? "pendiente")}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
