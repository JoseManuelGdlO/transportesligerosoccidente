import { randomUUID } from "node:crypto";
import { Op } from "sequelize";
import {
  FuelProrationAssignment,
  FuelTicket,
  Trip,
  Truck,
  sequelize,
} from "../models";
import type { Trip as TripModel } from "../models/Trip";

function dateOnly(d: Date | string): string {
  if (typeof d === "string") return d.slice(0, 10);
  return d.toISOString().slice(0, 10);
}

function tripHasKm(trip: TripModel): boolean {
  if (trip.km_final == null) return false;
  return Math.max(0, trip.km_final - trip.km_inicial) > 0;
}

export type FuelProrationAssignmentInput = {
  trip_id: string;
  fuel_ticket_id: string | null;
};

export type DraftAssignmentPair = {
  trip_id: string;
  fuel_ticket_id: string;
};

export async function getAssignmentsForTruck(
  tenantId: string,
  truckId: string,
): Promise<DraftAssignmentPair[]> {
  const trips = await Trip.findAll({
    where: { tenant_id: tenantId, truck_id: truckId },
    attributes: ["id"],
  });
  const tripIds = trips.map((t) => String(t.id));
  if (tripIds.length === 0) return [];

  const rows = await FuelProrationAssignment.findAll({
    where: { tenant_id: tenantId, trip_id: { [Op.in]: tripIds } },
  });

  return rows.map((row) => ({
    trip_id: String(row.trip_id),
    fuel_ticket_id: String(row.fuel_ticket_id),
  }));
}

/** Asignaciones borrador (solo tickets pendientes de confirmación). */
export async function getDraftAssignmentsForTruck(
  tenantId: string,
  truckId: string,
): Promise<DraftAssignmentPair[]> {
  const pendingTickets = await FuelTicket.findAll({
    where: {
      tenant_id: tenantId,
      truck_id: truckId,
      prorrateo_confirmado_at: null,
    },
    attributes: ["id"],
  });
  const pendingTicketIds = pendingTickets.map((t) => String(t.id));
  if (pendingTicketIds.length === 0) return [];

  const trips = await Trip.findAll({
    where: { tenant_id: tenantId, truck_id: truckId },
    attributes: ["id"],
  });
  const tripIds = trips.map((t) => String(t.id));
  if (tripIds.length === 0) return [];

  const rows = await FuelProrationAssignment.findAll({
    where: {
      tenant_id: tenantId,
      trip_id: { [Op.in]: tripIds },
      fuel_ticket_id: { [Op.in]: pendingTicketIds },
    },
  });

  return rows.map((row) => ({
    trip_id: String(row.trip_id),
    fuel_ticket_id: String(row.fuel_ticket_id),
  }));
}

/** Viajes con asignación en tickets ya confirmados (para UI sin_asignar). */
export async function getConfirmedTripIdsForTruck(
  tenantId: string,
  truckId: string,
): Promise<Set<string>> {
  const confirmedTickets = await FuelTicket.findAll({
    where: {
      tenant_id: tenantId,
      truck_id: truckId,
      prorrateo_confirmado_at: { [Op.ne]: null },
    },
    attributes: ["id"],
  });
  const confirmedTicketIds = confirmedTickets.map((t) => String(t.id));
  if (confirmedTicketIds.length === 0) return new Set();

  const rows = await FuelProrationAssignment.findAll({
    where: {
      tenant_id: tenantId,
      fuel_ticket_id: { [Op.in]: confirmedTicketIds },
    },
    attributes: ["trip_id"],
  });

  return new Set(rows.map((r) => String(r.trip_id)));
}

/**
 * Reemplaza borradores de tickets *sin* source_trip_id.
 * Las asignaciones de tickets nacidos desde viaje no se tocan.
 */
