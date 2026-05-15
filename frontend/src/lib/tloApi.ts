import { apiFetch, readJson } from "@/lib/api";
import type { Client, Driver, Expense, FuelLoad, Trip, Truck, SystemUser, RoleDefinition, UserRole, Permission, ExpenseCategory } from "@/types/tlo";

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
