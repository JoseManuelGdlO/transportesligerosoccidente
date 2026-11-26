import { randomUUID } from "node:crypto";
import { Trip, Client, ClientUbicacion, TripUbicacion, TripMercancia, CartaPorte } from "../models";
import type { UbicacionTipo } from "../models/TripUbicacion";
import { getTripOrThrow, assertCartaPermiteEdicionFiscal } from "./tripService";
import { listTripStops } from "./tripStopService";
import { resolveMercanciaCatalog } from "./satCatalogService";
import { cartaVisible } from "./cartaPorteSelection";

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

/** Solo origen y destino final para timbrado (omite paradas intermedias operativas). */
export function normalizeFiscalUbicaciones<T extends { orden: number }>(ubicaciones: T[]): T[] {
  const sorted = [...ubicaciones].sort((a, b) => a.orden - b.orden);
  if (sorted.length === 0) return [];
  const origen = sorted.find((u) => u.orden === 1) ?? sorted[0];
  const destino = sorted[sorted.length - 1];
  if (origen.orden === destino.orden) return [origen];
  return [origen, destino];
}

function tipoFromOrden(orden: number): UbicacionTipo {
  return orden === 1 ? "Origen" : "Destino";
}

function httpError(message: string, status: number): Error {
  const err = new Error(message);
  (err as Error & { status?: number }).status = status;
  return err;
}

/** `null` son filas todavía sin factura (el viaje aún no tiene carta). */
function cartaScope(cartaId: string | null) {
  return { carta_porte_id: cartaId };
}

/** RFC y domicilio de prellenado: los del cliente de esa carta, no los de otra factura del viaje. */
async function clienteDeCartaFiscal(
  tenantId: string,
  trip: Trip & { Client?: Client },
  cartaId: string | null,
): Promise<Client | null> {
  const incluido = trip.Client ?? null;
  if (!cartaId) return incluido;
  const carta = await CartaPorte.findOne({
    where: { id: cartaId, tenant_id: tenantId, trip_id: trip.id },
    attributes: ["id", "client_id"],
  });
  const id = carta?.client_id || trip.client_id;
  if (!id) return null;
  if (incluido && incluido.id === id) return incluido;
  return Client.findOne({ where: { id, tenant_id: tenantId } });
}

async function cartaEditableId(
  tenantId: string,
  tripId: string,
  cartaId?: string,
): Promise<string | null> {
  const trip = await getTripOrThrow(tenantId, tripId, false);
  if (cartaId) {
    const carta = await CartaPorte.findOne({
      where: { id: cartaId, tenant_id: tenantId, trip_id: tripId },
    });
    if (!carta) throw httpError("Carta porte no encontrada", 404);
    await assertCartaPermiteEdicionFiscal(trip, carta);
    return carta.id;
  }
  const cartas = await CartaPorte.findAll({
    where: { tenant_id: tenantId, trip_id: tripId },
    order: [["created_at", "ASC"]],
  });
  const editable = [...cartas].reverse().find((c) => c.estatus === "borrador" || c.estatus === "error");
  if (editable) {
    await assertCartaPermiteEdicionFiscal(trip, editable);
    return editable.id;
  }
  if (cartas.length === 0) {
    await assertCartaPermiteEdicionFiscal(trip, null);
    return null;
  }
  throw httpError("No hay una factura en borrador para editar ubicaciones o mercancías", 400);
}

function copyPlain<T extends { get(opts: { plain: true }): unknown }>(row: T): Record<string, unknown> {
  const plain = { ...(row.get({ plain: true }) as Record<string, unknown>) };
  delete plain.id;
  delete plain.createdAt;
  delete plain.updatedAt;
  return plain;
}

