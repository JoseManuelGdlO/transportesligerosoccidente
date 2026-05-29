import type { Truck, Driver, Client, Trip, SystemUser, RoleDefinition, Permission } from "@/types/tlo";
import { FULL_ADMIN_PERMISSIONS } from "@/types/tlo";
import { SYSTEM_STATUS_CERRADO, SYSTEM_STATUS_EN_CURSO } from "@/lib/tripStatus";

export const mockTrucks: Truck[] = [
  { id: "t1", numero_economico: "T-101", placas: "JAL-4521-A", marca: "Kenworth", modelo: "T680", anio: 2021, rendimiento_esperado: 3.2, costo_km_ref: 18, estatus: "activo" },
  { id: "t2", numero_economico: "T-102", placas: "JAL-7820-B", marca: "Freightliner", modelo: "Cascadia", anio: 2022, rendimiento_esperado: 3.4, costo_km_ref: 17.5, estatus: "activo" },
  { id: "t3", numero_economico: "T-103", placas: "JAL-9012-C", marca: "International", modelo: "LT", anio: 2020, rendimiento_esperado: 3.0, costo_km_ref: 19, estatus: "activo" },
  { id: "t4", numero_economico: "T-104", placas: "JAL-3344-D", marca: "Volvo", modelo: "VNL 760", anio: 2023, rendimiento_esperado: 3.6, costo_km_ref: 17, estatus: "taller" },
  { id: "t5", numero_economico: "T-105", placas: "JAL-5566-E", marca: "Kenworth", modelo: "T880", anio: 2019, rendimiento_esperado: 2.9, costo_km_ref: 19.5, estatus: "activo" },
];

const mkDriver = (
  id: string,
  nombre: string,
  telefono: string,
  licencia: string,
  fecha_ingreso: string,
  comision_tipo: Driver["comision_tipo"],
  local: number,
  foraneo: number,
  estatus: Driver["estatus"],
): Driver => ({
  id,
  nombre,
  telefono,
  licencia,
  fecha_ingreso,
  comision_tipo,
  comision_valor: local,
  comision_valor_local: local,
  comision_valor_foraneo: foraneo,
  estatus,
});

export const mockDrivers: Driver[] = [
  mkDriver("d1", "Juan Pérez Hernández", "33-1122-3344", "E-78451", "2022-03-15", "porcentaje", 8, 10, "activo"),
  mkDriver("d2", "Carlos Ramírez López", "33-2233-4455", "E-65213", "2021-08-01", "porcentaje", 10, 12, "activo"),
  mkDriver("d3", "Miguel Ángel Torres", "33-3344-5566", "E-90112", "2023-01-10", "fijo", 1500, 1800, "activo"),
  mkDriver("d4", "Roberto Castañeda Ruiz", "33-4455-6677", "E-44321", "2020-06-20", "porcentaje", 9, 11, "activo"),
  mkDriver("d5", "José Luis Mendoza", "33-5566-7788", "E-33445", "2024-02-05", "porcentaje", 7, 9, "inactivo"),
];

export const mockClients: Client[] = [
  { id: "c1", razon_social: "Comercializadora del Bajío SA de CV", rfc: "CBA850912ABC", contacto: "Lic. Ana Gómez", telefono: "477-123-4567" },
  { id: "c2", razon_social: "Industrias Metálicas de Occidente", rfc: "IMO910223XYZ", contacto: "Ing. Pedro Sánchez", telefono: "33-8800-1122" },
  { id: "c3", razon_social: "Distribuidora Nacional Logística", rfc: "DNL050618QRS", contacto: "Sra. Laura Vega", telefono: "55-9988-7766" },
  { id: "c4", razon_social: "Agroexportadora Pacífico SAPI", rfc: "APA180430DEF", contacto: "Sr. Hugo Cárdenas", telefono: "322-456-7890" },
];

const today = new Date();
const daysAgo = (n: number) => {
  const d = new Date(today);
  d.setDate(d.getDate() - n);
  return d.toISOString();
};

