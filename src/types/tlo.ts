export type TruckStatus = "activo" | "taller" | "baja";
export type DriverStatus = "activo" | "inactivo";
export type TripStatus = "en_curso" | "cerrado";
export type CommissionType = "porcentaje" | "fijo";
export type ExpenseCategory = "casetas" | "refacciones" | "hospedaje" | "comidas" | "otros";
export type UserRole = "admin" | "capturista";

export interface Truck {
  id: string;
  numero_economico: string;
  placas: string;
  marca: string;
  modelo: string;
  anio: number;
  rendimiento_esperado: number; // km/l
  costo_km_ref: number; // MXN
  estatus: TruckStatus;
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
}

export interface Client {
  id: string;
  razon_social: string;
  rfc: string;
  contacto: string;
  telefono: string;
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
  comision_override?: number; // si admin lo edita
  estatus: TripStatus;
  fuel: FuelLoad[];
  expenses: Expense[];
}

export interface SettlementRecord {
  id: string;
  driver_id: string;
  fecha_inicio: string;
  fecha_fin: string;
  cerrado: boolean;
  cerrado_at?: string;
}