/** La primera factura se queda con las filas que aún no tenían carta. */
export async function reclamarFiscalHuerfano(tenantId: string, tripId: string, cartaId: string) {
  const ubicaciones = await TripUbicacion.count({
    where: { tenant_id: tenantId, trip_id: tripId, carta_porte_id: cartaId },
  });
  if (ubicaciones === 0) {
    await TripUbicacion.update({ carta_porte_id: cartaId } as never, {
      where: { tenant_id: tenantId, trip_id: tripId, carta_porte_id: null },
    });
  }
  const mercancias = await TripMercancia.count({
    where: { tenant_id: tenantId, trip_id: tripId, carta_porte_id: cartaId },
  });
  if (mercancias === 0) {
    await TripMercancia.update({ carta_porte_id: cartaId } as never, {
      where: { tenant_id: tenantId, trip_id: tripId, carta_porte_id: null },
    });
  }
}

/** Cada factura nueva arranca con una copia de la anterior, no con las mismas filas. */
export async function clonarFiscalHaciaCarta(
  tenantId: string,
  tripId: string,
  sourceCartaId: string,
  targetCartaId: string,
) {
  const ubicaciones = await TripUbicacion.count({
    where: { tenant_id: tenantId, trip_id: tripId, carta_porte_id: targetCartaId },
  });
  if (ubicaciones === 0) {
    const rows = await TripUbicacion.findAll({
      where: { tenant_id: tenantId, trip_id: tripId, carta_porte_id: sourceCartaId },
      order: [["orden", "ASC"]],
    });
    for (const row of rows) {
      await TripUbicacion.create({
        ...copyPlain(row),
        id: randomUUID(),
        carta_porte_id: targetCartaId,
      } as never);
    }
  }
  const mercancias = await TripMercancia.count({
    where: { tenant_id: tenantId, trip_id: tripId, carta_porte_id: targetCartaId },
  });
  if (mercancias === 0) {
    const rows = await TripMercancia.findAll({
      where: { tenant_id: tenantId, trip_id: tripId, carta_porte_id: sourceCartaId },
    });
    for (const row of rows) {
      await TripMercancia.create({
        ...copyPlain(row),
        id: randomUUID(),
        carta_porte_id: targetCartaId,
      } as never);
    }
  }
}

function addressFromClient(client: Client) {
  return {
    calle: client.calle ?? null,
    numero_exterior: client.numero_exterior ?? null,
    numero_interior: client.numero_interior ?? null,
    colonia: client.colonia ?? null,
    colonia_clave: client.colonia_clave ?? null,
    localidad: client.localidad ?? null,
    localidad_clave: client.localidad_clave ?? null,
    municipio: client.municipio ?? null,
    municipio_clave: client.municipio_clave ?? null,
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
    colonia_clave: u.colonia_clave ?? null,
    localidad: u.localidad ?? null,
    localidad_clave: u.localidad_clave ?? null,
    municipio: u.municipio ?? null,
    municipio_clave: u.municipio_clave ?? null,
    estado: u.estado ?? null,
    cp: u.cp ?? null,
    pais: u.pais ?? "MEX",
  };
}

export async function listUbicaciones(tenantId: string, tripId: string, cartaId: string | null) {
  await getTripOrThrow(tenantId, tripId, false);
  return TripUbicacion.findAll({
    where: { tenant_id: tenantId, trip_id: tripId, ...cartaScope(cartaId) },
    order: [["orden", "ASC"]],
  });
}

async function editableCartaIds(tenantId: string, tripId: string): Promise<Array<string | null>> {
  const cartas = await CartaPorte.findAll({
    where: { tenant_id: tenantId, trip_id: tripId },
    order: [["created_at", "ASC"]],
  });
  const editable = cartas
    .filter((c) => c.estatus === "borrador" || c.estatus === "error")
    .map((c) => c.id);
  if (editable.length > 0) return editable;
  if (cartas.length === 0) return [null];
  return [];
}

