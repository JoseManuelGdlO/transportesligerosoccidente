export type TruckStatus = "activo" | "taller" | "baja";
export type DriverStatus = "activo" | "inactivo";
export type TripStatus = "en_curso" | "cerrado";
export type CommissionType = "porcentaje" | "fijo";
export type ExpenseCategory = "casetas" | "refacciones" | "hospedaje" | "comidas" | "otros";
export type UserRole = "admin" | "capturista";
export type UserStatus = "activo" | "inactivo";

export type Permission =
  | "viajes.ver"
  | "viajes.crear"
  | "viajes.cerrar"
  | "viajes.eliminar"
  | "liquidaciones.ver"
  | "liquidaciones.cerrar"
  | "catalogos.ver"
  | "catalogos.editar"
  | "reportes.ver"
  | "usuarios.gestionar"
  | "empresa.gestionar"
  | "marca.gestionar"
  | "documentos.ver"
  | "documentos.editar"
  | "tipos_documento.gestionar"
  | "notificaciones.ver"
  | "cartaporte.ver"
  | "cartaporte.timbrar"
  | "cartaporte.cancelar"
  | "fiscal.configurar"
  | "combustibles.ver"
  | "combustibles.crear"
  | "combustibles.importar"
  | "combustibles.eliminar";

/** Todos los permisos conocidos (alineado con el backend). */
export const FULL_ADMIN_PERMISSIONS: Permission[] = [
  "viajes.ver",
  "viajes.crear",
  "viajes.cerrar",
  "viajes.eliminar",
  "liquidaciones.ver",
  "liquidaciones.cerrar",
  "catalogos.ver",
  "catalogos.editar",
  "reportes.ver",
  "usuarios.gestionar",
  "empresa.gestionar",
  "marca.gestionar",
  "documentos.ver",
  "documentos.editar",
  "tipos_documento.gestionar",
  "notificaciones.ver",
  "cartaporte.ver",
  "cartaporte.timbrar",
  "cartaporte.cancelar",
  "fiscal.configurar",
  "combustibles.ver",
  "combustibles.crear",
  "combustibles.importar",
  "combustibles.eliminar",
];

export type CartaPorteEstatus = "borrador" | "timbrada" | "cancelada" | "error";
export type UbicacionTipo = "Origen" | "Destino";

export interface TripUbicacion {
  id: string;
  tipo: UbicacionTipo;
  rfc?: string;
  nombre?: string;
  fecha_hora?: string;
  calle?: string;
  colonia?: string;
  municipio?: string;
  localidad?: string;
  estado?: string;
  cp?: string;
  distancia_km?: number;
}

export interface TripMercancia {
  id: string;
  descripcion: string;
  cantidad: number;
  unidad: string;
  peso_kg: number;
  clave_prod_serv?: string;
  material_peligroso: boolean;
  embalaje?: string;
}

export interface CartaPorteRecord {
  id: string;
  trip_id: string;
  estatus: CartaPorteEstatus;
  uuid?: string;
  serie?: string;
  folio_cfdi?: string;
  pac_proveedor?: string;
  error_mensaje?: string;
  timbrado_at?: string;
  has_xml?: boolean;
}

export interface TenantFiscal {
  rfc?: string;
  razon_social?: string;
  regimen_fiscal?: string;
  cp_fiscal?: string;
  calle_fiscal?: string;
  colonia_fiscal?: string;
  municipio_fiscal?: string;
  estado_fiscal?: string;
  pac_proveedor?: string;
  pac_url?: string;
  pac_usuario?: string;
  has_pac_token?: boolean;
  has_csd?: boolean;
  cfdi_serie?: string;
}

export type TenantStatus = "activo" | "suspendido";

export interface Tenant {
  id: string;
  slug: string;
  nombre: string;
  estatus: TenantStatus;
  logo_url?: string;
  color_primary?: string;
  color_accent?: string;
  color_sidebar?: string;
}

export interface SystemUser {
  id: string;
  nombre: string;
  email: string;
  role: UserRole;
  estatus: UserStatus;
  ultimo_acceso?: string;
  creado_en: string;
}

export interface RoleDefinition {
  role: UserRole;
  nombre: string;
  descripcion: string;
  permisos: Permission[];
}

export type FuelTicketOrigen = "manual" | "import_excel" | "api";

export interface FuelTicket {
  id: string;
  truck_id: string;
  fecha: string;
  hora?: string;
  folio_tag?: string;
  numero_economico_raw?: string;
  placas_raw?: string;
  odometro: number;
  litros: number;
  precio_litro: number;
  importe_total: number;
  ubicacion: string;
  origen: FuelTicketOrigen;
  external_id?: string;
  numero_economico?: string;
  placas?: string;
}

export interface ProratedTripRow {
  trip_id: string;
  folio: string;
  origen: string;
  destino: string;
  fecha_salida: string;
  km_recorridos: number;
  litros_asignados: number;
  costo_asignado: number;
}

