import { randomUUID } from "node:crypto";
import { Op } from "sequelize";
import { Route, RouteStop, Client } from "../models";
import type { ParadaInput } from "./tripStopService";
import { formatRutaResumen } from "./tripStopService";

function err(msg: string, status = 400): Error {
  const e = new Error(msg);
  (e as Error & { status?: number }).status = status;
  return e;
}

async function saveRouteStops(routeId: string, paradas: ParadaInput[]) {
  await RouteStop.destroy({ where: { route_id: routeId } });
  for (let i = 0; i < paradas.length; i++) {
    const p = paradas[i];
    await RouteStop.create({
      id: randomUUID(),
      route_id: routeId,
      orden: i + 1,
      etiqueta: p.etiqueta,
      client_ubicacion_id: p.client_ubicacion_id ?? null,
    } as never);
  }
}

export async function listRoutes(
  tenantId: string,
  opts: { client_id?: string; all?: boolean; includeInactive?: boolean },
) {
  const base: Record<string, unknown> = { tenant_id: tenantId };
  if (!opts.includeInactive) base.estatus = "activo";

  let where: Record<string, unknown>;
  if (opts.all && opts.client_id) {
    where = { ...base, [Op.or]: [{ client_id: null }, { client_id: opts.client_id }] };
  } else if (opts.client_id) {
    where = { ...base, client_id: opts.client_id };
  } else {
    where = { ...base, client_id: null };
  }

  return Route.findAll({
    where: where as never,
    include: [
      { association: "stops", separate: true, order: [["orden", "ASC"]] },
      { model: Client, attributes: ["id", "razon_social"] },
    ],
    order: [["nombre", "ASC"]],
  });
}

export async function getRouteOrThrow(tenantId: string, id: string) {
  const row = await Route.findOne({
    where: { id, tenant_id: tenantId },
    include: [{ association: "stops", separate: true, order: [["orden", "ASC"]] }],
  });
  if (!row) throw err("Ruta no encontrada", 404);
  return row;
}

export async function getRouteStopsForTrip(tenantId: string, routeId: string): Promise<ParadaInput[]> {
  const route = await getRouteOrThrow(tenantId, routeId);
  const stops = route.stops ?? [];
  if (stops.length < 2) throw err("La ruta del catálogo debe tener al menos 2 paradas");
  return stops.map((s) => ({
    etiqueta: s.etiqueta,
    client_ubicacion_id: s.client_ubicacion_id,
  }));
}

export async function createRoute(
  tenantId: string,
  data: {
    nombre: string;
    client_id?: string | null;
    tipo_viaje?: "local" | "foraneo" | null;
    paradas: ParadaInput[];
  },
) {
  if (data.paradas.length < 2) throw err("Se requieren al menos 2 paradas");
  if (data.client_id) {
    const cl = await Client.findOne({ where: { id: data.client_id, tenant_id: tenantId } });
    if (!cl) throw err("Cliente no válido");
  }
  const id = randomUUID();
  const route = await Route.create({
    id,
    tenant_id: tenantId,
    client_id: data.client_id ?? null,
    nombre: data.nombre.trim(),
    tipo_viaje: data.tipo_viaje ?? null,
    estatus: "activo",
  } as never);
  await saveRouteStops(id, data.paradas);
  return getRouteOrThrow(tenantId, id);
}

export async function updateRoute(
  tenantId: string,
  id: string,
  data: {
    nombre?: string;
    client_id?: string | null;
    tipo_viaje?: "local" | "foraneo" | null;
    estatus?: "activo" | "inactivo";
    paradas?: ParadaInput[];
  },
) {
  const route = await getRouteOrThrow(tenantId, id);
  if (data.client_id) {
    const cl = await Client.findOne({ where: { id: data.client_id, tenant_id: tenantId } });
    if (!cl) throw err("Cliente no válido");
  }
  const patch: Record<string, unknown> = {};
  if (data.nombre !== undefined) patch.nombre = data.nombre.trim();
  if (data.client_id !== undefined) patch.client_id = data.client_id;
  if (data.tipo_viaje !== undefined) patch.tipo_viaje = data.tipo_viaje;
  if (data.estatus !== undefined) patch.estatus = data.estatus;
  if (Object.keys(patch).length) await route.update(patch as never);
  if (data.paradas) {
    if (data.paradas.length < 2) throw err("Se requieren al menos 2 paradas");
    await saveRouteStops(id, data.paradas);
  }
  return getRouteOrThrow(tenantId, id);
}

export async function deleteRoute(tenantId: string, id: string) {
  const route = await getRouteOrThrow(tenantId, id);
  await route.update({ estatus: "inactivo" } as never);
}

export { formatRutaResumen };