/** Prefill de la factura editable. Una carta ya timbrada no se vuelve a llenar. */
export async function ensureUbicacionesFromClient(tenantId: string, tripId: string) {
  const cartas = await CartaPorte.findAll({
    where: { tenant_id: tenantId, trip_id: tripId },
    order: [["created_at", "ASC"]],
  });
  const editable = [...cartas].reverse().find((c) => c.estatus === "borrador" || c.estatus === "error");
  if (!editable && cartas.length > 0) return;
  const cartaId = editable?.id ?? null;

  const stops = await listTripStops(tenantId, tripId);
  if (stops.length >= 2) {
    await syncUbicacionesDeCarta(tenantId, tripId, cartaId);
    return;
  }

  const trip = await Trip.findOne({
    where: { id: tripId, tenant_id: tenantId },
    include: [{ model: Client }],
  });
  if (!trip) return;
  const client = await clienteDeCartaFiscal(tenantId, trip, cartaId);
  if (!client) return;

  const existing = await TripUbicacion.findAll({
    where: { tenant_id: tenantId, trip_id: tripId, ...cartaScope(cartaId) },
  });
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
      carta_porte_id: cartaId,
      orden: 1,
      tipo: "Origen",
      id_ubicacion_sat: defaultIdUbicacionSat("Origen", tripId, 1),
      rfc: clientDefaults.rfc,
      nombre: clientDefaults.nombre,
      calle: trip.origen || clientDefaults.calle,
      numero_exterior: clientDefaults.numero_exterior,
      numero_interior: clientDefaults.numero_interior,
      colonia: clientDefaults.colonia,
      colonia_clave: clientDefaults.colonia_clave,
      localidad: clientDefaults.localidad,
      localidad_clave: clientDefaults.localidad_clave,
      municipio: clientDefaults.municipio,
      municipio_clave: clientDefaults.municipio_clave,
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
      carta_porte_id: cartaId,
      orden: 2,
      tipo: "Destino",
      id_ubicacion_sat: defaultIdUbicacionSat("Destino", tripId, 2),
      rfc: clientDefaults.rfc,
      nombre: clientDefaults.nombre,
      calle: trip.destino || clientDefaults.calle,
      numero_exterior: clientDefaults.numero_exterior,
      numero_interior: clientDefaults.numero_interior,
      colonia: clientDefaults.colonia,
      colonia_clave: clientDefaults.colonia_clave,
      localidad: clientDefaults.localidad,
      localidad_clave: clientDefaults.localidad_clave,
      municipio: clientDefaults.municipio,
      municipio_clave: clientDefaults.municipio_clave,
      estado: clientDefaults.estado,
      cp: clientDefaults.cp,
      pais: clientDefaults.pais,
    } as never);
  }
}

export async function syncUbicacionesFromTripStops(tenantId: string, tripId: string) {
  const targets = await editableCartaIds(tenantId, tripId);
  for (const cartaId of targets) {
    await syncUbicacionesDeCarta(tenantId, tripId, cartaId);
  }
}

