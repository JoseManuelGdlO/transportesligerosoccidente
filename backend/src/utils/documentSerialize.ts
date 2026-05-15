import type { Document } from "../models/Document";
import type { DocumentType } from "../models/DocumentType";
import type { Notification } from "../models/Notification";

export function documentTypeToJson(d: DocumentType): Record<string, unknown> {
  return {
    id: d.id,
    tenant_id: d.tenant_id,
    slug: d.slug,
    nombre: d.nombre,
    aplica_a: d.aplica_a,
    dias_aviso: d.dias_aviso,
    requiere_vigencia: d.requiere_vigencia,
    activo: d.activo,
    created_at: d.createdAt,
    updated_at: d.updatedAt,
  };
}

export function documentToJson(d: Document): Record<string, unknown> {
  return {
    id: d.id,
    tenant_id: d.tenant_id,
    document_type_id: d.document_type_id,
    documentable_type: d.documentable_type,
    documentable_id: d.documentable_id,
    numero: d.numero,
    vigencia_inicio: d.vigencia_inicio,
    vigencia_fin: d.vigencia_fin,
    file_name: d.file_name,
    mime: d.mime,
    size: d.size,
    notas: d.notas,
    file_url: `/documents/${d.id}/file`,
    created_at: d.createdAt,
    updated_at: d.updatedAt,
  };
}

export function notificationToJson(n: Notification): Record<string, unknown> {
  return {
    id: n.id,
    tenant_id: n.tenant_id,
    user_id: n.user_id,
    tipo: n.tipo,
    payload: n.payload,
    document_id: n.document_id,
    alert_date: n.alert_date,
    leida: n.leida,
    created_at: n.createdAt,
  };
}