export async function saveDraftAssignmentsForTruck(
  tenantId: string,
  truckId: string,
  assignments: DraftAssignmentPair[],
): Promise<void> {
  const pendingTickets = await FuelTicket.findAll({
    where: {
      tenant_id: tenantId,
      truck_id: truckId,
      prorrateo_confirmado_at: null,
      source_trip_id: null,
    },
    attributes: ["id"],
  });
  const pendingTicketIds = pendingTickets.map((t) => String(t.id));
  if (pendingTicketIds.length === 0) return;

  const filtered = assignments.filter((a) => pendingTicketIds.includes(a.fuel_ticket_id));

  await sequelize.transaction(async (t) => {
    await FuelProrationAssignment.destroy({
      where: {
        tenant_id: tenantId,
        fuel_ticket_id: { [Op.in]: pendingTicketIds },
      },
      transaction: t,
    });

    if (filtered.length > 0) {
      await FuelProrationAssignment.bulkCreate(
        filtered.map((a) => ({
          id: randomUUID(),
          tenant_id: tenantId,
          trip_id: a.trip_id,
          fuel_ticket_id: a.fuel_ticket_id,
          km_recorridos: null,
          litros_asignados: null,
          costo_asignado: null,
        })) as never[],
        { transaction: t },
      );
    }
  });
}

export async function saveTicketAssignments(
  tenantId: string,
  ticketId: string,
  tripIds: string[],
): Promise<void> {
  const ticket = await FuelTicket.findOne({
    where: { id: ticketId, tenant_id: tenantId },
  });
  if (!ticket) throw Object.assign(new Error("Ticket no encontrado"), { status: 404 });
  if (ticket.prorrateo_confirmado_at) {
    throw Object.assign(new Error("El ticket ya está confirmado"), { status: 400 });
  }

  const truckId = String(ticket.truck_id);
  let uniqueTripIds = [...new Set(tripIds)];

  if (ticket.source_trip_id) {
    const sourceId = String(ticket.source_trip_id);
    if (uniqueTripIds.length !== 1 || uniqueTripIds[0] !== sourceId) {
      throw Object.assign(
        new Error("Este ticket nació del viaje; la asignación debe ser solo ese viaje"),
        { status: 400 },
      );
    }
  }

  if (uniqueTripIds.length > 0) {
    const trips = await Trip.findAll({
      where: { tenant_id: tenantId, id: { [Op.in]: uniqueTripIds } },
    });
    if (trips.length !== uniqueTripIds.length) {
      throw Object.assign(new Error("Viaje no encontrado"), { status: 400 });
    }
    for (const trip of trips) {
      if (String(trip.truck_id) !== truckId) {
        throw Object.assign(new Error(`El viaje ${trip.folio} no pertenece a esta unidad`), { status: 400 });
      }
      if (!tripHasKm(trip)) {
        throw Object.assign(new Error(`El viaje ${trip.folio} no tiene km final registrado`), { status: 400 });
      }
    }
  }

  await sequelize.transaction(async (t) => {
    await FuelProrationAssignment.destroy({
      where: { tenant_id: tenantId, fuel_ticket_id: ticketId },
      transaction: t,
    });

    if (uniqueTripIds.length > 0) {
      await FuelProrationAssignment.bulkCreate(
        uniqueTripIds.map((tripId) => ({
          id: randomUUID(),
          tenant_id: tenantId,
          trip_id: tripId,
          fuel_ticket_id: ticketId,
          km_recorridos: null,
          litros_asignados: null,
          costo_asignado: null,
        })) as never[],
        { transaction: t },
      );
    }
  });
}

