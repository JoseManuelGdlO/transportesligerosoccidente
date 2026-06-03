import { randomUUID } from "node:crypto";
import { Op, type Transaction } from "sequelize";
import { Trip, TripStatus, TripStatusAssignment, Truck, Driver, sequelize } from "../models";
import type { Trip as TripModel } from "../models/Trip";
import { logger } from "../utils/logger";

export type OpenTripResourceField = "truck_id" | "driver_id";

export type SystemStatusSlug = "en_curso" | "cerrado";

export const STATUSES_INCLUDE = {
  association: "statuses" as const,
  through: { attributes: [] },
};

export function tripHasStatusSlug(trip: TripModel, slug: SystemStatusSlug): boolean {
  const statuses = (trip as TripModel & { statuses?: TripStatus[] }).statuses ?? [];
  return statuses.some((s) => s.slug === slug);
}

export function tripIsClosed(trip: TripModel): boolean {
  return tripHasStatusSlug(trip, "cerrado");
}

export async function getSystemStatus(
  tenantId: string,
  slug: SystemStatusSlug,
  t?: Transaction,
): Promise<TripStatus> {
  const row = await TripStatus.findOne({
    where: { tenant_id: tenantId, slug, is_system: true },
    transaction: t,
  });
  if (!row) {
    const err = new Error(`Estado de sistema "${slug}" no encontrado`);
    (err as Error & { status?: number }).status = 500;
    throw err;
  }
  return row;
}

export async function assignEnCursoOnCreate(
  tenantId: string,
  tripId: string,
  t?: Transaction,
): Promise<void> {
  const enCurso = await getSystemStatus(tenantId, "en_curso", t);
  await TripStatusAssignment.create(
    { trip_id: tripId, trip_status_id: enCurso.id } as never,
    { transaction: t },
  );
}

export async function swapSystemStatus(
  tenantId: string,
  tripId: string,
  fromSlug: SystemStatusSlug,
  toSlug: SystemStatusSlug,
  t?: Transaction,
): Promise<void> {
  const [fromStatus, toStatus] = await Promise.all([
    getSystemStatus(tenantId, fromSlug, t),
    getSystemStatus(tenantId, toSlug, t),
  ]);
  await TripStatusAssignment.destroy({
    where: { trip_id: tripId, trip_status_id: fromStatus.id },
    transaction: t,
  });
  const existing = await TripStatusAssignment.findOne({
    where: { trip_id: tripId, trip_status_id: toStatus.id },
    transaction: t,
  });
  if (!existing) {
    await TripStatusAssignment.create(
      { trip_id: tripId, trip_status_id: toStatus.id } as never,
      { transaction: t },
    );
  }
}

export async function setTripCustomStatuses(
  tenantId: string,
  tripId: string,
  customStatusIds: string[],
): Promise<TripModel> {
  const trip = await Trip.findOne({
    where: { id: tripId, tenant_id: tenantId },
    include: [STATUSES_INCLUDE],
  });
  if (!trip) {
    const err = new Error("Viaje no encontrado");
    (err as Error & { status?: number }).status = 404;
    throw err;
  }

  const uniqueIds = [...new Set(customStatusIds)];
  if (uniqueIds.length > 0) {
    const rows = await TripStatus.findAll({
      where: { tenant_id: tenantId, id: uniqueIds, is_system: false, activo: true },
    });
    if (rows.length !== uniqueIds.length) {
      const err = new Error("Uno o más estados no son válidos");
      (err as Error & { status?: number }).status = 400;
      throw err;
    }
  }

  const systemIds = (
    await TripStatus.findAll({
      where: { tenant_id: tenantId, is_system: true },
      attributes: ["id"],
    })
  ).map((s) => s.id);

  await sequelize.transaction(async (t) => {
    await TripStatusAssignment.destroy({
      where: {
        trip_id: tripId,
        trip_status_id: { [Op.notIn]: systemIds },
      },
      transaction: t,
    });

    for (const statusId of uniqueIds) {
      await TripStatusAssignment.create(
        { trip_id: tripId, trip_status_id: statusId } as never,
        { transaction: t },
      );
    }
  });

  const updated = await Trip.findOne({
    where: { id: tripId, tenant_id: tenantId },
    include: [STATUSES_INCLUDE],
  });
  return updated!;
}

export async function listTripStatuses(tenantId: string): Promise<TripStatus[]> {
  return TripStatus.findAll({
    where: { tenant_id: tenantId },
    order: [
      ["is_system", "DESC"],
      ["nombre", "ASC"],
    ],
  });
}

