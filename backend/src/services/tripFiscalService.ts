import { randomUUID } from "node:crypto";
import { Trip, Client, ClientUbicacion, TripUbicacion, TripMercancia } from "../models";
import type { UbicacionTipo } from "../models/TripUbicacion";
import { getTripOrThrow, assertTripOpen } from "./tripService";

export function defaultIdUbicacionSat(tipo: UbicacionTipo, tripId: string): string {
  const prefix = tipo === "Origen" ? "OR" : "DE";
  return `${prefix}${tripId.replace(/-/g, "").slice(0, 6).toUpperCase()}`;
}

function addressFromClient(client: Client) {
  return {
    calle: client.calle ?? null,
    numero_exterior: client.numero_exterior ?? null,
    numero_interior: client.numero_interior ?? null,
    colonia: client.colonia ?? null,
    localidad: client.localidad ?? null,
    municipio: client.municipio ?? null,
    estado: client.estado ?? null,
    cp: client.cp ?? null,
    pais: client.pais ?? "MEX",
  };
}

function addressFromClientUbicacion(u: ClientUbicacion) {
  return {
    calle: u.calle ?? null,
    numero_exterior: u.numero_exterior ?? null,
    numero_interior: u.numero_interior ?? null,
    colonia: u.colonia ?? null,
    localidad: u.localidad ?? null,
    municipio: u.municipio ?? null,
    estado: u.estado ?? null,
    cp: u.cp ?? null,
    pais: u.pais ?? "MEX",
  };
}

export async function listUbicaciones(tenantId: string, tripId: string) {
  await getTripOrThrow(tenantId, tripId, false);
  return TripUbicacion.findAll({ where: { tenant_id: tenantId, trip_id: tripId } });
}

/** Prefill trip ubicaciones from client fiscal address when missing. */
export async function ensureUbicacionesFromClient(tenantId: string, tripId: string) {
  const trip = await Trip.findOne({
    where: { id: tripId, tenant_id: tenantId },
    include: [{ model: Client }],
  });
  if (!trip) return;
  const client = (trip as Trip & { Client?: Client }).Client;
  if (!client) return;

  const existing = await TripUbicacion.findAll({ where: { tenant_id: tenantId, trip_id: tripId } });
  const hasOrigen = existing.some((u) => u.tipo === "Origen");
  const hasDestino = existing.some((u) => u.tipo === "Destino");

  const clientDefaults = {
    rfc: client.rfc,
    nombre: client.razon_social,
    ...addressFromClient(client),
  };

  if (!hasOrigen) {
    await TripUbicacion.create({
      id: randomUUID(),
      tenant_id: tenantId,
      trip_id: tripId,
      tipo: "Origen",
      id_ubicacion_sat: defaultIdUbicacionSat("Origen", tripId),
      rfc: clientDefaults.rfc,
      nombre: clientDefaults.nombre,
      calle: trip.origen || clientDefaults.calle,
      numero_exterior: clientDefaults.numero_exterior,
      numero_interior: clientDefaults.numero_interior,
      colonia: clientDefaults.colonia,
      localidad: clientDefaults.localidad,
      municipio: clientDefaults.municipio,
      estado: clientDefaults.estado,
      cp: clientDefaults.cp,
      pais: clientDefaults.pais,
      fecha_hora: trip.fecha_salida,
    } as never);
  }

  if (!hasDestino) {
    await TripUbicacion.create({
      id: randomUUID(),
      tenant_id: tenantId,
      trip_id: tripId,
      tipo: "Destino",
      id_ubicacion_sat: defaultIdUbicacionSat("Destino", tripId),
      rfc: clientDefaults.rfc,
      nombre: clientDefaults.nombre,
      calle: trip.destino || clientDefaults.calle,
      numero_exterior: clientDefaults.numero_exterior,
      numero_interior: clientDefaults.numero_interior,
      colonia: clientDefaults.colonia,
      localidad: clientDefaults.localidad,
      municipio: clientDefaults.municipio,
      estado: clientDefaults.estado,
      cp: clientDefaults.cp,
      pais: clientDefaults.pais,
    } as never);
  }
}

