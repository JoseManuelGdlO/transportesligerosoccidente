import { randomUUID } from "node:crypto";
import { Op, type Transaction } from "sequelize";
import { sequelize } from "../config/database";
import { Truck, TruckOdometerReset, Trip } from "../models";
import type { OdometerResetPeer } from "./odometerEpoch";
import {
  findOpenTripByResource,
  getClosedStatusIds,
  STATUSES_INCLUDE,
  tripHasStatusSlug,
  tripIsClosed,
} from "./tripStatusService";

function httpError(message: string, status: number): Error & { status: number } {
  const err = new Error(message) as Error & { status: number };
  err.status = status;
  return err;
}

export async function loadTruckOdometerResets(
  tenantId: string,
  truckId: string,
  t?: Transaction,
): Promise<OdometerResetPeer[]> {
  const rows = await TruckOdometerReset.findAll({
    where: { tenant_id: tenantId, truck_id: truckId },
    attributes: ["id", "effective_at", "old_km", "new_km", "motivo"],
    order: [["effective_at", "ASC"]],
    transaction: t,
  });
  return rows.map((r) => ({
    id: r.id,
    effective_at: r.effective_at,
    old_km: r.old_km,
    new_km: r.new_km,
    motivo: r.motivo,
  }));
}

export type ClosedTripForLastKm = {
  km_inicial: number;
  km_final: number;
  fecha_salida: Date;
  fecha_llegada: Date | null;
};

function compareClosedTripOrder(a: ClosedTripForLastKm, b: ClosedTripForLastKm): number {
  const ta = a.fecha_salida.getTime();
  const tb = b.fecha_salida.getTime();
  if (ta !== tb) return ta - tb;
  const ca = (a.fecha_llegada ?? a.fecha_salida).getTime();
  const cb = (b.fecha_llegada ?? b.fecha_salida).getTime();
  return ca - cb;
}

/**
 * Km sugerido para un viaje nuevo.
 * Sin reinicio: el mayor km_final (criterio histórico).
 * Con reinicio: el km_final del último viaje cerrado de la época nueva.
 * Si esa época aún no tiene viajes cerrados, el km del reinicio.
 */
export function resolveLastKmForTruck(args: {
  resets: OdometerResetPeer[];
  closedTrips: ClosedTripForLastKm[];
}): number | null {
  if (args.resets.length === 0) {
    if (args.closedTrips.length === 0) return null;
    return Math.max(...args.closedTrips.map((t) => t.km_final));
  }

  const latest = [...args.resets].sort(
    (a, b) => a.effective_at.getTime() - b.effective_at.getTime(),
  ).at(-1)!;
  const postReset = args.closedTrips
    .filter((t) => t.fecha_salida.getTime() >= latest.effective_at.getTime())
    .sort(compareClosedTripOrder);
  if (postReset.length === 0) return latest.new_km;
  return postReset[postReset.length - 1]!.km_final;
}

export async function listOdometerResets(tenantId: string, truckId: string) {
  return TruckOdometerReset.findAll({
    where: { tenant_id: tenantId, truck_id: truckId },
    order: [["effective_at", "DESC"]],
  });
}

export type AffectedTrip = {
  id: string;
  folio: string;
  origen: string;
  destino: string;
  fecha_salida: string;
  fecha_llegada: string | null;
  km_inicial: number;
  km_final: number | null;
  cerrado: boolean;
};

export type OdometerResetPreview = {
  blocked_reason: string | null;
  affected: AffectedTrip[];
};

function compareTripRows(
  a: { fecha_salida: Date; folio: string },
  b: { fecha_salida: Date; folio: string },
): number {
  const ta = a.fecha_salida.getTime();
  const tb = b.fecha_salida.getTime();
  if (ta !== tb) return ta < tb ? -1 : 1;
  return a.folio.localeCompare(b.folio);
}

type TripRow = {
  id: string;
  folio: string;
  origen: string;
  destino: string;
  fecha_salida: Date;
  fecha_llegada: Date | null;
  km_inicial: number;
  km_final: number | null;
  cerrado: boolean;
  enCurso: boolean;
};

async function loadTruckTrips(tenantId: string, truckId: string, t?: Transaction): Promise<TripRow[]> {
  const rows = await Trip.findAll({
    where: { tenant_id: tenantId, truck_id: truckId },
    include: [STATUSES_INCLUDE],
    attributes: ["id", "folio", "origen", "destino", "fecha_salida", "fecha_llegada", "km_inicial", "km_final"],
    transaction: t,
  });
  return rows.map((row) => ({
    id: row.id,
    folio: row.folio,
    origen: row.origen,
    destino: row.destino,
    fecha_salida: row.fecha_salida,
    fecha_llegada: row.fecha_llegada,
    km_inicial: Number(row.km_inicial),
    km_final: row.km_final != null ? Number(row.km_final) : null,
    cerrado: tripIsClosed(row),
    enCurso: tripHasStatusSlug(row, "en_curso"),
  }));
}

