export type TruckStatus = "activo" | "taller" | "baja";
export type DriverStatus = "activo" | "inactivo";
export type TripLifecycleSlug = "en_curso" | "cerrado";
/** @deprecated Use TripStatusRef for catalog entries */
export type TripStatus = TripLifecycleSlug;
export type TripType = "local" | "foraneo";
export type CommissionType = "porcentaje" | "fijo";
export type MaintenanceType = "preventivo" | "menor" | "intermedio" | "mayor" | "correctivo";
export type DiscountType =
  | "prestamo"
  | "dano"
  | "multa"
  | "nomina"
  | "caja"
  | "ahorro"
  | "fianza"
  | "otro";
export type CompensationType =
  | "bono"
  | "espera"
  | "incentivo"
  | "nomina"
  | "caja"
  | "ahorro"
  | "fianza"
  | "otro";
export type ExpenseCategory = "casetas" | "refacciones" | "hospedaje" | "comidas" | "otros";
export type ExpenseTipo = "gasto" | "ingreso";
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
export type ClientUbicacionTipo = "Origen" | "Destino" | "Ambos";
export type ClientStatus = "activo" | "inactivo";

export interface TripStop {
  orden: number;
  etiqueta: string;
  client_ubicacion_id?: string;
}

export interface RouteCatalog {
  id: string;
  nombre: string;
  client_id?: string;
  client_nombre?: string;
  tipo_viaje?: TripType;
  estatus: "activo" | "inactivo";
  paradas: TripStop[];
  ruta_resumen: string;
}

export interface TripUbicacion {
  id: string;
  orden?: number;
  tipo: UbicacionTipo;
  rfc?: string;
  nombre?: string;
  fecha_hora?: string;
  calle?: string;
  colonia?: string;
  colonia_clave?: string;
  municipio?: string;
  municipio_clave?: string;
  localidad?: string;
  localidad_clave?: string;
  estado?: string;
  cp?: string;
  numero_exterior?: string;
  numero_interior?: string;
  pais?: string;
  id_ubicacion_sat?: string;
  client_ubicacion_id?: string;
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
  cantidad_transportada?: number;
}

/** Entrada del catálogo SAT c_ClaveProdServCP. */
export type SatMaterialPeligroso = "0" | "1" | "0,1";

export interface SatClaveProducto {
  clave: string;
  descripcion: string;
  material_peligroso: SatMaterialPeligroso;
}

export interface SatMunicipio {
  clave: string;
  estado: string;
  descripcion: string;
}

export interface SatLocalidad {
  clave: string;
  estado: string;
  descripcion: string;
}

export interface SatColonia {
  clave: string;
  codigo_postal: string;
  nombre: string;
}

export interface SatEstado {
  clave: string;
  descripcion: string;
  municipio_clave?: string;
  municipio?: string;
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
  has_pdf?: boolean;
  id_ccp?: string;
  transporte_internacional?: boolean;
  tipo_comprobante?: "ingreso" | "traslado";
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
  metodo_pago_default?: string;
  forma_pago_default?: string;
  uso_cfdi_default?: string;
  iva_tasa_default?: number;
  retencion_tasa_default?: number;
  condiciones_pago_default?: string;
}

export type TenantStatus = "activo" | "suspendido";

import type { PdfTemplatesConfig } from "@/types/pdfTemplate";

export interface Tenant {
  id: string;
  slug: string;
  nombre: string;
  estatus: TenantStatus;
  logo_url?: string;
  color_primary?: string;
  color_accent?: string;
  color_sidebar?: string;
  pdf_config?: PdfTemplatesConfig;
  has_pdf_logo?: boolean;
  has_pdf_trip_logo?: boolean;
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
  folio?: string;
  tag?: string;
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
  ruta: string;
  fecha_salida: string;
  km_recorridos: number;
  litros_asignados: number;
  costo_asignado: number;
  asignacion_manual?: boolean;
}

export type FuelProrationAssignmentInput = {
  trip_id: string;
  fuel_ticket_id: string | null;
};

export interface FuelProrationTripRef {
  trip_id: string;
  folio: string;
  origen: string;
  destino: string;
  ruta: string;
  fecha_salida: string;
  km_recorridos: number;
}

export type FuelProrationEstado = "pendiente" | "confirmado";

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
  prorrateo_confirmado_at?: string | null;
  viajes: ProratedTripRow[];
}

