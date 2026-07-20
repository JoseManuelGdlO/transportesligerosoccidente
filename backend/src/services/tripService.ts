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
import {
  STATUSES_INCLUDE,
  tripHasStatusSlug,
  tripIsClosed,
  assignEnCursoOnCreate,
  swapSystemStatus,
  getClosedStatusIds,
  assertNoOpenTripConflict,
} from "./tripStatusService";
import { assertTripScheduleAndOdometer } from "./tripSequenceValidation";

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function nextFolio(
  tenantId: string,
  truckId: string,
  t?: Transaction,
): Promise<string> {
  const truck = await Truck.findOne({
    where: { id: truckId, tenant_id: tenantId },
    transaction: t,
  });
  if (!truck) {
    const err = new Error("Camión no válido para esta empresa");
    (err as Error & { status?: number }).status = 400;
    throw err;
  }
  const eco = truck.numero_economico.trim();
  const existing = await Trip.findAll({
    where: { tenant_id: tenantId, truck_id: truckId },
    attributes: ["folio"],
    transaction: t,
  });
  const re = new RegExp(`^${escapeRegex(eco)}-(\\d+)$`);
  let maxSeq = 0;
  for (const row of existing) {
    const m = row.folio.match(re);
    if (m) maxSeq = Math.max(maxSeq, parseInt(m[1], 10));
  }
  return `${eco}-${maxSeq + 1}`;
}

export async function getTripOrThrow(
  tenantId: string,
  id: string,
  withNested = false,
  t?: Transaction,
  withFiscal = false,
) {
  const include: object[] = [{ ...STATUSES_INCLUDE }];
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
  if (tripIsClosed(trip)) {
    const err = new Error("El viaje ya está cerrado");
    (err as Error & { status?: number }).status = 400;
    throw err;
  }
}