function toAffected(row: TripRow): AffectedTrip {
  return {
    id: row.id,
    folio: row.folio,
    origen: row.origen,
    destino: row.destino,
    fecha_salida: row.fecha_salida.toISOString(),
    fecha_llegada: row.fecha_llegada ? row.fecha_llegada.toISOString() : null,
    km_inicial: row.km_inicial,
    km_final: row.km_final,
    cerrado: row.cerrado,
  };
}

export function previewFromTrips(trips: TripRow[], effectiveAt: Date): OdometerResetPreview {
  const openBefore = trips.find((t) => t.enCurso && t.fecha_salida.getTime() < effectiveAt.getTime());
  if (openBefore) {
    return {
      blocked_reason: `Hay un viaje en curso (${openBefore.folio}) que salió antes de esta fecha. Ciérralo antes de reiniciar el kilometraje.`,
      affected: [],
    };
  }

  const affected = trips
    .filter((t) => (t.cerrado || t.enCurso) && t.fecha_salida.getTime() >= effectiveAt.getTime())
    .sort(compareTripRows);

  const broken = affected.find((t) => t.cerrado && t.km_final == null);
  if (broken) {
    return {
      blocked_reason: `El viaje ${broken.folio} está cerrado y no tiene kilometraje final.`,
      affected: [],
    };
  }

  return { blocked_reason: null, affected: affected.map(toAffected) };
}

export async function previewOdometerReset(
  tenantId: string,
  truckId: string,
  effectiveAt: Date,
): Promise<OdometerResetPreview> {
  const truck = await Truck.findOne({ where: { id: truckId, tenant_id: tenantId } });
  if (!truck) throw httpError("Camión no encontrado", 404);
  const trips = await loadTruckTrips(tenantId, truckId);
  return previewFromTrips(trips, effectiveAt);
}

export type OdometerAdjustment = {
  trip_id: string;
  km_inicial: number;
  km_final: number | null;
};

function assertIntegerKm(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw httpError(`${label} debe ser un entero mayor o igual a 0`, 400);
  }
}

/** La cadena del asistente: el km final de un viaje es el km inicial del siguiente. */
export function assertAdjustmentChain(
  affected: AffectedTrip[],
  adjustments: OdometerAdjustment[],
  newKm: number,
): void {
  if (adjustments.length !== affected.length) {
    throw httpError("La lista de viajes no coincide con los afectados por la fecha", 400);
  }
  for (let i = 0; i < affected.length; i++) {
    const trip = affected[i]!;
    const adj = adjustments[i]!;
    if (adj.trip_id !== trip.id) {
      throw httpError("La lista de viajes no coincide con los afectados por la fecha", 400);
    }
    assertIntegerKm(adj.km_inicial, `El km inicial de ${trip.folio}`);
    if (i === 0 && adj.km_inicial !== newKm) {
      throw httpError("El km inicial del primer viaje debe ser el kilometraje nuevo", 400);
    }
    if (i > 0) {
      const prev = adjustments[i - 1]!;
      const prevTrip = affected[i - 1]!;
      if (!prevTrip.cerrado || prev.km_final == null) {
        throw httpError(`El viaje ${prevTrip.folio} debe estar cerrado para continuar la cadena`, 400);
      }
      if (adj.km_inicial !== prev.km_final) {
        throw httpError(
          `El km inicial de ${trip.folio} debe ser ${prev.km_final} (km final de ${prevTrip.folio})`,
          400,
        );
      }
    }
    if (trip.cerrado) {
      if (adj.km_final == null) {
        throw httpError(`Indica el km final de ${trip.folio}`, 400);
      }
      assertIntegerKm(adj.km_final, `El km final de ${trip.folio}`);
      if (adj.km_final <= adj.km_inicial) {
        throw httpError(`El km final de ${trip.folio} debe ser mayor al inicial`, 400);
      }
    } else if (adj.km_final != null) {
      throw httpError(`El viaje ${trip.folio} sigue en curso: solo se ajusta su km inicial`, 400);
    }
  }
}

export type CreateOdometerResetInput = {
  effective_at: Date;
  new_km: number;
  motivo: string;
  created_by_user_id?: string | null;
  adjustments: OdometerAdjustment[];
};

async function computeOldKmBeforeReset(trips: TripRow[], effectiveAt: Date): Promise<number> {
  const prior = trips
    .filter((t) => t.cerrado && t.km_final != null && t.fecha_salida.getTime() < effectiveAt.getTime())
    .sort(compareTripRows);
  return prior.at(-1)?.km_final ?? 0;
}

