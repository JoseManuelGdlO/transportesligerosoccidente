import { apiFetch, readJson } from "@/lib/api";
import type {
  Client,
  Driver,
  Expense,
  FuelLoad,
  Trip,
  Truck,
  SystemUser,
  RoleDefinition,
  UserRole,
  Permission,
  ExpenseCategory,
  TenantDocumentType,
  DocumentCatalogItem,
  CatalogDocument,
  NotificationItem,
  DocumentDashboardSummary,
  DocTypeRow,
} from "@/types/tlo";

const EXPENSE_CATS: ExpenseCategory[] = ["casetas", "refacciones", "hospedaje", "comidas", "otros"];

export function normalizeFuel(raw: Record<string, unknown>): FuelLoad {
  return {
    id: String(raw.id),
    litros: Number(raw.litros ?? 0),
    precio_litro: Number(raw.precio_litro ?? 0),
    ubicacion: String(raw.ubicacion ?? ""),
    fecha: String(raw.fecha ?? new Date().toISOString()),
  };
}

export function normalizeExpense(raw: Record<string, unknown>): Expense {
  const cat = raw.categoria;
  const categoria = EXPENSE_CATS.includes(cat as ExpenseCategory) ? (cat as ExpenseCategory) : "otros";
  return {
    id: String(raw.id),
    categoria,
    descripcion: String(raw.descripcion ?? ""),
    monto: Number(raw.monto ?? 0),
    comprobado: Boolean(raw.comprobado),
    fecha: String(raw.fecha ?? new Date().toISOString()),
  };
}

export function normalizeTrip(raw: Record<string, unknown>): Trip {
  const fuel = Array.isArray(raw.fuel) ? (raw.fuel as Record<string, unknown>[]).map(normalizeFuel) : [];
  const expenses = Array.isArray(raw.expenses)
    ? (raw.expenses as Record<string, unknown>[]).map(normalizeExpense)
    : [];
  return {
    id: String(raw.id),
    folio: String(raw.folio ?? ""),
    truck_id: String(raw.truck_id ?? ""),
    driver_id: String(raw.driver_id ?? ""),
    client_id: String(raw.client_id ?? ""),
    origen: String(raw.origen ?? ""),
    destino: String(raw.destino ?? ""),
    fecha_salida: String(raw.fecha_salida ?? ""),
    fecha_llegada: raw.fecha_llegada != null ? String(raw.fecha_llegada) : undefined,
    km_inicial: Number(raw.km_inicial ?? 0),
    km_final: raw.km_final != null ? Number(raw.km_final) : undefined,
    tarifa: Number(raw.tarifa ?? 0),
    viaticos_entregados: Number(raw.viaticos_entregados ?? 0),
    num_factura: raw.num_factura != null ? String(raw.num_factura) : undefined,
    comision_override: raw.comision_override != null ? Number(raw.comision_override) : undefined,
    estatus: raw.estatus === "cerrado" ? "cerrado" : "en_curso",
    fuel,
    expenses,
  };
}

export function normalizeTruck(raw: Record<string, unknown>): Truck {
  return {
    id: String(raw.id),
    numero_economico: String(raw.numero_economico ?? ""),
    placas: String(raw.placas ?? ""),
    marca: String(raw.marca ?? ""),
    modelo: String(raw.modelo ?? ""),
    anio: Number(raw.anio ?? new Date().getFullYear()),
    rendimiento_esperado: Number(raw.rendimiento_esperado ?? 0),
    costo_km_ref: Number(raw.costo_km_ref ?? 0),
    estatus: (raw.estatus === "taller" || raw.estatus === "baja" ? raw.estatus : "activo") as Truck["estatus"],
  };
}

export function normalizeDriver(raw: Record<string, unknown>): Driver {
  const fi = raw.fecha_ingreso;
  return {
    id: String(raw.id),
    nombre: String(raw.nombre ?? ""),
    telefono: String(raw.telefono ?? ""),
    licencia: String(raw.licencia ?? ""),
    fecha_ingreso: fi instanceof Date ? fi.toISOString().slice(0, 10) : String(fi ?? "").slice(0, 10),
    comision_tipo: raw.comision_tipo === "fijo" ? "fijo" : "porcentaje",
    comision_valor: Number(raw.comision_valor ?? 0),
    estatus: raw.estatus === "inactivo" ? "inactivo" : "activo",
  };
}

