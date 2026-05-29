import { randomUUID } from "node:crypto";
import { Op, type Transaction } from "sequelize";
import { Trip, FuelLoad, Expense, Driver, Truck, Client, sequelize } from "../models";
import * as routeService from "./routeService";
import {
  saveTripStops,
  normalizeParadasInput,
  deriveOrigenDestino,
  assertParadasEditable,
  type ParadaInput,
} from "./tripStopService";
import { syncUbicacionesFromTripStops } from "./tripFiscalService";

export async function nextFolio(tenantId: string, t?: Transaction): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `V-${year}-`;
  const last = await Trip.findOne({
    where: { tenant_id: tenantId, folio: { [Op.like]: `${prefix}%` } },
    order: [["folio", "DESC"]],
    transaction: t,
  });
  let seq = 1;
  if (last?.folio) {
    const m = last.folio.match(new RegExp(`^V-${year}-(\\d+)$`));
    if (m) seq = parseInt(m[1], 10) + 1;
  }
  return `${prefix}${String(seq).padStart(4, "0")}`;
}

export async function getTripOrThrow(
  tenantId: string,
  id: string,
  withNested = false,
  t?: Transaction,
  withFiscal = false,
) {
  const include: object[] = [];
  if (withNested) {
    include.push({ association: "fuel" }, { association: "expenses" });
  }
  if (withFiscal) {
    include.push(
      { association: "paradas" },
      { association: "ubicaciones" },
      { association: "mercancias" },
      { association: "cartaPorte" },
    );
  } else if (withNested) {
    include.push({ association: "paradas" });
  }
  const trip = await Trip.findOne({
    where: { id, tenant_id: tenantId },
    include: include.length ? include : undefined,
    transaction: t,
  });
  if (!trip) {
    const err = new Error("Viaje no encontrado");
    (err as Error & { status?: number }).status = 404;
    throw err;
  }
  return trip;
}

export async function assertTripOpen(trip: Trip) {
  if (trip.estatus !== "en_curso") {
    const err = new Error("El viaje ya está cerrado");
    (err as Error & { status?: number }).status = 400;
    throw err;
  }
}

export async function closeTrip(
  tenantId: string,
  id: string,
  data: { km_final: number; fecha_llegada: string; num_factura?: string },
) {
  const trip = await getTripOrThrow(tenantId, id, true);
  await assertTripOpen(trip);
  if (data.km_final <= trip.km_inicial) {
    const err = new Error("El km final debe ser mayor al inicial");
    (err as Error & { status?: number }).status = 400;
    throw err;
  }
  const factura = (data.num_factura?.trim() || trip.num_factura?.trim() || "");
  if (!factura) {
    const err = new Error("Número de factura requerido");
    (err as Error & { status?: number }).status = 400;
    throw err;
  }
  await trip.update({
    km_final: data.km_final,
    fecha_llegada: new Date(data.fecha_llegada),
    num_factura: factura,
    estatus: "cerrado",
  });
  return getTripOrThrow(tenantId, id, true, undefined, true);
}

export async function deleteTrip(tenantId: string, id: string) {
  const trip = await getTripOrThrow(tenantId, id, false);
  await trip.destroy();
}

export async function addFuel(
  tenantId: string,
  tripId: string,
  body: {
    litros: number;
    precio_litro: number;
    ubicacion: string;
    fecha?: string;
    es_foraneo?: boolean;
    estacion_nombre?: string;
    es_estacion_empresa?: boolean;
    comprobante_url?: string;
  },
) {
  await getTripOrThrow(tenantId, tripId, false);
  const esForaneo = !!body.es_foraneo;
  return FuelLoad.create({
    id: randomUUID(),
    tenant_id: tenantId,
    trip_id: tripId,
    litros: body.litros,
    precio_litro: body.precio_litro,
    ubicacion: body.ubicacion,
    es_foraneo: esForaneo,
    estacion_nombre: body.estacion_nombre?.trim() || body.ubicacion,
    es_estacion_empresa: esForaneo ? false : body.es_estacion_empresa !== false,
    comprobante_url: body.comprobante_url ?? null,
    fecha: body.fecha ? new Date(body.fecha) : new Date(),
  } as never);
}

export async function removeFuel(tenantId: string, tripId: string, fuelId: string) {
  await getTripOrThrow(tenantId, tripId, false);
  const f = await FuelLoad.findOne({ where: { id: fuelId, trip_id: tripId, tenant_id: tenantId } });
  if (!f) {
    const err = new Error("Carga no encontrada");
    (err as Error & { status?: number }).status = 404;
    throw err;
  }
  await f.destroy();
}

export async function addExpense(
  tenantId: string,
  tripId: string,
  body: {
    categoria: "casetas" | "refacciones" | "hospedaje" | "comidas" | "otros";
    descripcion: string;
    monto: number;
    comprobado: boolean;
    fecha?: string;
  },
) {
  await getTripOrThrow(tenantId, tripId, false);
  return Expense.create({
    id: randomUUID(),
    tenant_id: tenantId,
    trip_id: tripId,
    categoria: body.categoria,
    descripcion: body.descripcion,
    monto: body.monto,
    comprobado: body.comprobado,
    fecha: body.fecha ? new Date(body.fecha) : new Date(),
  } as never);
}

export async function removeExpense(tenantId: string, tripId: string, expenseId: string) {
  await getTripOrThrow(tenantId, tripId, false);
  const e = await Expense.findOne({ where: { id: expenseId, trip_id: tripId, tenant_id: tenantId } });
  if (!e) {
    const err = new Error("Gasto no encontrado");
    (err as Error & { status?: number }).status = 404;
    throw err;
  }
  await e.destroy();
}