export async function createTripStatus(
  tenantId: string,
  data: { nombre: string; color?: string; activo?: boolean },
): Promise<TripStatus> {
  return TripStatus.create({
    id: randomUUID(),
    tenant_id: tenantId,
    nombre: data.nombre.trim(),
    color: data.color ?? "#6366f1",
    slug: null,
    is_system: false,
    activo: data.activo ?? true,
  } as never);
}

export async function updateTripStatus(
  tenantId: string,
  id: string,
  data: { nombre?: string; color?: string; activo?: boolean },
): Promise<TripStatus> {
  const row = await TripStatus.findOne({ where: { id, tenant_id: tenantId } });
  if (!row) {
    const err = new Error("Estado no encontrado");
    (err as Error & { status?: number }).status = 404;
    throw err;
  }
  const patch: Record<string, unknown> = {};
  if (data.nombre !== undefined) patch.nombre = data.nombre.trim();
  if (data.color !== undefined) patch.color = data.color;
  if (data.activo !== undefined) patch.activo = data.activo;
  await row.update(patch as never);
  return row;
}

export async function deleteTripStatus(tenantId: string, id: string): Promise<void> {
  const row = await TripStatus.findOne({ where: { id, tenant_id: tenantId } });
  if (!row) {
    const err = new Error("Estado no encontrado");
    (err as Error & { status?: number }).status = 404;
    throw err;
  }
  if (row.is_system) {
    const err = new Error("No se puede eliminar un estado de sistema");
    (err as Error & { status?: number }).status = 400;
    throw err;
  }
  const n = await TripStatusAssignment.count({ where: { trip_status_id: id } });
  if (n > 0) {
    const err = new Error("No se puede eliminar: hay viajes con este estado asignado");
    (err as Error & { status?: number }).status = 400;
    throw err;
  }
  await row.destroy();
}

export async function getClosedStatusIds(tenantId: string): Promise<string[]> {
  const rows = await TripStatus.findAll({
    where: { tenant_id: tenantId, slug: "cerrado", is_system: true },
    attributes: ["id"],
  });
  return rows.map((r) => r.id);
}

export async function findOpenTripByResource(
  tenantId: string,
  field: OpenTripResourceField,
  resourceId: string,
  excludeTripId?: string,
  t?: Transaction,
): Promise<TripModel | null> {
  const where: Record<string, unknown> = {
    tenant_id: tenantId,
    [field]: resourceId,
  };
  if (excludeTripId) {
    where.id = { [Op.ne]: excludeTripId };
  }
  return Trip.findOne({
    where,
    include: [
      {
        ...STATUSES_INCLUDE,
        where: { slug: "en_curso" },
        required: true,
      },
    ],
    transaction: t,
  });
}

export async function assertNoOpenTripConflict(
  tenantId: string,
  opts: { truck_id: string; driver_id: string; excludeTripId?: string },
  t?: Transaction,
): Promise<void> {
  const truckConflict = await findOpenTripByResource(
    tenantId,
    "truck_id",
    opts.truck_id,
    opts.excludeTripId,
    t,
  );
  if (truckConflict) {
    logger.warn(
      JSON.stringify({
        event: "trip_open_conflict",
        tenant_id: tenantId,
        resource: "truck_id",
        resource_id: opts.truck_id,
        conflicting_trip_id: truckConflict.id,
        conflicting_folio: truckConflict.folio,
        exclude_trip_id: opts.excludeTripId ?? null,
      }),
    );
    const truck = await Truck.findOne({
      where: { id: opts.truck_id, tenant_id: tenantId },
      attributes: ["numero_economico"],
      transaction: t,
    });
    const eco = truck?.numero_economico?.trim() || opts.truck_id;
    const err = new Error(`La unidad ${eco} ya tiene el viaje ${truckConflict.folio} en curso`);
    (err as Error & { status?: number }).status = 409;
    throw err;
  }

  const driverConflict = await findOpenTripByResource(
    tenantId,
    "driver_id",
    opts.driver_id,
    opts.excludeTripId,
    t,
  );
  if (driverConflict) {
    logger.warn(
      JSON.stringify({
        event: "trip_open_conflict",
        tenant_id: tenantId,
        resource: "driver_id",
        resource_id: opts.driver_id,
        conflicting_trip_id: driverConflict.id,
        conflicting_folio: driverConflict.folio,
        exclude_trip_id: opts.excludeTripId ?? null,
      }),
    );
    const driver = await Driver.findOne({
      where: { id: opts.driver_id, tenant_id: tenantId },
      attributes: ["nombre"],
      transaction: t,
    });
    const nombre = driver?.nombre?.trim() || opts.driver_id;
    const err = new Error(`El operador ${nombre} ya tiene el viaje ${driverConflict.folio} en curso`);
    (err as Error & { status?: number }).status = 409;
    throw err;
  }
}