export async function createOdometerReset(
  tenantId: string,
  truckId: string,
  input: CreateOdometerResetInput,
): Promise<TruckOdometerReset> {
  const truck = await Truck.findOne({ where: { id: truckId, tenant_id: tenantId } });
  if (!truck) throw httpError("Camión no encontrado", 404);
  if (truck.estatus === "baja") {
    throw httpError("No se puede registrar un reinicio en una unidad dada de baja", 400);
  }

  const newKm = Number(input.new_km);
  assertIntegerKm(newKm, "El kilometraje nuevo");
  const motivo = String(input.motivo ?? "").trim();
  if (motivo.length < 3) {
    throw httpError("El motivo debe tener al menos 3 caracteres", 400);
  }

  const effectiveAt = input.effective_at instanceof Date ? input.effective_at : new Date(input.effective_at);
  if (Number.isNaN(effectiveAt.getTime())) {
    throw httpError("La fecha de vigencia no es válida", 400);
  }

  const windowMs = 60_000;
  const nearDuplicate = await TruckOdometerReset.findOne({
    where: {
      tenant_id: tenantId,
      truck_id: truckId,
      effective_at: {
        [Op.between]: [
          new Date(effectiveAt.getTime() - windowMs),
          new Date(effectiveAt.getTime() + windowMs),
        ],
      },
    },
  });
  if (nearDuplicate) {
    throw httpError("Ya existe un reinicio en esa fecha (o a menos de un minuto)", 400);
  }

  const openTrip = await findOpenTripByResource(tenantId, "truck_id", truckId);
  if (openTrip && openTrip.fecha_salida.getTime() < effectiveAt.getTime()) {
    throw httpError(
      `Hay un viaje en curso (${openTrip.folio}) que salió antes de esta fecha. Ciérralo antes de reiniciar el kilometraje.`,
      400,
    );
  }

  const trips = await loadTruckTrips(tenantId, truckId);
  const preview = previewFromTrips(trips, effectiveAt);
  if (preview.blocked_reason) throw httpError(preview.blocked_reason, 400);
  assertAdjustmentChain(preview.affected, input.adjustments, newKm);

  const oldKm = await computeOldKmBeforeReset(trips, effectiveAt);

  return sequelize.transaction(async (t) => {
    for (const adj of input.adjustments) {
      const patch: Record<string, unknown> = { km_inicial: adj.km_inicial };
      if (adj.km_final != null) patch.km_final = adj.km_final;
      const [affected] = await Trip.update(patch, {
        where: { id: adj.trip_id, tenant_id: tenantId, truck_id: truckId },
        transaction: t,
      });
      if (affected !== 1) {
        throw httpError("No se pudo actualizar el kilometraje de un viaje afectado", 400);
      }
    }

    return TruckOdometerReset.create(
      {
        id: randomUUID(),
        tenant_id: tenantId,
        truck_id: truckId,
        effective_at: effectiveAt,
        old_km: oldKm,
        new_km: newKm,
        motivo,
        created_by_user_id: input.created_by_user_id ?? null,
      } as never,
      { transaction: t },
    );
  });
}

export async function deleteOdometerReset(tenantId: string, resetId: string): Promise<void> {
  const reset = await TruckOdometerReset.findOne({
    where: { id: resetId, tenant_id: tenantId },
  });
  if (!reset) throw httpError("Reinicio no encontrado", 404);

  const tripAfter = await Trip.findOne({
    where: {
      tenant_id: tenantId,
      truck_id: reset.truck_id,
      fecha_salida: { [Op.gte]: reset.effective_at },
    },
    attributes: ["id"],
  });
  if (tripAfter) {
    throw httpError(
      "No se puede eliminar el reinicio porque existen viajes con salida en o después de su fecha",
      400,
    );
  }

  await reset.destroy();
}

export async function getClosedTripsForLastKm(tenantId: string, truckId: string, excludeTripId?: string) {
  const closedIds = await getClosedStatusIds(tenantId);
  if (closedIds.length === 0) return [];
  const where: Record<string, unknown> = {
    tenant_id: tenantId,
    truck_id: truckId,
    km_final: { [Op.ne]: null },
  };
  if (excludeTripId) where.id = { [Op.ne]: excludeTripId };
  const rows = await Trip.findAll({
    where,
    include: [
      {
        ...STATUSES_INCLUDE,
        where: { id: closedIds },
        required: true,
      },
    ],
    attributes: ["km_inicial", "km_final", "fecha_salida", "fecha_llegada"],
  });
  return rows.map((t) => ({
    km_inicial: Number(t.km_inicial),
    km_final: t.km_final as number,
    fecha_salida: t.fecha_salida,
    fecha_llegada: t.fecha_llegada,
  }));
}
