import type { FuelLoad } from "../models/FuelLoad";
import type { Expense } from "../models/Expense";
import type { Trip } from "../models/Trip";
import type { Truck } from "../models/Truck";
import type { Driver } from "../models/Driver";
import type { Client } from "../models/Client";
import type { User } from "../models/User";
import type { Role } from "../models/Role";
import type { Permission } from "../models/Permission";
import type { Settlement } from "../models/Settlement";
import { num, iso } from "./numbers";

export function fuelToJson(f: FuelLoad): Record<string, unknown> {
  const p = f.get({ plain: true }) as Record<string, unknown>;
  return {
    id: p.id,
    litros: num(p.litros),
    precio_litro: num(p.precio_litro),
    ubicacion: p.ubicacion,
    fecha: iso(p.fecha),
  };
}

export function expenseToJson(e: Expense): Record<string, unknown> {
  const p = e.get({ plain: true }) as Record<string, unknown>;
  return {
    id: p.id,
    categoria: p.categoria,
    descripcion: p.descripcion,
    monto: num(p.monto),
    comprobado: p.comprobado,
    fecha: iso(p.fecha),
  };
}

export function tripToJson(t: Trip): Record<string, unknown> {
  const fuel = (t as Trip & { fuel?: FuelLoad[] }).fuel ?? [];
  const expenses = (t as Trip & { expenses?: Expense[] }).expenses ?? [];
  return {
    id: String(t.id),
    folio: t.folio,
    truck_id: String(t.truck_id),
    driver_id: String(t.driver_id),
    client_id: String(t.client_id),
    origen: t.origen,
    destino: t.destino,
    fecha_salida: iso(t.fecha_salida),
    fecha_llegada: t.fecha_llegada ? iso(t.fecha_llegada) : undefined,
    km_inicial: t.km_inicial,
    km_final: t.km_final ?? undefined,
    tarifa: num(t.tarifa),
    viaticos_entregados: num(t.viaticos_entregados),
    num_factura: t.num_factura ?? undefined,
    comision_override: t.comision_override != null ? num(t.comision_override) : undefined,
    estatus: t.estatus,
    fuel: fuel.map((row) => fuelToJson(row)),
    expenses: expenses.map((row) => expenseToJson(row)),
  };
}

export function truckToJson(t: Truck): Record<string, unknown> {
  const p = t.get({ plain: true }) as Record<string, unknown>;
  return {
    id: p.id,
    numero_economico: p.numero_economico,
    placas: p.placas,
    marca: p.marca,
    modelo: p.modelo,
    anio: p.anio,
    rendimiento_esperado: num(p.rendimiento_esperado),
    costo_km_ref: num(p.costo_km_ref),
    estatus: p.estatus,
  };
}

export function driverToJson(d: Driver): Record<string, unknown> {
  const p = d.get({ plain: true }) as Record<string, unknown>;
  return {
    id: p.id,
    nombre: p.nombre,
    telefono: p.telefono,
    licencia: p.licencia,
    fecha_ingreso: p.fecha_ingreso,
    comision_tipo: p.comision_tipo,
    comision_valor: num(p.comision_valor),
    estatus: p.estatus,
  };
}

export function clientToJson(c: Client): Record<string, unknown> {
  const p = c.get({ plain: true }) as Record<string, unknown>;
  return {
    id: p.id,
    razon_social: p.razon_social,
    rfc: p.rfc,
    contacto: p.contacto,
    telefono: p.telefono,
  };
}

export function userToJson(u: User, roleSlug: string): Record<string, unknown> {
  const p = u.get({ plain: true }) as Record<string, unknown> & { creado_en?: Date; createdAt?: Date };
  const creado = p.creado_en ?? p.createdAt;
  return {
    id: p.id,
    nombre: p.nombre,
    email: p.email,
    role: roleSlug,
    estatus: p.estatus,
    ultimo_acceso: p.ultimo_acceso ? iso(p.ultimo_acceso) : undefined,
    creado_en: creado ? iso(creado) : undefined,
  };
}

export function roleDefinitionToJson(role: Role, perms: Permission[]): Record<string, unknown> {
  const r = role.get({ plain: true }) as Record<string, unknown>;
  return {
    role: r.slug,
    nombre: r.nombre,
    descripcion: r.descripcion ?? "",
    permisos: perms.map((p) => p.slug),
  };
}

export function settlementToJson(s: Settlement): Record<string, unknown> {
  const p = s.get({ plain: true }) as Record<string, unknown>;
  return {
    id: p.id,
    driver_id: p.driver_id,
    fecha_inicio: p.fecha_inicio,
    fecha_fin: p.fecha_fin,
    cerrado: p.cerrado,
    cerrado_at: p.cerrado_at ? iso(p.cerrado_at) : undefined,
  };
}