async function resolveUbicacionPayload(
  tenantId: string,
  data: {
    rfc?: string;
    nombre?: string;
    fecha_hora?: string;
    calle?: string;
    colonia?: string;
    municipio?: string;
    localidad?: string;
    estado?: string;
    cp?: string;
    numero_exterior?: string;
    numero_interior?: string;
    pais?: string;
    distancia_km?: number;
    client_ubicacion_id?: string | null;
  },
) {
  if (!data.client_ubicacion_id) return data;

  const catalog = await ClientUbicacion.findOne({
    where: { id: data.client_ubicacion_id, tenant_id: tenantId, estatus: "activo" },
    include: [{ model: Client }],
  });
  if (!catalog) return data;

  const client = (catalog as ClientUbicacion & { Client?: Client }).Client;
  const addr = addressFromClientUbicacion(catalog);
  return {
    ...data,
    rfc: data.rfc ?? client?.rfc ?? null,
    nombre: data.nombre ?? client?.razon_social ?? catalog.nombre,
    calle: data.calle ?? addr.calle,
    numero_exterior: data.numero_exterior ?? addr.numero_exterior,
    numero_interior: data.numero_interior ?? addr.numero_interior,
    colonia: data.colonia ?? addr.colonia,
    localidad: data.localidad ?? addr.localidad,
    municipio: data.municipio ?? addr.municipio,
    estado: data.estado ?? addr.estado,
    cp: data.cp ?? addr.cp,
    pais: data.pais ?? addr.pais,
    client_ubicacion_id: catalog.id,
  };
}

export async function upsertUbicacion(
  tenantId: string,
  tripId: string,
  tipo: UbicacionTipo,
  data: {
    rfc?: string;
    nombre?: string;
    fecha_hora?: string;
    calle?: string;
    colonia?: string;
    municipio?: string;
    localidad?: string;
    estado?: string;
    cp?: string;
    numero_exterior?: string;
    numero_interior?: string;
    pais?: string;
    distancia_km?: number;
    client_ubicacion_id?: string | null;
  },
) {
  const trip = await getTripOrThrow(tenantId, tripId, false);
  await assertTripOpen(trip);
  const resolved = await resolveUbicacionPayload(tenantId, data);
  const existing = await TripUbicacion.findOne({ where: { tenant_id: tenantId, trip_id: tripId, tipo } });
  const payload = {
    rfc: resolved.rfc ?? null,
    nombre: resolved.nombre ?? null,
    fecha_hora: resolved.fecha_hora ? new Date(resolved.fecha_hora) : null,
    calle: resolved.calle ?? null,
    colonia: resolved.colonia ?? null,
    municipio: resolved.municipio ?? null,
    localidad: resolved.localidad ?? null,
    estado: resolved.estado ?? null,
    cp: resolved.cp ?? null,
    numero_exterior: resolved.numero_exterior ?? null,
    numero_interior: resolved.numero_interior ?? null,
    pais: resolved.pais ?? null,
    distancia_km: resolved.distancia_km ?? null,
    client_ubicacion_id: resolved.client_ubicacion_id ?? null,
  };
  if (existing) {
    if (!existing.id_ubicacion_sat) {
      (payload as Record<string, unknown>).id_ubicacion_sat = defaultIdUbicacionSat(tipo, tripId);
    }
    await existing.update(payload as never);
    return existing;
  }
  return TripUbicacion.create({
    id: randomUUID(),
    tenant_id: tenantId,
    trip_id: tripId,
    tipo,
    id_ubicacion_sat: defaultIdUbicacionSat(tipo, tripId),
    ...payload,
  } as never);
}

export async function listMercancias(tenantId: string, tripId: string) {
  await getTripOrThrow(tenantId, tripId, false);
  return TripMercancia.findAll({ where: { tenant_id: tenantId, trip_id: tripId } });
}

export async function addMercancia(
  tenantId: string,
  tripId: string,
  data: {
    descripcion: string;
    cantidad: number;
    unidad?: string;
    peso_kg: number;
    clave_prod_serv?: string;
    material_peligroso?: boolean;
    embalaje?: string;
    cantidad_transportada?: number;
  },
) {
  const trip = await getTripOrThrow(tenantId, tripId, false);
  await assertTripOpen(trip);
  return TripMercancia.create({
    id: randomUUID(),
    tenant_id: tenantId,
    trip_id: tripId,
    descripcion: data.descripcion,
    cantidad: data.cantidad,
    unidad: data.unidad ?? "H87",
    peso_kg: data.peso_kg,
    clave_prod_serv: data.clave_prod_serv ?? null,
    material_peligroso: data.material_peligroso ?? false,
    embalaje: data.embalaje ?? null,
    cantidad_transportada: data.cantidad_transportada ?? null,
  } as never);
}

export async function removeMercancia(tenantId: string, tripId: string, mercanciaId: string) {
  const trip = await getTripOrThrow(tenantId, tripId, false);
  await assertTripOpen(trip);
  const row = await TripMercancia.findOne({
    where: { id: mercanciaId, tenant_id: tenantId, trip_id: tripId },
  });
  if (!row) throw new Error("Mercancía no encontrada");
  await row.destroy();
}