export function normalizeClient(raw: Record<string, unknown>): Client {
  return {
    id: String(raw.id),
    razon_social: String(raw.razon_social ?? ""),
    rfc: String(raw.rfc ?? ""),
    contacto: String(raw.contacto ?? ""),
    telefono: String(raw.telefono ?? ""),
  };
}

export function normalizeSystemUser(raw: Record<string, unknown>): SystemUser {
  const role = raw.role === "capturista" ? "capturista" : "admin";
  return {
    id: String(raw.id),
    nombre: String(raw.nombre ?? ""),
    email: String(raw.email ?? ""),
    role: role as UserRole,
    estatus: raw.estatus === "inactivo" ? "inactivo" : "activo",
    ultimo_acceso: raw.ultimo_acceso != null ? String(raw.ultimo_acceso) : undefined,
    creado_en: String(raw.creado_en ?? new Date().toISOString()),
  };
}

export function normalizeRoleDefinition(raw: Record<string, unknown>): RoleDefinition {
  const perms = Array.isArray(raw.permisos) ? (raw.permisos as string[]).filter((p): p is Permission => typeof p === "string") : [];
  return {
    role: (raw.role === "capturista" ? "capturista" : "admin") as UserRole,
    nombre: String(raw.nombre ?? ""),
    descripcion: String(raw.descripcion ?? ""),
    permisos: perms,
  };
}

export async function fetchTloCatalog(): Promise<{
  trucks: Truck[];
  drivers: Driver[];
  clients: Client[];
  trips: Trip[];
}> {
  const [trRes, drRes, clRes, viRes] = await Promise.all([
    apiFetch("/trucks"),
    apiFetch("/drivers"),
    apiFetch("/clients"),
    apiFetch("/trips"),
  ]);
  const trucksJson = await readJson<unknown[]>(trRes);
  const driversJson = await readJson<unknown[]>(drRes);
  const clientsJson = await readJson<unknown[]>(clRes);
  const tripsJson = await readJson<unknown[]>(viRes);
  return {
    trucks: trucksJson.map((x) => normalizeTruck(x as Record<string, unknown>)),
    drivers: driversJson.map((x) => normalizeDriver(x as Record<string, unknown>)),
    clients: clientsJson.map((x) => normalizeClient(x as Record<string, unknown>)),
    trips: tripsJson.map((x) => normalizeTrip(x as Record<string, unknown>)),
  };
}

export async function fetchUsersAndRoles(): Promise<{ systemUsers: SystemUser[]; roles: RoleDefinition[] }> {
  const [uRes, rRes] = await Promise.all([apiFetch("/users"), apiFetch("/roles")]);
  const usersJson = await readJson<unknown[]>(uRes);
  const rolesJson = await readJson<unknown[]>(rRes);
  return {
    systemUsers: usersJson.map((x) => normalizeSystemUser(x as Record<string, unknown>)),
    roles: rolesJson.map((x) => normalizeRoleDefinition(x as Record<string, unknown>)),
  };
}

export function normalizeTenantDocType(raw: Record<string, unknown>): TenantDocumentType {
  return {
    id: String(raw.id),
    tenant_id: String(raw.tenant_id ?? ""),
    slug: String(raw.slug ?? ""),
    nombre: String(raw.nombre ?? ""),
    aplica_a: raw.aplica_a === "unidad" ? "unidad" : "operador",
    dias_aviso: Number(raw.dias_aviso ?? 30),
    requiere_vigencia: Boolean(raw.requiere_vigencia),
    activo: raw.activo === false ? false : true,
    created_at: raw.created_at != null ? String(raw.created_at) : undefined,
    updated_at: raw.updated_at != null ? String(raw.updated_at) : undefined,
  };
}

