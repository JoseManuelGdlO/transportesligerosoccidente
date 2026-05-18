import { randomUUID } from "node:crypto";
import { TripUbicacion, TripMercancia } from "../models";
import type { UbicacionTipo } from "../models/TripUbicacion";
import { getTripOrThrow, assertTripOpen } from "./tripService";

export async function listUbicaciones(tenantId: string, tripId: string) {
  await getTripOrThrow(tenantId, tripId, false);
  return TripUbicacion.findAll({ where: { tenant_id: tenantId, trip_id: tripId } });
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
    distancia_km?: number;
  },
) {
  const trip = await getTripOrThrow(tenantId, tripId, false);
  await assertTripOpen(trip);
  const existing = await TripUbicacion.findOne({ where: { tenant_id: tenantId, trip_id: tripId, tipo } });
  const payload = {
    rfc: data.rfc ?? null,
    nombre: data.nombre ?? null,
    fecha_hora: data.fecha_hora ? new Date(data.fecha_hora) : null,
    calle: data.calle ?? null,
    colonia: data.colonia ?? null,
    municipio: data.municipio ?? null,
    localidad: data.localidad ?? null,
    estado: data.estado ?? null,
    cp: data.cp ?? null,
    distancia_km: data.distancia_km ?? null,
  };
  if (existing) {
    await existing.update(payload as never);
    return existing;
  }
  return TripUbicacion.create({
    id: randomUUID(),
    tenant_id: tenantId,
    trip_id: tripId,
    tipo,
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
  } as never);
}

export async function removeMercancia(tenantId: string, tripId: string, mercanciaId: string) {
  const trip = await getTripOrThrow(tenantId, tripId, false);
  await assertTripOpen(trip);
  const row = await TripMercancia.findOne({
    where: { id: mercanciaId, trip_id: tripId, tenant_id: tenantId },
  });
  if (!row) {
    const err = new Error("Mercancía no encontrada");
    (err as Error & { status?: number }).status = 404;
    throw err;
  }
  await row.destroy();
}