async function syncUbicacionesDeCarta(tenantId: string, tripId: string, cartaId: string | null) {
  const trip = await Trip.findOne({
    where: { id: tripId, tenant_id: tenantId },
    include: [{ model: Client }],
  });
  if (!trip) return;

  const client = await clienteDeCartaFiscal(tenantId, trip, cartaId);
  const stops = await listTripStops(tenantId, tripId);
  if (stops.length < 2) return;

  const existing = await TripUbicacion.findAll({
    where: { tenant_id: tenantId, trip_id: tripId, ...cartaScope(cartaId) },
    order: [["orden", "ASC"]],
  });
  const destinoLegacy =
    existing.find((u) => u.orden === 2) ??
    [...existing].filter((u) => u.orden > 1).sort((a, b) => b.orden - a.orden)[0];

  const fiscalPairs: Array<{
    stop: (typeof stops)[0];
    fiscalOrden: number;
    tipo: UbicacionTipo;
    legacyRow?: TripUbicacion;
  }> = [
    { stop: stops[0], fiscalOrden: 1, tipo: "Origen", legacyRow: existing.find((u) => u.orden === 1) },
    {
      stop: stops[stops.length - 1],
      fiscalOrden: 2,
      tipo: "Destino",
      legacyRow: destinoLegacy,
    },
  ];

  for (const { stop, fiscalOrden, tipo, legacyRow } of fiscalPairs) {
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
    const row = legacyRow;

    const payload = {
      orden: fiscalOrden,
      tipo,
      rfc: row?.rfc ?? catalog?.rfc ?? clientDefaults?.rfc ?? null,
      nombre: row?.nombre ?? catalog?.razon_social ?? clientDefaults?.nombre ?? null,
      calle: row?.calle ?? addr?.calle ?? stop.etiqueta,
      numero_exterior: row?.numero_exterior ?? addr?.numero_exterior ?? null,
      numero_interior: row?.numero_interior ?? addr?.numero_interior ?? null,
      colonia: row?.colonia ?? addr?.colonia ?? null,
      colonia_clave: row?.colonia_clave ?? addr?.colonia_clave ?? null,
      localidad: row?.localidad ?? addr?.localidad ?? null,
      localidad_clave: row?.localidad_clave ?? addr?.localidad_clave ?? null,
      municipio: row?.municipio ?? addr?.municipio ?? null,
      municipio_clave: row?.municipio_clave ?? addr?.municipio_clave ?? null,
      estado: row?.estado ?? addr?.estado ?? null,
      cp: row?.cp ?? addr?.cp ?? null,
      pais: row?.pais ?? addr?.pais ?? "MEX",
      client_ubicacion_id: stop.client_ubicacion_id ?? row?.client_ubicacion_id ?? null,
      fecha_hora: row?.fecha_hora ?? (fiscalOrden === 1 ? trip.fecha_salida : null),
      distancia_km: fiscalOrden === 2 ? (row?.distancia_km ?? null) : null,
      id_ubicacion_sat: row?.id_ubicacion_sat ?? defaultIdUbicacionSat(tipo, tripId, fiscalOrden),
    };

    const existingAtOrden = await TripUbicacion.findOne({
      where: { tenant_id: tenantId, trip_id: tripId, orden: fiscalOrden, ...cartaScope(cartaId) },
    });
    if (existingAtOrden) {
      await existingAtOrden.update(payload as never);
    } else {
      await TripUbicacion.create({
        id: randomUUID(),
        tenant_id: tenantId,
        trip_id: tripId,
        carta_porte_id: cartaId,
        ...payload,
      } as never);
    }
  }

  for (const u of existing) {
    if (u.orden > 2) await u.destroy();
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
    rfc: data.rfc ?? catalog.rfc ?? client?.rfc ?? null,
    nombre: data.nombre ?? catalog.razon_social ?? client?.razon_social ?? catalog.nombre,
    calle: data.calle ?? addr.calle,
    numero_exterior: data.numero_exterior ?? addr.numero_exterior,
    numero_interior: data.numero_interior ?? addr.numero_interior,
    colonia: data.colonia ?? addr.colonia,
    colonia_clave: data.colonia_clave ?? addr.colonia_clave,
    localidad: data.localidad ?? addr.localidad,
    localidad_clave: data.localidad_clave ?? addr.localidad_clave,
    municipio: data.municipio ?? addr.municipio,
    municipio_clave: data.municipio_clave ?? addr.municipio_clave,
    estado: data.estado ?? addr.estado,
    cp: data.cp ?? addr.cp,
    pais: data.pais ?? addr.pais,
    client_ubicacion_id: catalog.id,
  };
}

type UbicacionInput = {
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
};

async function upsertUbicacionEnCarta(
  tenantId: string,
  tripId: string,
  cartaId: string | null,
  orden: number,
  data: UbicacionInput,
) {
  const tipo = tipoFromOrden(orden);
  const resolved = await resolveUbicacionPayload(tenantId, data);
  const existing = await TripUbicacion.findOne({
    where: { tenant_id: tenantId, trip_id: tripId, orden, ...cartaScope(cartaId) },
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
    carta_porte_id: cartaId,
    id_ubicacion_sat: defaultIdUbicacionSat(tipo, tripId, orden),
    ...payload,
  } as never);
}

export async function upsertUbicacion(
  tenantId: string,
  tripId: string,
  orden: number,
  data: UbicacionInput,
  cartaId?: string,
) {
  const destino = await cartaEditableId(tenantId, tripId, cartaId);
  return upsertUbicacionEnCarta(tenantId, tripId, destino, orden, data);
}

