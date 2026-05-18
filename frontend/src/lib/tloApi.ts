import { apiFetch, readJson } from "@/lib/api";
import type {
  CartaPorteRecord,
  Client,
  Driver,
  Expense,
  FuelLoad,
  FuelTicket,
  FuelProrationReport,
  FuelSummaryRow,
  FuelImportResult,
  Trip,
  TripMercancia,
  TripUbicacion,
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

export function normalizeTripUbicacion(raw: Record<string, unknown>): TripUbicacion {
  return {
    id: String(raw.id),
    tipo: raw.tipo === "Destino" ? "Destino" : "Origen",
    rfc: raw.rfc != null ? String(raw.rfc) : undefined,
    nombre: raw.nombre != null ? String(raw.nombre) : undefined,
    fecha_hora: raw.fecha_hora != null ? String(raw.fecha_hora) : undefined,
    calle: raw.calle != null ? String(raw.calle) : undefined,
    colonia: raw.colonia != null ? String(raw.colonia) : undefined,
    municipio: raw.municipio != null ? String(raw.municipio) : undefined,
    localidad: raw.localidad != null ? String(raw.localidad) : undefined,
    estado: raw.estado != null ? String(raw.estado) : undefined,
    cp: raw.cp != null ? String(raw.cp) : undefined,
    distancia_km: raw.distancia_km != null ? Number(raw.distancia_km) : undefined,
  };
}

export function normalizeTripMercancia(raw: Record<string, unknown>): TripMercancia {
  return {
    id: String(raw.id),
    descripcion: String(raw.descripcion ?? ""),
    cantidad: Number(raw.cantidad ?? 1),
    unidad: String(raw.unidad ?? "H87"),
    peso_kg: Number(raw.peso_kg ?? 0),
    clave_prod_serv: raw.clave_prod_serv != null ? String(raw.clave_prod_serv) : undefined,
    material_peligroso: Boolean(raw.material_peligroso),
    embalaje: raw.embalaje != null ? String(raw.embalaje) : undefined,
  };
}

export function normalizeCartaPorte(raw: Record<string, unknown>): CartaPorteRecord {
  const estatus = raw.estatus;
  const e: CartaPorteRecord["estatus"] =
    estatus === "timbrada" || estatus === "cancelada" || estatus === "error" ? estatus : "borrador";
  return {
    id: String(raw.id),
    trip_id: String(raw.trip_id ?? ""),
    estatus: e,
    uuid: raw.uuid != null ? String(raw.uuid) : undefined,
    serie: raw.serie != null ? String(raw.serie) : undefined,
    folio_cfdi: raw.folio_cfdi != null ? String(raw.folio_cfdi) : undefined,
    pac_proveedor: raw.pac_proveedor != null ? String(raw.pac_proveedor) : undefined,
    error_mensaje: raw.error_mensaje != null ? String(raw.error_mensaje) : undefined,
    timbrado_at: raw.timbrado_at != null ? String(raw.timbrado_at) : undefined,
    has_xml: Boolean(raw.has_xml),
  };
}

export function normalizeTrip(raw: Record<string, unknown>): Trip {
  const fuel = Array.isArray(raw.fuel) ? (raw.fuel as Record<string, unknown>[]).map(normalizeFuel) : [];
  const expenses = Array.isArray(raw.expenses)
    ? (raw.expenses as Record<string, unknown>[]).map(normalizeExpense)
    : [];
  const ubicaciones = Array.isArray(raw.ubicaciones)
    ? (raw.ubicaciones as Record<string, unknown>[]).map(normalizeTripUbicacion)
    : undefined;
  const mercancias = Array.isArray(raw.mercancias)
    ? (raw.mercancias as Record<string, unknown>[]).map(normalizeTripMercancia)
    : undefined;
  const carta_porte =
    raw.carta_porte && typeof raw.carta_porte === "object"
      ? normalizeCartaPorte(raw.carta_porte as Record<string, unknown>)
      : undefined;
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
    ubicaciones,
    mercancias,
    carta_porte,
  };
}

export function normalizeTruck(raw: Record<string, unknown>): Truck {
  return {
    id: String(raw.id),
    numero_economico: String(raw.numero_economico ?? ""),
    placas: String(raw.placas ?? ""),
    folio_tag: raw.folio_tag != null ? String(raw.folio_tag) : undefined,
    marca: String(raw.marca ?? ""),
    modelo: String(raw.modelo ?? ""),
    anio: Number(raw.anio ?? new Date().getFullYear()),
    rendimiento_esperado: Number(raw.rendimiento_esperado ?? 0),
    costo_km_ref: Number(raw.costo_km_ref ?? 0),
    estatus: (raw.estatus === "taller" || raw.estatus === "baja" ? raw.estatus : "activo") as Truck["estatus"],
    config_vehicular: raw.config_vehicular != null ? String(raw.config_vehicular) : undefined,
    perm_sct: raw.perm_sct != null ? String(raw.perm_sct) : undefined,
    num_permiso_sct: raw.num_permiso_sct != null ? String(raw.num_permiso_sct) : undefined,
    peso_bruto_vehicular: raw.peso_bruto_vehicular != null ? Number(raw.peso_bruto_vehicular) : undefined,
    aseguradora_resp_civil: raw.aseguradora_resp_civil != null ? String(raw.aseguradora_resp_civil) : undefined,
    poliza_resp_civil: raw.poliza_resp_civil != null ? String(raw.poliza_resp_civil) : undefined,
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
    rfc: raw.rfc != null ? String(raw.rfc) : undefined,
    licencia_federal: raw.licencia_federal != null ? String(raw.licencia_federal) : undefined,
  };
}