export const mockTrips: Trip[] = [
  {
    id: "v1", folio: "V-2026-0142",
    truck_id: "t1", driver_id: "d1", client_id: "c1",
    origen: "Guadalajara, JAL", destino: "Monterrey, NL",
    fecha_salida: daysAgo(6), fecha_llegada: daysAgo(5),
    km_inicial: 145320, km_final: 146120,
    tarifa: 38000, viaticos_entregados: 3500,
    num_factura: "F-8821", tipo_viaje: "foraneo", statuses: [SYSTEM_STATUS_CERRADO],
    fuel: [
      { id: "f1", litros: 180, precio_litro: 25.8, ubicacion: "Pemex GDL Norte", fecha: daysAgo(6) },
      { id: "f2", litros: 80, precio_litro: 26.1, ubicacion: "Pemex Saltillo", fecha: daysAgo(5) },
    ],
    expenses: [
      { id: "e1", categoria: "casetas", descripcion: "Casetas GDL-MTY", monto: 2200, comprobado: true, fecha: daysAgo(6) },
      { id: "e2", categoria: "comidas", descripcion: "Alimentos operador", monto: 650, comprobado: true, fecha: daysAgo(6) },
      { id: "e3", categoria: "hospedaje", descripcion: "Hotel Saltillo", monto: 850, comprobado: false, fecha: daysAgo(5) },
    ],
  },
  {
    id: "v2", folio: "V-2026-0143",
    truck_id: "t2", driver_id: "d2", client_id: "c2",
    origen: "Guadalajara, JAL", destino: "CDMX",
    fecha_salida: daysAgo(5), fecha_llegada: daysAgo(4),
    km_inicial: 98220, km_final: 98780,
    tarifa: 28500, viaticos_entregados: 2800,
    num_factura: "F-8822", tipo_viaje: "local", statuses: [SYSTEM_STATUS_CERRADO],
    fuel: [
      { id: "f3", litros: 165, precio_litro: 25.9, ubicacion: "Pemex Tlaquepaque", fecha: daysAgo(5) },
    ],
    expenses: [
      { id: "e4", categoria: "casetas", descripcion: "Casetas Maravatío", monto: 1450, comprobado: true, fecha: daysAgo(5) },
      { id: "e5", categoria: "comidas", descripcion: "Comidas en ruta", monto: 480, comprobado: true, fecha: daysAgo(5) },
      { id: "e6", categoria: "otros", descripcion: "Lavado de unidad", monto: 250, comprobado: false, fecha: daysAgo(4) },
    ],
  },
  {
    id: "v3", folio: "V-2026-0144",
    truck_id: "t3", driver_id: "d4", client_id: "c3",
    origen: "Guadalajara, JAL", destino: "Querétaro, QRO",
    fecha_salida: daysAgo(4), fecha_llegada: daysAgo(3),
    km_inicial: 210450, km_final: 210860,
    tarifa: 18500, viaticos_entregados: 1800,
    num_factura: "F-8823", tipo_viaje: "local", statuses: [SYSTEM_STATUS_CERRADO],
    fuel: [
      { id: "f4", litros: 130, precio_litro: 26.0, ubicacion: "Pemex La Piedad", fecha: daysAgo(4) },
    ],
    expenses: [
      { id: "e7", categoria: "casetas", descripcion: "Casetas GDL-QRO", monto: 980, comprobado: true, fecha: daysAgo(4) },
      { id: "e8", categoria: "refacciones", descripcion: "Cambio de filtro", monto: 1200, comprobado: false, fecha: daysAgo(3) },
    ],
  },
  {
    id: "v4", folio: "V-2026-0145",
    truck_id: "t1", driver_id: "d1", client_id: "c4",
    origen: "Guadalajara, JAL", destino: "Mazatlán, SIN",
    fecha_salida: daysAgo(3), fecha_llegada: daysAgo(2),
    km_inicial: 146120, km_final: 146650,
    tarifa: 22000, viaticos_entregados: 2200,
    num_factura: "F-8824", tipo_viaje: "foraneo", statuses: [SYSTEM_STATUS_CERRADO],
    fuel: [
      { id: "f5", litros: 150, precio_litro: 26.2, ubicacion: "Pemex Tepic", fecha: daysAgo(3) },
    ],
    expenses: [
      { id: "e9", categoria: "casetas", descripcion: "Casetas GDL-Maz", monto: 780, comprobado: true, fecha: daysAgo(3) },
      { id: "e10", categoria: "comidas", descripcion: "Mariscos en ruta", monto: 520, comprobado: true, fecha: daysAgo(3) },
    ],
  },
  {
    id: "v5", folio: "V-2026-0146",
    truck_id: "t5", driver_id: "d2", client_id: "c1",
    origen: "Guadalajara, JAL", destino: "León, GTO",
    fecha_salida: daysAgo(2), fecha_llegada: daysAgo(1),
    km_inicial: 320110, km_final: 320390,
    tarifa: 14500, viaticos_entregados: 1500,
    num_factura: "F-8825", tipo_viaje: "local", statuses: [SYSTEM_STATUS_CERRADO],
    fuel: [
      { id: "f6", litros: 95, precio_litro: 26.3, ubicacion: "Pemex Zapotlanejo", fecha: daysAgo(2) },
    ],
    expenses: [
      { id: "e11", categoria: "casetas", descripcion: "Casetas GDL-León", monto: 540, comprobado: true, fecha: daysAgo(2) },
      { id: "e12", categoria: "comidas", descripcion: "Comidas", monto: 380, comprobado: false, fecha: daysAgo(2) },
    ],
  },
  {
    id: "v6", folio: "V-2026-0147",
    truck_id: "t2", driver_id: "d3", client_id: "c2",
    origen: "Guadalajara, JAL", destino: "Puerto Vallarta, JAL",
    fecha_salida: daysAgo(1),
    km_inicial: 98780,
    tarifa: 16800, viaticos_entregados: 1600,
    tipo_viaje: "local",
    statuses: [SYSTEM_STATUS_EN_CURSO],
    fuel: [
      { id: "f7", litros: 100, precio_litro: 26.4, ubicacion: "Pemex Ameca", fecha: daysAgo(1) },
    ],
    expenses: [
      { id: "e13", categoria: "casetas", descripcion: "Casetas GDL-PV", monto: 620, comprobado: true, fecha: daysAgo(1) },
    ],
  },
  {
    id: "v7", folio: "V-2026-0148",
    truck_id: "t3", driver_id: "d4", client_id: "c3",
    origen: "Guadalajara, JAL", destino: "Aguascalientes, AGS",
    fecha_salida: daysAgo(0),
    km_inicial: 210860,
    tarifa: 13200, viaticos_entregados: 1300,
    tipo_viaje: "local",
    statuses: [SYSTEM_STATUS_EN_CURSO],
    fuel: [],
    expenses: [],
  },
];