const PATCH_OPEN_ONLY = [
  "truck_id",
  "driver_id",
  "client_id",
  "origen",
  "destino",
  "route_id",
  "km_inicial",
  "tarifa",
  "viaticos_entregados",
  "fecha_salida",
  "tipo_viaje",
] as const;

const PATCH_WHEN_CLOSED = ["num_factura", "comision_override"] as const;

export async function patchTrip(tenantId: string, id: string, patch: Partial<Record<string, unknown>>) {
  const trip = await getTripOrThrow(tenantId, id, false);
  const isClosed = trip.estatus === "cerrado";

  if (isClosed) {
    for (const k of PATCH_OPEN_ONLY) {
      if (patch[k] !== undefined) {
        const err = new Error(`No se puede modificar "${k}" en un viaje cerrado`);
        (err as Error & { status?: number }).status = 400;
        throw err;
      }
    }
  } else {
    await assertTripOpen(trip);
  }

  const allowed = isClosed
    ? [...PATCH_WHEN_CLOSED]
    : [...PATCH_OPEN_ONLY, ...PATCH_WHEN_CLOSED];

  const data: Record<string, unknown> = {};
  for (const k of allowed) {
    if (k === "fecha_salida") continue;
    if (patch[k] !== undefined) data[k] = patch[k];
  }
  if (patch.num_factura !== undefined) {
    const v = String(patch.num_factura).trim();
    data.num_factura = v || null;
  }
  if (!isClosed && patch.fecha_salida !== undefined) {
    data.fecha_salida = new Date(String(patch.fecha_salida));
  }
  if (patch.comision_override === null) data.comision_override = null;

  const paradasPatch = patch.paradas as ParadaInput[] | undefined;
  if (!isClosed && paradasPatch) {
    await assertParadasEditable(tenantId, id);
    const paradas = normalizeParadasInput({ paradas: paradasPatch });
    const { origen, destino } = deriveOrigenDestino(paradas);
    data.origen = origen;
    data.destino = destino;
  }

  await trip.update(data as never);

  if (!isClosed && paradasPatch) {
    const paradas = normalizeParadasInput({ paradas: paradasPatch });
    await saveTripStops(tenantId, id, paradas);
    await syncUbicacionesFromTripStops(tenantId, id);
  }

  return getTripOrThrow(tenantId, id, true, undefined, true);
}

export async function assertCatalogRefs(
  tenantId: string,
  refs: { truck_id: string; driver_id: string; client_id: string },
) {
  const [tr, dr, cl] = await Promise.all([
    Truck.findOne({ where: { id: refs.truck_id, tenant_id: tenantId } }),
    Driver.findOne({ where: { id: refs.driver_id, tenant_id: tenantId } }),
    Client.findOne({ where: { id: refs.client_id, tenant_id: tenantId } }),
  ]);
  if (!tr || !dr || !cl) {
    const err = new Error("Camión, operador o cliente no válido para esta empresa");
    (err as Error & { status?: number }).status = 400;
    throw err;
  }
}

export async function createTrip(
  tenantId: string,
  data: {
    truck_id: string;
    driver_id: string;
    client_id: string;
    origen?: string;
    destino?: string;
    paradas?: ParadaInput[] | string[];
    route_id?: string;
    fecha_salida: string | Date;
    km_inicial: number;
    tarifa: number;
    viaticos_entregados?: number;
    num_factura?: string;
    tipo_viaje?: "local" | "foraneo";
  },
) {
  await assertCatalogRefs(tenantId, {
    truck_id: data.truck_id,
    driver_id: data.driver_id,
    client_id: data.client_id,
  });

  let paradas: ParadaInput[];
  if (data.route_id) {
    paradas = await routeService.getRouteStopsForTrip(tenantId, data.route_id);
  } else {
    paradas = normalizeParadasInput(data);
  }
  const { origen, destino } = deriveOrigenDestino(paradas);

  return sequelize.transaction(async (t) => {
    const folio = await nextFolio(tenantId, t);
    const tripId = randomUUID();
    const created = await Trip.create(
      {
        id: tripId,
        tenant_id: tenantId,
        folio,
        truck_id: data.truck_id,
        driver_id: data.driver_id,
        client_id: data.client_id,
        route_id: data.route_id ?? null,
        origen,
        destino,
        fecha_salida: new Date(data.fecha_salida),
        km_inicial: data.km_inicial,
        tarifa: data.tarifa,
        viaticos_entregados: data.viaticos_entregados ?? 0,
        num_factura: data.num_factura?.trim() || null,
        tipo_viaje: data.tipo_viaje ?? "local",
        estatus: "en_curso",
      } as never,
      { transaction: t },
    );
    await saveTripStops(tenantId, created.id, paradas, t);
    await syncUbicacionesFromTripStops(tenantId, created.id);
    return getTripOrThrow(tenantId, created.id, true, t, true);
  });
}

export async function listTripsForReports(tenantId: string) {
  return Trip.findAll({
    where: { tenant_id: tenantId },
    include: [
      { association: "fuel" },
      { association: "expenses" },
      { model: Driver, attributes: ["id", "comision_tipo", "comision_valor", "tenant_id"] },
    ],
  });
}

export async function getLastClosedKmFinal(
  tenantId: string,
  truckId: string,
  excludeTripId?: string,
): Promise<number | null> {
  const where: Record<string, unknown> = {
    tenant_id: tenantId,
    truck_id: truckId,
    estatus: "cerrado",
    km_final: { [Op.ne]: null },
  };
  if (excludeTripId) where.id = { [Op.ne]: excludeTripId };

  const lastTrip = await Trip.findOne({
    where,
    order: [["fecha_llegada", "DESC"]],
    attributes: ["km_final"],
  });
  return lastTrip?.km_final ?? null;
}