export interface ProratedTicketBlock {
  ticket_id: string;
  fecha: string;
  hora?: string;
  litros: number;
  precio_litro: number;
  importe_total: number;
  odometro: number;
  ubicacion: string;
  km_total_periodo: number;
  rendimiento_periodo: number | null;
  sin_asignar: boolean;
  viajes: ProratedTripRow[];
}

export interface FuelProrationUnitReport {
  truck_id: string;
  numero_economico: string;
  inicio: string;
  fin: string;
  tickets: ProratedTicketBlock[];
  resumen: {
    total_litros: number;
    total_km_viajes: number;
    total_viajes: number;
    rendimiento: number | null;
  };
}

export interface FuelProrationReport {
  inicio: string;
  fin: string;
  unidades: FuelProrationUnitReport[];
}

export interface FuelSummaryRow {
  truck_id: string;
  numero_economico: string;
  placas: string;
  viajes: number;
  km_recorridos: number;
  litros: number;
  rendimiento: number | null;
}

export interface FuelImportResult {
  creados: number;
  duplicados: number;
  errores: { fila: number; mensaje: string; datos?: Record<string, unknown> }[];
}

export interface Truck {
  id: string;
  numero_economico: string;
  placas: string;
  folio_tag?: string;
  marca: string;
  modelo: string;
  anio: number;
  rendimiento_esperado: number; // km/l
  costo_km_ref: number; // MXN
  estatus: TruckStatus;
  config_vehicular?: string;
  perm_sct?: string;
  num_permiso_sct?: string;
  peso_bruto_vehicular?: number;
  aseguradora_resp_civil?: string;
  poliza_resp_civil?: string;
}

export interface Driver {
  id: string;
  nombre: string;
  telefono: string;
  licencia: string;
  fecha_ingreso: string; // ISO
  comision_tipo: CommissionType;
  comision_valor: number; // % (0-100) o monto fijo
  estatus: DriverStatus;
  rfc?: string;
  licencia_federal?: string;
}

export type DocumentCatalogStatus = "pendiente" | "vigente" | "por_vencer" | "vencido" | "sin_vigencia";

export interface DocTypeRow {
  id: string;
  slug: string;
  nombre: string;
  aplica_a: "operador" | "unidad";
  dias_aviso: number;
  requiere_vigencia: boolean;
  activo: boolean;
}

export interface CatalogDocument {
  id: string;
  tenant_id: string;
  document_type_id: string;
  documentable_type: "driver" | "truck";
  documentable_id: string;
  numero?: string | null;
  vigencia_inicio?: string | null;
  vigencia_fin?: string | null;
  file_name?: string | null;
  mime?: string | null;
  size?: number | null;
  notas?: string | null;
  file_url: string;
  created_at?: string;
  updated_at?: string;
}

export interface DocumentCatalogItem {
  document_type: DocTypeRow;
  document: CatalogDocument | null;
  status: DocumentCatalogStatus;
}

export interface TenantDocumentType extends DocTypeRow {
  tenant_id: string;
  created_at?: string;
  updated_at?: string;
}

export interface NotificationItem {
  id: string;
  tipo: string;
  payload: Record<string, unknown>;
  document_id?: string | null;
  alert_date: string;
  leida: boolean;
  created_at?: string;
}

export interface DocumentDashboardSummary {
  por_vencer_count: number;
  vencido_count: number;
  upcoming: {
    document_id: string;
    document_type_nombre: string;
    documentable_type: string;
    documentable_id: string;
    vigencia_fin: string;
    status: string;
    days_left: number;
  }[];
}

export interface Client {
  id: string;
  razon_social: string;
  rfc: string;
  contacto: string;
  telefono: string;
  calle?: string;
  colonia?: string;
  municipio?: string;
  estado?: string;
  cp?: string;
  pais?: string;
}

export interface FuelLoad {
  id: string;
  litros: number;
  precio_litro: number;
  ubicacion: string;
  fecha: string;
}

export interface Expense {
  id: string;
  categoria: ExpenseCategory;
  descripcion: string;
  monto: number;
  comprobado: boolean;
  fecha: string;
}

export interface Trip {
  id: string;
  folio: string;
  truck_id: string;
  driver_id: string;
  client_id: string;
  origen: string;
  destino: string;
  fecha_salida: string;
  fecha_llegada?: string;
  km_inicial: number;
  km_final?: number;
  tarifa: number;
  viaticos_entregados: number;
  num_factura?: string;
  comision_override?: number | null; // si admin lo edita
  estatus: TripStatus;
  fuel: FuelLoad[];
  expenses: Expense[];
  ubicaciones?: TripUbicacion[];
  mercancias?: TripMercancia[];
  carta_porte?: CartaPorteRecord;
}

export interface SettlementRecord {
  id: string;
  driver_id: string;
  fecha_inicio: string;
  fecha_fin: string;
  cerrado: boolean;
  cerrado_at?: string;
}