export function normalizeClient(raw: Record<string, unknown>): Client {
  return {
    id: String(raw.id),
    razon_social: String(raw.razon_social ?? ""),
    rfc: String(raw.rfc ?? ""),
    contacto: String(raw.contacto ?? ""),
    telefono: String(raw.telefono ?? ""),
    calle: raw.calle != null ? String(raw.calle) : undefined,
    colonia: raw.colonia != null ? String(raw.colonia) : undefined,
    municipio: raw.municipio != null ? String(raw.municipio) : undefined,
    estado: raw.estado != null ? String(raw.estado) : undefined,
    cp: raw.cp != null ? String(raw.cp) : undefined,
    pais: raw.pais != null ? String(raw.pais) : undefined,
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

export function normalizeFuelTicket(raw: Record<string, unknown>): FuelTicket {
  const origen = raw.origen;
  const o: FuelTicket["origen"] =
    origen === "import_excel" || origen === "api" ? origen : "manual";
  return {
    id: String(raw.id),
    truck_id: String(raw.truck_id ?? ""),
    fecha: String(raw.fecha ?? "").slice(0, 10),
    hora: raw.hora != null ? String(raw.hora) : undefined,
    folio_tag: raw.folio_tag != null ? String(raw.folio_tag) : undefined,
    numero_economico_raw: raw.numero_economico_raw != null ? String(raw.numero_economico_raw) : undefined,
    placas_raw: raw.placas_raw != null ? String(raw.placas_raw) : undefined,
    odometro: Number(raw.odometro ?? 0),
    litros: Number(raw.litros ?? 0),
    precio_litro: Number(raw.precio_litro ?? 0),
    importe_total: Number(raw.importe_total ?? 0),
    ubicacion: String(raw.ubicacion ?? ""),
    origen: o,
    external_id: raw.external_id != null ? String(raw.external_id) : undefined,
    numero_economico: raw.numero_economico != null ? String(raw.numero_economico) : undefined,
    placas: raw.placas != null ? String(raw.placas) : undefined,
  };
}

export async function fetchFuelTickets(params: {
  truck_id?: string;
  inicio?: string;
  fin?: string;
}): Promise<FuelTicket[]> {
  const q = new URLSearchParams();
  if (params.truck_id) q.set("truck_id", params.truck_id);
  if (params.inicio) q.set("inicio", params.inicio);
  if (params.fin) q.set("fin", params.fin);
  const qs = q.toString();
  const res = await apiFetch(`/fuel-tickets${qs ? `?${qs}` : ""}`);
  const j = await readJson<unknown[]>(res);
  return j.map((x) => normalizeFuelTicket(x as Record<string, unknown>));
}

export async function createFuelTicket(body: Omit<FuelTicket, "id" | "numero_economico" | "placas">): Promise<FuelTicket> {
  const res = await apiFetch("/fuel-tickets", { method: "POST", body: JSON.stringify(body) });
  const raw = await readJson<Record<string, unknown>>(res);
  return normalizeFuelTicket(raw);
}

export async function updateFuelTicket(
  id: string,
  body: Partial<Omit<FuelTicket, "id" | "numero_economico" | "placas">>,
): Promise<FuelTicket> {
  const res = await apiFetch(`/fuel-tickets/${id}`, { method: "PATCH", body: JSON.stringify(body) });
  const raw = await readJson<Record<string, unknown>>(res);
  return normalizeFuelTicket(raw);
}

export async function deleteFuelTicket(id: string): Promise<void> {
  const res = await apiFetch(`/fuel-tickets/${id}`, { method: "DELETE" });
  if (res.ok || res.status === 204) return;
  await readJson(res);
}

export type FuelSyncResult = {
  tenant_id: string;
  tenant_nombre: string;
  inicio: string;
  fin: string;
  status: "ok" | "error" | "skipped";
  import?: FuelImportResult;
  unidades_con_tickets?: number;
  error?: string;
};

export async function syncFuelTickets(params?: { inicio?: string; fin?: string }): Promise<FuelSyncResult> {
  const res = await apiFetch("/fuel-tickets/sync", {
    method: "POST",
    body: JSON.stringify(params ?? {}),
  });
  const data = await readJson<FuelSyncResult>(res);
  if (!res.ok) {
    throw new Error(data.error || "No se pudo sincronizar con el proveedor");
  }
  return data;
}

export async function importFuelTickets(file: File): Promise<FuelImportResult> {
  const form = new FormData();
  form.append("file", file);
  const res = await apiFetch("/fuel-tickets/import", { method: "POST", body: form });
  return readJson<FuelImportResult>(res);
}

export async function fetchFuelProration(inicio: string, fin: string): Promise<FuelProrationReport> {
  const q = new URLSearchParams({ inicio, fin });
  const res = await apiFetch(`/reports/fuel/proration?${q}`);
  return readJson<FuelProrationReport>(res);
}

export async function fetchFuelSummary(
  inicio: string,
  fin: string,
): Promise<{ inicio: string; fin: string; unidades: FuelSummaryRow[] }> {
  const q = new URLSearchParams({ inicio, fin });
  const res = await apiFetch(`/reports/fuel/summary?${q}`);
  return readJson(res);
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