export async function assertTripAllowsFiscalEdit(trip: Trip) {
  if (!tripHasStatusSlug(trip, "en_curso") && !tripHasStatusSlug(trip, "cerrado")) {
    const err = new Error("El viaje no permite editar datos fiscales de carta porte");
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
  const fechaLlegada = new Date(data.fecha_llegada);
  await assertTripScheduleAndOdometer(tenantId, {
    tripId: id,
    folio: trip.folio,
    truckId: String(trip.truck_id),
    fecha_salida: trip.fecha_salida,
    fecha_llegada: fechaLlegada,
    km_inicial: trip.km_inicial,
    km_final: data.km_final,
  });
  await trip.update({
    km_final: data.km_final,
    fecha_llegada: fechaLlegada,
    num_factura: factura,
  });
  await swapSystemStatus(tenantId, id, "en_curso", "cerrado");
  const closed = await getTripOrThrow(tenantId, id, true, undefined, true);
  try {
    const { upsertFromTrip } = await import("./accountDocumentService");
    await upsertFromTrip(closed);
  } catch (syncErr) {
    console.warn(
      "[trip] Viaje cerrado pero falló sync de documento CXC:",
      syncErr instanceof Error ? syncErr.message : syncErr,
    );
  }
  return closed;
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
  const load = await FuelLoad.create({
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
  try {
    const { upsertFromFuelLoad } = await import("./accountDocumentService");
    await upsertFromFuelLoad(load);
  } catch (syncErr) {
    console.warn(
      "[trip] Carga de combustible creada pero falló sync de documento CXP:",
      syncErr instanceof Error ? syncErr.message : syncErr,
    );
  }
  return load;
}

export async function removeFuel(tenantId: string, tripId: string, fuelId: string) {
  await getTripOrThrow(tenantId, tripId, false);
  const f = await FuelLoad.findOne({ where: { id: fuelId, trip_id: tripId, tenant_id: tenantId } });
  if (!f) {
    const err = new Error("Carga no encontrada");
    (err as Error & { status?: number }).status = 404;
    throw err;
  }
  if (f.fuel_ticket_id) {
    const err = new Error("Carga generada por prorrateo; no se puede eliminar");
    (err as Error & { status?: number }).status = 400;
    throw err;
  }
  await f.destroy();
}

export async function addExpense(
  tenantId: string,
  tripId: string,
  body: {
    categoria: "casetas" | "refacciones" | "hospedaje" | "comidas" | "otros";
    tipo?: "gasto" | "ingreso";
    descripcion: string;
    monto: number;
    monto_comprobado: number;
    visible_en_liquidacion?: boolean;
    fecha?: string;
    supplier_id?: string | null;
  },
) {
  await getTripOrThrow(tenantId, tripId, false);
  const tipo = body.tipo ?? "gasto";
  const visible_en_liquidacion =
    tipo === "ingreso" ? Boolean(body.visible_en_liquidacion) : false;
  const expense = await Expense.create({
    id: randomUUID(),
    tenant_id: tenantId,
    trip_id: tripId,
    categoria: body.categoria,
    tipo,
    descripcion: body.descripcion,
    monto: body.monto,
    monto_comprobado: body.monto_comprobado,
    visible_en_liquidacion,
    fecha: body.fecha ? new Date(body.fecha) : new Date(),
    supplier_id: body.supplier_id ?? null,
  } as never);
  try {
    const { upsertFromExpense } = await import("./accountDocumentService");
    await upsertFromExpense(expense);
  } catch (syncErr) {
    console.warn(
      "[trip] Gasto creado pero falló sync de documento CXP:",
      syncErr instanceof Error ? syncErr.message : syncErr,
    );
  }
  return expense;
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

const PATCH_TRIP_FIELDS = [
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
  "num_factura",
  "comision_override",
] as const;

export async function patchTrip(tenantId: string, id: string, patch: Partial<Record<string, unknown>>) {
  const trip = await getTripOrThrow(tenantId, id, false);
  const isClosed = tripIsClosed(trip);

  if (!isClosed) {
    await assertTripOpen(trip);
    if (patch.km_final !== undefined || patch.fecha_llegada !== undefined) {
      const err = new Error("Km final y fecha de llegada solo se editan en viajes cerrados; use cerrar viaje");
      (err as Error & { status?: number }).status = 400;
      throw err;
    }
  }

  const data: Record<string, unknown> = {};
  for (const k of PATCH_TRIP_FIELDS) {
    if (k === "fecha_salida" || k === "num_factura" || k === "comision_override") continue;
    if (patch[k] !== undefined) data[k] = patch[k];
  }
  if (patch.num_factura !== undefined) {
    const v = String(patch.num_factura).trim();
    data.num_factura = v || null;
  }
  if (patch.fecha_salida !== undefined) {
    data.fecha_salida = new Date(String(patch.fecha_salida));
  }
  if (patch.comision_override === null) data.comision_override = null;
  else if (patch.comision_override !== undefined) data.comision_override = patch.comision_override;

  if (isClosed) {
    if (patch.km_final !== undefined) data.km_final = patch.km_final;
    if (patch.fecha_llegada !== undefined) {
      data.fecha_llegada = new Date(String(patch.fecha_llegada));
    }
    if (patch.km_final !== undefined || patch.km_inicial !== undefined) {
      const kmInicial = Number(patch.km_inicial ?? trip.km_inicial);
      const kmFinalRaw = patch.km_final !== undefined ? patch.km_final : trip.km_final;
      const kmFinal = Number(kmFinalRaw);
      if (kmFinalRaw == null || Number.isNaN(kmFinal) || kmFinal <= kmInicial) {
        const err = new Error("El km final debe ser mayor al inicial");
        (err as Error & { status?: number }).status = 400;
        throw err;
      }
    }
  }

  const paradasPatch = patch.paradas as ParadaInput[] | undefined;
  if (paradasPatch) {
    await assertParadasEditable(tenantId, id);
    const paradas = normalizeParadasInput({ paradas: paradasPatch });
    const { origen, destino } = deriveOrigenDestino(paradas);
    data.origen = origen;
    data.destino = destino;
  }

  if (patch.truck_id !== undefined || patch.driver_id !== undefined) {
    const truckId = String(patch.truck_id ?? trip.truck_id);
    const driverId = String(patch.driver_id ?? trip.driver_id);
    await assertNoOpenTripConflict(tenantId, {
      truck_id: truckId,
      driver_id: driverId,
      excludeTripId: id,
    });
  }

  const effectiveTruckId = String(data.truck_id ?? trip.truck_id);
  const effectiveFechaSalida =
    data.fecha_salida instanceof Date
      ? data.fecha_salida
      : data.fecha_salida != null
        ? new Date(String(data.fecha_salida))
        : trip.fecha_salida;
  const effectiveFechaLlegada = isClosed
    ? data.fecha_llegada instanceof Date
      ? data.fecha_llegada
      : data.fecha_llegada != null
        ? new Date(String(data.fecha_llegada))
        : trip.fecha_llegada
    : trip.fecha_llegada;
  const effectiveKmInicial = Number(data.km_inicial ?? trip.km_inicial);
  const effectiveKmFinal = isClosed
    ? data.km_final !== undefined
      ? Number(data.km_final)
      : trip.km_final != null
        ? Number(trip.km_final)
        : null
    : null;

  await assertTripScheduleAndOdometer(tenantId, {
    tripId: id,
    folio: trip.folio,
    truckId: effectiveTruckId,
    fecha_salida: effectiveFechaSalida,
    fecha_llegada: effectiveFechaLlegada,
    km_inicial: effectiveKmInicial,
    km_final: effectiveKmFinal,
  });

  await trip.update(data as never);

  if (paradasPatch) {
    const paradas = normalizeParadasInput({ paradas: paradasPatch });
    await saveTripStops(tenantId, id, paradas);
    await syncUbicacionesFromTripStops(tenantId, id);
  }

  const updated = await getTripOrThrow(tenantId, id, true, undefined, true);
  if (
    isClosed ||
    patch.num_factura !== undefined ||
    patch.tarifa !== undefined ||
    patch.client_id !== undefined
  ) {
    try {
      const { upsertFromTrip } = await import("./accountDocumentService");
      if (tripIsClosed(updated) || updated.num_factura) {
        await upsertFromTrip(updated);
      }
    } catch (syncErr) {
      console.warn(
        "[trip] Viaje actualizado pero falló sync de documento CXC:",
        syncErr instanceof Error ? syncErr.message : syncErr,
      );
    }
  }
  return updated;
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
    await assertNoOpenTripConflict(
      tenantId,
      { truck_id: data.truck_id, driver_id: data.driver_id },
      t,
    );
    const fechaSalida = new Date(data.fecha_salida);
    await assertTripScheduleAndOdometer(
      tenantId,
      {
        truckId: data.truck_id,
        fecha_salida: fechaSalida,
        fecha_llegada: null,
        km_inicial: data.km_inicial,
        km_final: null,
      },
      t,
    );
    const folio = await nextFolio(tenantId, data.truck_id, t);
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
        fecha_salida: fechaSalida,
        km_inicial: data.km_inicial,
        tarifa: data.tarifa,
        viaticos_entregados: data.viaticos_entregados ?? 0,
        num_factura: data.num_factura?.trim() || null,
        tipo_viaje: data.tipo_viaje ?? "local",
      } as never,
      { transaction: t },
    );
    await assignEnCursoOnCreate(tenantId, created.id, t);
    await saveTripStops(tenantId, created.id, paradas, t);
    await syncUbicacionesFromTripStops(tenantId, created.id);
    return getTripOrThrow(tenantId, created.id, true, t, true);
  });
}

export async function listTripsForReports(tenantId: string) {
  return Trip.findAll({
    where: { tenant_id: tenantId },
    include: [
      STATUSES_INCLUDE,
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
  const closedIds = await getClosedStatusIds(tenantId);
  if (closedIds.length === 0) return null;

  const where: Record<string, unknown> = {
    tenant_id: tenantId,
    truck_id: truckId,
    km_final: { [Op.ne]: null },
  };
  if (excludeTripId) where.id = { [Op.ne]: excludeTripId };

  const lastTrip = await Trip.findOne({
    where,
    include: [
      {
        ...STATUSES_INCLUDE,
        where: { id: closedIds },
        required: true,
      },
    ],
    order: [
      ["km_final", "DESC"],
      ["fecha_llegada", "DESC"],
      ["createdAt", "DESC"],
    ],
    attributes: ["km_final", "fecha_llegada", "createdAt"],
  });
  return lastTrip?.km_final ?? null;
}