export const mockRoles: RoleDefinition[] = [
  {
    role: "admin",
    nombre: "Administrador",
    descripcion: "Acceso total al sistema, gestión de usuarios, cierre de liquidaciones y configuración.",
    permisos: [...FULL_ADMIN_PERMISSIONS],
  },
  {
    role: "capturista",
    nombre: "Capturista",
    descripcion: "Captura y operación diaria de viajes, viáticos y combustible. Sin acceso a usuarios ni cierre de liquidaciones.",
    permisos: [
      "viajes.ver", "viajes.crear", "viajes.cerrar",
      "liquidaciones.ver",
      "catalogos.ver",
      "reportes.ver",
    ],
  },
];

export const mockSystemUsers: SystemUser[] = [
  { id: "u1", nombre: "María Fernanda López", email: "admin@tlo.mx", role: "admin", estatus: "activo", ultimo_acceso: daysAgo(0), creado_en: daysAgo(180) },
  { id: "u2", nombre: "Jorge Alberto Ramos", email: "jramos@tlo.mx", role: "capturista", estatus: "activo", ultimo_acceso: daysAgo(1), creado_en: daysAgo(90) },
  { id: "u3", nombre: "Sofía Hernández Vega", email: "shernandez@tlo.mx", role: "capturista", estatus: "activo", ultimo_acceso: daysAgo(2), creado_en: daysAgo(60) },
  { id: "u4", nombre: "Diego Martínez Cruz", email: "dmartinez@tlo.mx", role: "capturista", estatus: "inactivo", ultimo_acceso: daysAgo(45), creado_en: daysAgo(200) },
];