/** Legacy: upsert by tipo (first Origen or first Destino by orden). */
export async function upsertUbicacionByTipo(
  tenantId: string,
  tripId: string,
  tipo: UbicacionTipo,
  data: UbicacionInput,
  cartaId?: string,
) {
  const destino = await cartaEditableId(tenantId, tripId, cartaId);
  const orden = tipo === "Origen" ? 1 : 2;
  const existing = await TripUbicacion.findOne({
    where: { tenant_id: tenantId, trip_id: tripId, tipo, ...cartaScope(destino) },
    order: [["orden", "ASC"]],
  });
  return upsertUbicacionEnCarta(tenantId, tripId, destino, existing?.orden ?? orden, data);
}

export async function replaceUbicaciones(
  tenantId: string,
  tripId: string,
  items: Array<UbicacionInput & { orden: number }>,
  cartaId?: string,
) {
  const destino = await cartaEditableId(tenantId, tripId, cartaId);
  if (items.length < 2) {
    throw httpError("Se requieren al menos 2 ubicaciones", 400);
  }
  const sorted = [...items].sort((a, b) => a.orden - b.orden);
  for (let i = 0; i < sorted.length; i++) {
    const item = { ...sorted[i], orden: i + 1 };
    await upsertUbicacionEnCarta(tenantId, tripId, destino, item.orden, item);
  }
  const maxOrden = sorted.length;
  const extras = await TripUbicacion.findAll({
    where: { tenant_id: tenantId, trip_id: tripId, ...cartaScope(destino) },
  });
  for (const u of extras) {
    if (u.orden > maxOrden) await u.destroy();
  }
  return listUbicaciones(tenantId, tripId, destino);
}

async function cartaIdVisible(tenantId: string, tripId: string, cartaId?: string): Promise<string | null> {
  if (cartaId) return cartaId;
  const cartas = await CartaPorte.findAll({
    where: { tenant_id: tenantId, trip_id: tripId },
    order: [["created_at", "ASC"]],
  });
  return cartaVisible(cartas)?.id ?? null;
}

export async function listMercancias(tenantId: string, tripId: string, cartaId?: string) {
  await getTripOrThrow(tenantId, tripId, false);
  const destino = await cartaIdVisible(tenantId, tripId, cartaId);
  return TripMercancia.findAll({
    where: { tenant_id: tenantId, trip_id: tripId, ...cartaScope(destino) },
  });
}

export async function addMercancia(
  tenantId: string,
  tripId: string,
  data: {
    descripcion: string;
    cantidad: number;
    unidad?: string;
    peso_kg: number;
    clave_prod_serv: string;
    material_peligroso?: boolean;
    embalaje?: string;
    cantidad_transportada?: number;
  },
  cartaId?: string,
) {
  const destino = await cartaEditableId(tenantId, tripId, cartaId);
  const catalog = await resolveMercanciaCatalog(
    data.clave_prod_serv,
    data.material_peligroso,
    data.descripcion,
  );
  return TripMercancia.create({
    id: randomUUID(),
    tenant_id: tenantId,
    trip_id: tripId,
    carta_porte_id: destino,
    descripcion: data.descripcion,
    cantidad: data.cantidad,
    unidad: data.unidad ?? "H87",
    peso_kg: data.peso_kg,
    clave_prod_serv: catalog.clave_prod_serv,
    material_peligroso: catalog.material_peligroso,
    embalaje: data.embalaje ?? null,
    cantidad_transportada: data.cantidad_transportada ?? null,
  } as never);
}

export async function removeMercancia(
  tenantId: string,
  tripId: string,
  mercanciaId: string,
  cartaId?: string,
) {
  const destino = await cartaEditableId(tenantId, tripId, cartaId);
  const row = await TripMercancia.findOne({
    where: {
      id: mercanciaId,
      tenant_id: tenantId,
      trip_id: tripId,
      ...cartaScope(destino),
    },
  });
  if (!row) throw httpError("Mercancía no encontrada", 404);
  await row.destroy();
}
