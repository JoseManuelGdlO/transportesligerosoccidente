import { randomUUID } from "node:crypto";
import { Op, type Transaction } from "sequelize";
import { Trip, FuelLoad, Expense, Driver, sequelize } from "../models";

export async function nextFolio(t?: Transaction): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `V-${year}-`;
  const last = await Trip.findOne({
    where: { folio: { [Op.like]: `${prefix}%` } },
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

export async function getTripOrThrow(id: string, withNested = false, t?: Transaction) {
  const trip = await Trip.findByPk(id, {
    include: withNested
      ? [
          { association: "fuel" },
          { association: "expenses" },
        ]
      : undefined,
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
  id: string,
  data: { km_final: number; fecha_llegada: string; num_factura: string },
) {
  const trip = await getTripOrThrow(id, true);
  await assertTripOpen(trip);
  if (data.km_final <= trip.km_inicial) {
    const err = new Error("El km final debe ser mayor al inicial");
    (err as Error & { status?: number }).status = 400;
    throw err;
  }
  if (!data.num_factura?.trim()) {
    const err = new Error("Número de factura requerido");
    (err as Error & { status?: number }).status = 400;
    throw err;
  }
  await trip.update({
    km_final: data.km_final,
    fecha_llegada: new Date(data.fecha_llegada),
    num_factura: data.num_factura.trim(),
    estatus: "cerrado",
  });
  return getTripOrThrow(id, true);
}

export async function deleteTrip(id: string) {
  const trip = await getTripOrThrow(id, false);
  await trip.destroy();
}

export async function addFuel(
  tripId: string,
  body: { litros: number; precio_litro: number; ubicacion: string; fecha?: string },
) {
  const trip = await getTripOrThrow(tripId, false);
  await assertTripOpen(trip);
  return FuelLoad.create({
    id: randomUUID(),
    trip_id: tripId,
    litros: body.litros,
    precio_litro: body.precio_litro,
    ubicacion: body.ubicacion,
    fecha: body.fecha ? new Date(body.fecha) : new Date(),
  } as never);
}

export async function removeFuel(tripId: string, fuelId: string) {
  const trip = await getTripOrThrow(tripId, false);
  await assertTripOpen(trip);
  const f = await FuelLoad.findOne({ where: { id: fuelId, trip_id: tripId } });
  if (!f) {
    const err = new Error("Carga no encontrada");
    (err as Error & { status?: number }).status = 404;
    throw err;
  }
  await f.destroy();
}

export async function addExpense(
  tripId: string,
  body: {
    categoria: "casetas" | "refacciones" | "hospedaje" | "comidas" | "otros";
    descripcion: string;
    monto: number;
    comprobado: boolean;
    fecha?: string;
  },
) {
  const trip = await getTripOrThrow(tripId, false);
  await assertTripOpen(trip);
  return Expense.create({
    id: randomUUID(),
    trip_id: tripId,
    categoria: body.categoria,
    descripcion: body.descripcion,
    monto: body.monto,
    comprobado: body.comprobado,
    fecha: body.fecha ? new Date(body.fecha) : new Date(),
  } as never);
}

export async function removeExpense(tripId: string, expenseId: string) {
  const trip = await getTripOrThrow(tripId, false);
  await assertTripOpen(trip);
  const e = await Expense.findOne({ where: { id: expenseId, trip_id: tripId } });
  if (!e) {
    const err = new Error("Gasto no encontrado");
    (err as Error & { status?: number }).status = 404;
    throw err;
  }
  await e.destroy();
}

export async function patchTrip(id: string, patch: Partial<Record<string, unknown>>) {
  const trip = await getTripOrThrow(id, false);
  await assertTripOpen(trip);
  const allowed = [
    "truck_id",
    "driver_id",
    "client_id",
    "origen",
    "destino",
    "km_inicial",
    "tarifa",
    "viaticos_entregados",
    "comision_override",
  ] as const;
  const data: Record<string, unknown> = {};
  for (const k of allowed) {
    if (patch[k] !== undefined) data[k] = patch[k];
  }
  if (patch.fecha_salida !== undefined) data.fecha_salida = new Date(String(patch.fecha_salida));
  await trip.update(data as never);
  return getTripOrThrow(id, true);
}

export async function createTrip(data: {
  truck_id: string;
  driver_id: string;
  client_id: string;
  origen: string;
  destino: string;
  fecha_salida: string | Date;
  km_inicial: number;
  tarifa: number;
  viaticos_entregados?: number;
}) {
  return sequelize.transaction(async (t) => {
    const folio = await nextFolio(t);
    const created = await Trip.create(
      {
        id: randomUUID(),
        folio,
        truck_id: data.truck_id,
        driver_id: data.driver_id,
        client_id: data.client_id,
        origen: data.origen,
        destino: data.destino,
        fecha_salida: new Date(data.fecha_salida),
        km_inicial: data.km_inicial,
        tarifa: data.tarifa,
        viaticos_entregados: data.viaticos_entregados ?? 0,
        estatus: "en_curso",
      } as never,
      { transaction: t },
    );
    return getTripOrThrow(created.id, true, t);
  });
}

export async function listTripsForReports() {
  return Trip.findAll({
    include: [
      { association: "fuel" },
      { association: "expenses" },
      { model: Driver, attributes: ["id", "comision_tipo", "comision_valor"] },
    ],
  });
}