export function normalizeCatalogDocument(raw: Record<string, unknown>): CatalogDocument {
  return {
    id: String(raw.id),
    tenant_id: String(raw.tenant_id ?? ""),
    document_type_id: String(raw.document_type_id ?? ""),
    documentable_type: raw.documentable_type === "truck" ? "truck" : "driver",
    documentable_id: String(raw.documentable_id ?? ""),
    numero: raw.numero != null ? String(raw.numero) : null,
    vigencia_inicio: raw.vigencia_inicio != null ? String(raw.vigencia_inicio).slice(0, 10) : null,
    vigencia_fin: raw.vigencia_fin != null ? String(raw.vigencia_fin).slice(0, 10) : null,
    file_name: raw.file_name != null ? String(raw.file_name) : null,
    mime: raw.mime != null ? String(raw.mime) : null,
    size: raw.size != null ? Number(raw.size) : null,
    notas: raw.notas != null ? String(raw.notas) : null,
    file_url: String(raw.file_url ?? ""),
    created_at: raw.created_at != null ? String(raw.created_at) : undefined,
    updated_at: raw.updated_at != null ? String(raw.updated_at) : undefined,
  };
}

function normalizeDocTypeRow(raw: Record<string, unknown>): DocTypeRow {
  return {
    id: String(raw.id),
    slug: String(raw.slug ?? ""),
    nombre: String(raw.nombre ?? ""),
    aplica_a: raw.aplica_a === "unidad" ? "unidad" : "operador",
    dias_aviso: Number(raw.dias_aviso ?? 30),
    requiere_vigencia: Boolean(raw.requiere_vigencia),
    activo: raw.activo === false ? false : true,
  };
}

export function normalizeDocumentCatalogItem(raw: Record<string, unknown>): DocumentCatalogItem {
  const dt = raw.document_type as Record<string, unknown> | undefined;
  const doc = raw.document;
  const st = raw.status;
  const status =
    st === "vigente" || st === "por_vencer" || st === "vencido" || st === "sin_vigencia" || st === "pendiente"
      ? st
      : "pendiente";
  return {
    document_type: dt ? normalizeDocTypeRow(dt) : normalizeDocTypeRow({}),
    document: doc && typeof doc === "object" ? normalizeCatalogDocument(doc as Record<string, unknown>) : null,
    status,
  };
}

export async function fetchTenantDocumentTypes(): Promise<TenantDocumentType[]> {
  const res = await apiFetch("/document-types");
  const j = await readJson<unknown[]>(res);
  return j.map((x) => normalizeTenantDocType(x as Record<string, unknown>));
}

export async function createDocumentType(body: {
  slug: string;
  nombre: string;
  aplica_a: "operador" | "unidad";
  dias_aviso?: number;
  requiere_vigencia?: boolean;
  activo?: boolean;
}): Promise<TenantDocumentType> {
  const res = await apiFetch("/document-types", {
    method: "POST",
    body: JSON.stringify(body),
  });
  const raw = await readJson<Record<string, unknown>>(res);
  return normalizeTenantDocType(raw);
}

