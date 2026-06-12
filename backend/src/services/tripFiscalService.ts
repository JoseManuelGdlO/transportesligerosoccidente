import { randomUUID } from "node:crypto";
import { Trip, Client, ClientUbicacion, TripUbicacion, TripMercancia } from "../models";
import type { UbicacionTipo } from "../models/TripUbicacion";
import { getTripOrThrow, assertTripAllowsFiscalEdit } from "./tripService";
import { listTripStops, type ParadaInput } from "./tripStopService";

/** Carta Porte 3.1: IDUbicacion = (OR|DE) + 6 dígitos. */
export const SAT_ID_UBICACION_PATTERN = /^(OR|DE)[0-9]{6}$/;

export function isValidIdUbicacionSat(id: string | null | undefined): boolean {
  return !!id && SAT_ID_UBICACION_PATTERN.test(id);
}

function idUbicacionNumericSuffix(tripId: string, orden: number): string {
  let h = orden;
  for (let i = 0; i < tripId.length; i++) {
    h = (Math.imul(31, h) + tripId.charCodeAt(i)) >>> 0;
  }
  return String(h % 1_000_000).padStart(6, "0");
}

export function defaultIdUbicacionSat(tipo: UbicacionTipo, tripId: string, orden = 1): string {
  const prefix = tipo === "Origen" ? "OR" : "DE";
  return `${prefix}${idUbicacionNumericSuffix(tripId, orden)}`;
}

export function resolveIdUbicacionSat(
  stored: string | null | undefined,
  tipo: UbicacionTipo,
  tripId: string,
  orden: number,
): string {
  if (isValidIdUbicacionSat(stored)) return stored!;
  return defaultIdUbicacionSat(tipo, tripId, orden);
}

function tipoFromOrden(orden: number): UbicacionTipo {
  return orden === 1 ? "Origen" : "Destino";
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
  return TripUbicacion.findAll({
    where: { tenant_id: tenantId, trip_id: tripId },
    order: [["orden", "ASC"]],
  });
}