export async function saveAssignments(
  tenantId: string,
  truckId: string,
  inicio: string,
  fin: string,
  assignments: FuelProrationAssignmentInput[],
): Promise<void> {
  const truck = await Truck.findOne({ where: { id: truckId, tenant_id: tenantId } });
  if (!truck) throw Object.assign(new Error("Camión no encontrado"), { status: 404 });

  if (assignments.length === 0) return;

  const tripIds = [...new Set(assignments.map((a) => a.trip_id))];
  const ticketIdsToAssign = [
    ...new Set(assignments.map((a) => a.fuel_ticket_id).filter((id): id is string => id != null)),
  ];

  // Same trip may appear with different tickets; reject only exact duplicate pairs.
  const pairKeys = new Set<string>();
  for (const a of assignments) {
    if (a.fuel_ticket_id == null) continue;
    const key = `${a.trip_id}:${a.fuel_ticket_id}`;
    if (pairKeys.has(key)) {
      throw Object.assign(new Error("Asignaciones duplicadas para el mismo viaje y ticket"), { status: 400 });
    }
    pairKeys.add(key);
  }

  const trips = await Trip.findAll({
    where: { tenant_id: tenantId, id: { [Op.in]: tripIds } },
  });
  const tripById = new Map(trips.map((t) => [String(t.id), t]));

  for (const tripId of tripIds) {
    const trip = tripById.get(tripId);
    if (!trip) throw Object.assign(new Error(`Viaje no encontrado: ${tripId}`), { status: 400 });
    if (String(trip.truck_id) !== truckId) {
      throw Object.assign(new Error(`El viaje ${trip.folio} no pertenece a esta unidad`), { status: 400 });
    }
    if (!tripHasKm(trip)) {
      throw Object.assign(new Error(`El viaje ${trip.folio} no tiene km final registrado`), { status: 400 });
    }
  }

  if (ticketIdsToAssign.length > 0) {
    const tickets = await FuelTicket.findAll({
      where: { tenant_id: tenantId, id: { [Op.in]: ticketIdsToAssign } },
    });
    const ticketById = new Map(tickets.map((t) => [String(t.id), t]));
    for (const ticketId of ticketIdsToAssign) {
      const ticket = ticketById.get(ticketId);
      if (!ticket) throw Object.assign(new Error(`Ticket no encontrado: ${ticketId}`), { status: 400 });
      if (String(ticket.truck_id) !== truckId) {
        throw Object.assign(new Error(`El ticket no pertenece a esta unidad`), { status: 400 });
      }
      if (ticket.prorrateo_confirmado_at) {
        throw Object.assign(new Error("No se pueden modificar asignaciones de un ticket confirmado"), { status: 400 });
      }
      if (ticket.source_trip_id) {
        throw Object.assign(
          new Error("No se pueden reasignar tickets creados desde un viaje"),
          { status: 400 },
        );
      }
      const ticketDate = dateOnly(ticket.fecha);
      if (ticketDate < inicio || ticketDate > fin) {
        throw Object.assign(new Error("El ticket no está en el período seleccionado"), { status: 400 });
      }
    }
  }

  const toSave = assignments
    .filter((a) => a.fuel_ticket_id != null)
    .map((a) => ({ trip_id: a.trip_id, fuel_ticket_id: a.fuel_ticket_id! }));

  const pendingTickets = await FuelTicket.findAll({
    where: {
      tenant_id: tenantId,
      truck_id: truckId,
      prorrateo_confirmado_at: null,
      source_trip_id: null,
      fecha: { [Op.between]: [inicio, fin] },
    },
    attributes: ["id"],
  });
  const pendingTicketIds = new Set(pendingTickets.map((t) => String(t.id)));

  const filtered = toSave.filter((a) => pendingTicketIds.has(a.fuel_ticket_id));

  await sequelize.transaction(async (t) => {
    await FuelProrationAssignment.destroy({
      where: {
        tenant_id: tenantId,
        trip_id: { [Op.in]: tripIds },
        fuel_ticket_id: { [Op.in]: [...pendingTicketIds] },
      },
      transaction: t,
    });

    if (filtered.length > 0) {
      await FuelProrationAssignment.bulkCreate(
        filtered.map((a) => ({
          id: randomUUID(),
          tenant_id: tenantId,
          trip_id: a.trip_id,
          fuel_ticket_id: a.fuel_ticket_id,
          km_recorridos: null,
          litros_asignados: null,
          costo_asignado: null,
        })) as never[],
        { transaction: t },
      );
    }
  });
}