export interface FuelProrationUnitReport {
  truck_id: string;
  numero_economico: string;
  inicio: string;
  fin: string;
  tickets: ProratedTicketBlock[];
  viajes_sin_asignar: FuelProrationTripRef[];
  viajes_sin_km: FuelProrationTripRef[];
  resumen: {
    total_litros: number;
    total_km_viajes: number;
    total_viajes: number;
    viajes_en_periodo: number;
    viajes_sin_asignar: number;
    viajes_sin_km: number;
    rendimiento: number | null;
  };
}

export interface FuelProrationReport {
  inicio: string;
  fin: string;
  estado?: FuelProrationEstado;
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

export interface ReportsOverviewTotals {
  viajes: number;
  ingreso: number;
  costo_total: number;
  utilidad: number;
  margen: number;
  km: number;
  viajes_negativos: number;
  diesel_total: number;
  comision_total: number;
  utilidad_por_km: number;
  gasto_mantenimiento: number;
  costo_mnto_por_km: number;
  utilidad_despues_operacion: number;
}

export interface ReportsOverviewVariation {
  ingreso_pct: number | null;
  costo_pct: number | null;
  utilidad_pct: number | null;
  margen_pct: number | null;
  viajes_pct: number | null;
  km_pct: number | null;
  utilidad_despues_operacion_pct?: number | null;
}

export interface ReportsTimeBucket {
  fecha: string;
  ingreso: number;
  costo: number;
  utilidad: number;
  viajes: number;
}

export interface ReportsTruckRow {
  truck_id: string;
  numero_economico: string;
  marca: string;
  modelo: string;
  viajes: number;
  ingreso: number;
  utilidad: number;
  km: number;
  diesel_total: number;
  margen: number;
  costo_por_km: number;
  ingreso_por_km: number;
  utilidad_por_km: number;
  gasto_mantenimiento: number;
  costo_mnto_por_km: number;
  utilidad_despues_operacion: number;
}

export interface ReportsMonthRow {
  mes: string;
  ingreso: number;
  utilidad: number;
  gasto_mantenimiento: number;
  utilidad_despues_operacion: number;
  utilidad_por_km: number;
  costo_mnto_por_km: number;
  viajes: number;
  km: number;
}

export interface ReportsMonthTruckRow extends ReportsMonthRow {
  truck_id: string;
  numero_economico: string;
  marca: string;
  modelo: string;
}

export interface ReportsDriverRow {
  driver_id: string;
  nombre: string;
  viajes: number;
  ingreso: number;
  utilidad: number;
  comision: number;
  km: number;
  margen: number;
  costo_por_km: number;
  ingreso_por_km: number;
}

export interface ReportsClientRow {
  client_id: string;
  razon_social: string;
  viajes: number;
  ingreso: number;
  utilidad: number;
  km: number;
  margen: number;
}

export interface ReportsTipoViajeRow {
  tipo_viaje: TripType;
  viajes: number;
  ingreso: number;
  utilidad: number;
  km: number;
  margen: number;
}

export interface ReportsRouteRow {
  origen: string;
  destino: string;
  viajes: number;
  ingreso: number;
  utilidad: number;
  km: number;
  margen: number;
}

export interface ReportsExpenseCategoryRow {
  categoria: ExpenseCategory;
  monto: number;
  pct: number;
}

export interface ReportsCostBreakdown {
  diesel: number;
  comisiones: number;
  gastos: number;
}

export interface ReportsNegativeTripRow {
  trip_id: string;
  folio: string;
  fecha_salida: string;
  origen: string;
  destino: string;
  razon_social: string | null;
  operador: string;
  numero_economico: string;
  ingreso: number;
  costo_total: number;
  utilidad: number;
  margen: number;
  km: number;
}

export type ReportsCriterioFecha = "salida" | "llegada";

export interface ReportsTripRow {
  trip_id: string;
  folio: string;
  fecha_salida: string;
  fecha_llegada: string | null;
  fecha_ref: string;
  origen: string;
  destino: string;
  razon_social: string | null;
  operador: string;
  numero_economico: string;
  ingreso: number;
  diesel_total: number;
  gastos_total: number;
  comision: number;
  costo_total: number;
  utilidad: number;
  margen: number;
  km: number;
}

export interface ReportsOverview {
  periodo: { desde: string | null; hasta: string | null; criterio_fecha: ReportsCriterioFecha };
  periodo_anterior: { desde: string; hasta: string } | null;
  totales: ReportsOverviewTotals;
  variacion: ReportsOverviewVariation | null;
  by_time: ReportsTimeBucket[];
  by_truck: ReportsTruckRow[];
  by_driver: ReportsDriverRow[];
  by_client: ReportsClientRow[];
  by_tipo_viaje: ReportsTipoViajeRow[];
  by_route: ReportsRouteRow[];
  by_expense_category: ReportsExpenseCategoryRow[];
  cost_breakdown: ReportsCostBreakdown;
  negative_trips: ReportsNegativeTripRow[];
  by_trip: ReportsTripRow[];
  by_month: ReportsMonthRow[];
  by_month_truck: ReportsMonthTruckRow[];
}

export interface FuelImportResult {
  creados: number;
  duplicados: number;
  errores: { fila: number; mensaje: string; datos?: Record<string, unknown> }[];
  inicio?: string;
  fin?: string;
}

export interface FuelImportPreviewTicket {
  fila: number;
  truck_id: string;
  numero_economico: string;
  placas: string;
  fecha: string;
  hora: string | null;
  folio: string;
  tag: string | null;
  odometro: number;
  litros: number;
  precio_litro: number;
  importe_total: number;
  ubicacion: string;
  external_id: string;
  posible_duplicado: boolean;
}

export interface FuelImportPreviewResult {
  tickets: FuelImportPreviewTicket[];
  errores: { fila: number; mensaje: string; datos?: Record<string, unknown> }[];
  inicio?: string;
  fin?: string;
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
  vin?: string;
  capacidad_carga_kg?: number;
}

export interface Driver {
  id: string;
  nombre: string;
  telefono: string;
  licencia: string;
  fecha_ingreso: string; // ISO
  comision_tipo: CommissionType;
  comision_valor: number; // legacy / local
  comision_valor_local: number;
  comision_valor_foraneo: number;
  estatus: DriverStatus;
  rfc?: string;
  licencia_federal?: string;
  tipo_figura?: string;
  curp?: string;
  email?: string;
  numero_empleado?: string;
  calle?: string;
  numero_exterior?: string;
  numero_interior?: string;
  colonia?: string;
  localidad?: string;
  municipio?: string;
  estado?: string;
  cp?: string;
  pais?: string;
  truck_id?: string;
  puesto?: string;
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
  colonia_clave?: string;
  municipio?: string;
  municipio_clave?: string;
  estado?: string;
  cp?: string;
  pais?: string;
  numero_exterior?: string;
  numero_interior?: string;
  localidad?: string;
  localidad_clave?: string;
  email?: string;
  regimen_fiscal?: string;
  estatus?: ClientStatus;
  observaciones?: string;
}

export interface ClientUbicacion {
  id: string;
  client_id: string;
  nombre: string;
  rfc?: string;
  razon_social?: string;
  /** Razón social del cliente dueño; solo en listado tenant-wide. */
  client_razon_social?: string;
  tipo: ClientUbicacionTipo;
  calle?: string;
  numero_exterior?: string;
  numero_interior?: string;
  colonia?: string;
  colonia_clave?: string;
  localidad?: string;
  localidad_clave?: string;
  municipio?: string;
  municipio_clave?: string;
  estado?: string;
  cp?: string;
  pais?: string;
  estatus?: ClientStatus;
}

export interface FuelLoad {
  id: string;
  litros: number;
  precio_litro: number;
  ubicacion: string;
  fecha: string;
  es_foraneo?: boolean;
  estacion_nombre?: string;
  es_estacion_empresa?: boolean;
  comprobante_url?: string;
  /** Presente si la carga se generó al confirmar un ticket de prorrateo. */
  fuel_ticket_id?: string;
}

export interface Expense {
  id: string;
  categoria: ExpenseCategory;
  tipo: ExpenseTipo;
  descripcion: string;
  monto: number;
  monto_comprobado: number;
  visible_en_liquidacion: boolean;
  fecha: string;
}

export interface TripStatusRef {
  id: string;
  nombre: string;
  color: string;
  slug?: TripLifecycleSlug;
  is_system?: boolean;
  activo?: boolean;
}

export interface Trip {
  id: string;
  folio: string;
  truck_id: string;
  driver_id: string;
  client_id: string;
  client_nombre?: string;
  origen: string;
  destino: string;
  route_id?: string;
  paradas?: TripStop[];
  ruta_resumen?: string;
  fecha_salida: string;
  fecha_llegada?: string;
  km_inicial: number;
  km_final?: number;
  tarifa: number;
  viaticos_entregados: number;
  num_factura?: string;
  comision_override?: number | null; // si admin lo edita
  tipo_viaje: TripType;
  settlement_id?: string;
  included?: boolean;
  en_periodo?: boolean;
  statuses: TripStatusRef[];
  fuel: FuelLoad[];
  expenses: Expense[];
  ubicaciones?: TripUbicacion[];
  mercancias?: TripMercancia[];
  carta_porte?: CartaPorteRecord;
}

export interface DriverAdvance {
  id: string;
  monto: number;
  fecha: string;
  descripcion: string;
  settlement_id?: string;
  en_periodo?: boolean;
}

export interface DriverDiscount {
  id: string;
  tipo: DiscountType;
  monto: number;
  fecha: string;
  descripcion: string;
  settlement_id?: string;
  en_periodo?: boolean;
}

export interface DriverCompensation {
  id: string;
  tipo: CompensationType;
  monto: number;
  fecha: string;
  descripcion: string;
  settlement_id?: string;
  en_periodo?: boolean;
}

export type AccountItemType = "incidencia" | "prestamo";
export type AccountItemStatus = "activo" | "liquidado" | "cancelado";
export type AccountMovementType = "liquidacion" | "pago_directo";

export interface AccountItemBalance {
  id: string;
  tipo: AccountItemType | string;
  concepto: string;
  monto_original: number;
  cuota_liquidacion: number;
  saldo: number;
  fecha: string;
}

export interface AccountApplication {
  item_id: string;
  tipo: string;
  concepto: string;
  monto: number;
  saldo_antes: number;
  saldo_despues: number;
}

export interface DriverAccountMovement {
  id: string;
  tipo: AccountMovementType;
  monto: number;
  fecha: string;
  nota?: string;
  settlement_id?: string;
  saldo_despues: number;
  created_at?: string;
}

export interface DriverAccountItem {
  id: string;
  tipo: AccountItemType;
  concepto: string;
  monto_original: number;
  cuota_liquidacion: number;
  fecha: string;
  estatus: AccountItemStatus;
  abonado: number;
  saldo: number;
  movements: DriverAccountMovement[];
  created_at?: string;
}

export interface DriverAccountSummary {
  account_id: string;
  driver_id: string;
  saldo_total: number;
  total_abonado: number;
  total_original: number;
  adeudos_activos: number;
  items: DriverAccountItem[];
}

export interface SettlementSummaryApi {
  driver: Driver;
  periodo: { inicio: string; fin: string };
  total_ingresos: number;
  total_comisiones: number;
  total_km: number;
  viaticos_entregados: number;
  viaticos_comprobados: number;
  saldo_viaticos: number;
  total_descuentos: number;
  total_anticipos: number;
  total_compensaciones: number;
  total_cuenta_abonos?: number;
  neto_pagar: number;
  advances: DriverAdvance[];
  discounts: DriverDiscount[];
  compensations: DriverCompensation[];
  account_items?: AccountItemBalance[];
  account_applications?: AccountApplication[];
  trips: Trip[];
}

export interface SettlementRecord {
  id: string;
  driver_id: string;
  fecha_inicio: string;
  fecha_fin: string;
  cerrado: boolean;
  cerrado_at?: string;
  snapshot?: SettlementSummaryApi;
}

export interface MaintenanceScheduleRow {
  id: string;
  truck_id: string;
  tipo: MaintenanceType;
  intervalo_km: number | null;
  intervalo_dias: number | null;
  ultimo_km: number;
  ultima_fecha?: string;
  activo: boolean;
}

export interface MaintenanceRecordRow {
  id: string;
  truck_id: string;
  tipo: MaintenanceType;
  km_odometro: number;
  fecha: string;
  costo: number;
  descripcion: string;
  taller?: string;
}

export interface MaintenanceOverviewUnit {
  truck_id: string;
  numero_economico: string;
  placas: string;
  km_actual: number;
  proximos: {
    tipo: MaintenanceType;
    km_proximo: number | null;
    km_restantes: number | null;
    fecha_proxima: string | null;
    dias_restantes: number | null;
    vencido: boolean;
    vencido_km: boolean;
    vencido_tiempo: boolean;
  }[];
  ultimos_registros: { id: string; tipo: MaintenanceType; fecha: string; km_odometro: number; descripcion: string }[];
}