/** Prefill trip ubicaciones from client fiscal address when missing. */
export async function ensureUbicacionesFromClient(tenantId: string, tripId: string) {
  const stops = await listTripStops(tenantId, tripId);
  if (stops.length >= 2) {
    await syncUbicacionesFromTripStops(tenantId, tripId);
    return;
  }

  const trip = await Trip.findOne({
    where: { id: tripId, tenant_id: tenantId },
    include: [{ model: Client }],
  });
  if (!trip) return;
  const client = (trip as Trip & { Client?: Client }).Client;
  if (!client) return;

  const existing = await TripUbicacion.findAll({ where: { tenant_id: tenantId, trip_id: tripId } });
  const hasOrigen = existing.some((u) => u.orden === 1);
  const hasDestino = existing.some((u) => u.orden === 2);

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
      orden: 1,
      tipo: "Origen",
      id_ubicacion_sat: defaultIdUbicacionSat("Origen", tripId, 1),
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
      orden: 2,
      tipo: "Destino",
      id_ubicacion_sat: defaultIdUbicacionSat("Destino", tripId, 2),
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

export async function syncUbicacionesFromTripStops(tenantId: string, tripId: string) {
  const trip = await Trip.findOne({
    where: { id: tripId, tenant_id: tenantId },
    include: [{ model: Client }],
  });
  if (!trip) return;

  const client = (trip as Trip & { Client?: Client }).Client;
  const stops = await listTripStops(tenantId, tripId);
  if (stops.length < 2) return;

  const existing = await TripUbicacion.findAll({
    where: { tenant_id: tenantId, trip_id: tripId },
    order: [["orden", "ASC"]],
  });
  const byOrden = new Map(existing.map((u) => [u.orden, u]));

  for (const stop of stops) {
    const tipo = tipoFromOrden(stop.orden);
    let catalog: ClientUbicacion | null = null;
    if (stop.client_ubicacion_id) {
      catalog = await ClientUbicacion.findOne({
        where: { id: stop.client_ubicacion_id, tenant_id: tenantId, estatus: "activo" },
      });
    }

    const clientDefaults = client
      ? { rfc: client.rfc, nombre: client.razon_social, ...addressFromClient(client) }
      : null;
    const addr = catalog ? addressFromClientUbicacion(catalog) : clientDefaults;

    const row = byOrden.get(stop.orden);
    const payload = {
      orden: stop.orden,
      tipo,
      rfc: row?.rfc ?? clientDefaults?.rfc ?? null,
      nombre: row?.nombre ?? clientDefaults?.nombre ?? null,
      calle: row?.calle ?? addr?.calle ?? stop.etiqueta,
      numero_exterior: row?.numero_exterior ?? addr?.numero_exterior ?? null,
      numero_interior: row?.numero_interior ?? addr?.numero_interior ?? null,
      colonia: row?.colonia ?? addr?.colonia ?? null,
      localidad: row?.localidad ?? addr?.localidad ?? null,
      municipio: row?.municipio ?? addr?.municipio ?? null,
      estado: row?.estado ?? addr?.estado ?? null,
      cp: row?.cp ?? addr?.cp ?? null,
      pais: row?.pais ?? addr?.pais ?? "MEX",
      client_ubicacion_id: stop.client_ubicacion_id ?? row?.client_ubicacion_id ?? null,
      fecha_hora: row?.fecha_hora ?? (stop.orden === 1 ? trip.fecha_salida : null),
      id_ubicacion_sat: row?.id_ubicacion_sat ?? defaultIdUbicacionSat(tipo, tripId, stop.orden),
    };

    if (row) {
      await row.update(payload as never);
    } else {
      await TripUbicacion.create({
        id: randomUUID(),
        tenant_id: tenantId,
        trip_id: tripId,
        ...payload,
      } as never);
    }
  }

  const maxOrden = stops.length;
  for (const u of existing) {
    if (u.orden > maxOrden) await u.destroy();
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
  orden: number,
  data: {
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
    distancia_km?: number;
    client_ubicacion_id?: string | null;
  },
) {
  const trip = await getTripOrThrow(tenantId, tripId, false);
  await assertTripAllowsFiscalEdit(trip);
  const tipo = tipoFromOrden(orden);
  const resolved = await resolveUbicacionPayload(tenantId, data);
  const existing = await TripUbicacion.findOne({
    where: { tenant_id: tenantId, trip_id: tripId, orden },
  });
  const payload = {
    orden,
    tipo,
    rfc: resolved.rfc ?? null,
    nombre: resolved.nombre ?? null,
    fecha_hora: resolved.fecha_hora ? new Date(resolved.fecha_hora) : null,
    calle: resolved.calle ?? null,
    colonia: resolved.colonia ?? null,
    colonia_clave: resolved.colonia_clave ?? null,
    municipio: resolved.municipio ?? null,
    municipio_clave: resolved.municipio_clave ?? null,
    localidad: resolved.localidad ?? null,
    localidad_clave: resolved.localidad_clave ?? null,
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
      (payload as Record<string, unknown>).id_ubicacion_sat = defaultIdUbicacionSat(tipo, tripId, orden);
    }
    await existing.update(payload as never);
    return existing;
  }
  return TripUbicacion.create({
    id: randomUUID(),
    tenant_id: tenantId,
    trip_id: tripId,
    id_ubicacion_sat: defaultIdUbicacionSat(tipo, tripId, orden),
    ...payload,
  } as never);
}

/** Legacy: upsert by tipo (first Origen or first Destino by orden). */
export async function upsertUbicacionByTipo(
  tenantId: string,
  tripId: string,
  tipo: UbicacionTipo,
  data: Parameters<typeof upsertUbicacion>[3],
) {
  const orden = tipo === "Origen" ? 1 : 2;
  const existing = await TripUbicacion.findOne({
    where: { tenant_id: tenantId, trip_id: tripId, tipo },
    order: [["orden", "ASC"]],
  });
  return upsertUbicacion(tenantId, tripId, existing?.orden ?? orden, data);
}

export async function replaceUbicaciones(
  tenantId: string,
  tripId: string,
  items: Array<{
    orden: number;
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
  }>,
) {
  const trip = await getTripOrThrow(tenantId, tripId, false);
  await assertTripAllowsFiscalEdit(trip);
  if (items.length < 2) {
    const err = new Error("Se requieren al menos 2 ubicaciones");
    (err as Error & { status?: number }).status = 400;
    throw err;
  }
  const sorted = [...items].sort((a, b) => a.orden - b.orden);
  for (let i = 0; i < sorted.length; i++) {
    const item = { ...sorted[i], orden: i + 1 };
    await upsertUbicacion(tenantId, tripId, item.orden, item);
  }
  const maxOrden = sorted.length;
  const extras = await TripUbicacion.findAll({
    where: { tenant_id: tenantId, trip_id: tripId },
  });
  for (const u of extras) {
    if (u.orden > maxOrden) await u.destroy();
  }
  return listUbicaciones(tenantId, tripId);
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
  await assertTripAllowsFiscalEdit(trip);
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
  await assertTripAllowsFiscalEdit(trip);
  const row = await TripMercancia.findOne({
    where: { id: mercanciaId, tenant_id: tenantId, trip_id: tripId },
  });
  if (!row) throw new Error("Mercancía no encontrada");
  await row.destroy();
}