export async function updateDocumentType(
  id: string,
  body: Partial<{
    slug: string;
    nombre: string;
    aplica_a: "operador" | "unidad";
    dias_aviso: number;
    requiere_vigencia: boolean;
    activo: boolean;
  }>,
): Promise<TenantDocumentType> {
  const res = await apiFetch(`/document-types/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
  const raw = await readJson<Record<string, unknown>>(res);
  return normalizeTenantDocType(raw);
}

export async function deleteDocumentType(id: string): Promise<void> {
  const res = await apiFetch(`/document-types/${id}`, { method: "DELETE" });
  if (res.ok || res.status === 204) return;
  await readJson(res);
}

export async function fetchDriverDocumentsCatalog(driverId: string): Promise<DocumentCatalogItem[]> {
  const res = await apiFetch(`/drivers/${driverId}/documents`);
  const j = await readJson<{ items?: unknown[] }>(res);
  const items = Array.isArray(j.items) ? j.items : [];
  return items.map((x) => normalizeDocumentCatalogItem(x as Record<string, unknown>));
}

export async function fetchTruckDocumentsCatalog(truckId: string): Promise<DocumentCatalogItem[]> {
  const res = await apiFetch(`/trucks/${truckId}/documents`);
  const j = await readJson<{ items?: unknown[] }>(res);
  const items = Array.isArray(j.items) ? j.items : [];
  return items.map((x) => normalizeDocumentCatalogItem(x as Record<string, unknown>));
}

export async function postDriverDocument(
  driverId: string,
  form: FormData,
): Promise<CatalogDocument> {
  const res = await apiFetch(`/drivers/${driverId}/documents`, { method: "POST", body: form });
  const raw = await readJson<Record<string, unknown>>(res);
  return normalizeCatalogDocument(raw);
}

export async function postTruckDocument(truckId: string, form: FormData): Promise<CatalogDocument> {
  const res = await apiFetch(`/trucks/${truckId}/documents`, { method: "POST", body: form });
  const raw = await readJson<Record<string, unknown>>(res);
  return normalizeCatalogDocument(raw);
}

export async function patchDocument(documentId: string, form: FormData): Promise<CatalogDocument> {
  const res = await apiFetch(`/documents/${documentId}`, { method: "PATCH", body: form });
  const raw = await readJson<Record<string, unknown>>(res);
  return normalizeCatalogDocument(raw);
}

export async function deleteDocument(documentId: string): Promise<void> {
  const res = await apiFetch(`/documents/${documentId}`, { method: "DELETE" });
  if (res.ok) return;
  const text = await res.text();
  let msg = res.statusText;
  try {
    const j = JSON.parse(text) as { error?: string };
    if (typeof j.error === "string") msg = j.error;
  } catch {
    /* ignore */
  }
  throw new Error(msg || `HTTP ${res.status}`);
}

export async function fetchDocumentDashboard(): Promise<DocumentDashboardSummary> {
  const res = await apiFetch("/documents/dashboard");
  return readJson<DocumentDashboardSummary>(res);
}

export async function fetchNotifications(): Promise<NotificationItem[]> {
  const res = await apiFetch("/notifications");
  const j = await readJson<{ items?: unknown[] }>(res);
  const items = Array.isArray(j.items) ? j.items : [];
  return items.map((x) => {
    const r = x as Record<string, unknown>;
    return {
      id: String(r.id),
      tipo: String(r.tipo ?? ""),
      payload: (typeof r.payload === "object" && r.payload !== null ? r.payload : {}) as Record<string, unknown>,
      document_id: r.document_id != null ? String(r.document_id) : null,
      alert_date: String(r.alert_date ?? ""),
      leida: Boolean(r.leida),
      created_at: r.created_at != null ? String(r.created_at) : undefined,
    };
  });
}

export async function markNotificationRead(id: string): Promise<void> {
  const res = await apiFetch(`/notifications/${id}/read`, { method: "PATCH", body: "{}" });
  await readJson(res);
}

export async function markAllNotificationsRead(): Promise<void> {
  const res = await apiFetch("/notifications/mark-all-read", { method: "POST", body: "{}" });
  await readJson(res);
}

export async function fetchPushPublicKey(): Promise<string | null> {
  const res = await apiFetch("/push/public-key");
  if (!res.ok) return null;
  const j = await readJson<{ publicKey?: string }>(res);
  return typeof j.publicKey === "string" ? j.publicKey : null;
}

export async function subscribePush(subscription: { endpoint: string; keys: { p256dh: string; auth: string } }) {
  const res = await apiFetch("/push/subscribe", {
    method: "POST",
    body: JSON.stringify(subscription),
  });
  await readJson(res);
}

export async function unsubscribePush(endpoint: string) {
  const res = await apiFetch("/push/unsubscribe", {
    method: "POST",
    body: JSON.stringify({ endpoint }),
  });
  await readJson(res);
}

export async function openAuthenticatedFile(fileUrlPath: string): Promise<void> {
  const path = fileUrlPath.startsWith("/") ? fileUrlPath : `/${fileUrlPath}`;
  const res = await apiFetch(path);
  if (!res.ok) throw new Error("No se pudo abrir el archivo");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener,noreferrer");
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
