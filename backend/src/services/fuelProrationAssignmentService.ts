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

export async function getAssignmentsForTruck(
  tenantId: string,
  truckId: string,
): Promise<Map<string, string>> {
  const trips = await Trip.findAll({
    where: { tenant_id: tenantId, truck_id: truckId },
    attributes: ["id"],
  });
  const tripIds = trips.map((t) => String(t.id));
  if (tripIds.length === 0) return new Map();

  const rows = await FuelProrationAssignment.findAll({
    where: { tenant_id: tenantId, trip_id: { [Op.in]: tripIds } },
  });

  const map = new Map<string, string>();
  for (const row of rows) {
    map.set(String(row.trip_id), String(row.fuel_ticket_id));
  }
  return map;
}

/** Asignaciones borrador (solo tickets pendientes de confirmación). */
export async function getDraftAssignmentsForTruck(
  tenantId: string,
  truckId: string,
): Promise<Map<string, string>> {
  const pendingTickets = await FuelTicket.findAll({
    where: {
      tenant_id: tenantId,
      truck_id: truckId,
      prorrateo_confirmado_at: null,
    },
    attributes: ["id"],
  });
  const pendingTicketIds = pendingTickets.map((t) => String(t.id));
  if (pendingTicketIds.length === 0) return new Map();

  const trips = await Trip.findAll({
    where: { tenant_id: tenantId, truck_id: truckId },
    attributes: ["id"],
  });
  const tripIds = trips.map((t) => String(t.id));
  if (tripIds.length === 0) return new Map();

  const rows = await FuelProrationAssignment.findAll({
    where: {
      tenant_id: tenantId,
      trip_id: { [Op.in]: tripIds },
      fuel_ticket_id: { [Op.in]: pendingTicketIds },
    },
  });

  const map = new Map<string, string>();
  for (const row of rows) {
    map.set(String(row.trip_id), String(row.fuel_ticket_id));
  }
  return map;
}

/** Viajes bloqueados por tickets ya confirmados. */
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

export async function saveDraftAssignmentsForTruck(
  tenantId: string,
  truckId: string,
  assignments: { trip_id: string; fuel_ticket_id: string }[],
): Promise<void> {
  const pendingTickets = await FuelTicket.findAll({
    where: {
      tenant_id: tenantId,
      truck_id: truckId,
      prorrateo_confirmado_at: null,
    },
    attributes: ["id"],
  });
  const pendingTicketIds = pendingTickets.map((t) => String(t.id));
  if (pendingTicketIds.length === 0) return;

  const tripIds = [...new Set(assignments.map((a) => a.trip_id))];

  await sequelize.transaction(async (t) => {
    await FuelProrationAssignment.destroy({
      where: {
        tenant_id: tenantId,
        fuel_ticket_id: { [Op.in]: pendingTicketIds },
      },
      transaction: t,
    });

    if (tripIds.length > 0) {
      await FuelProrationAssignment.destroy({
        where: {
          tenant_id: tenantId,
          trip_id: { [Op.in]: tripIds },
          fuel_ticket_id: { [Op.in]: pendingTicketIds },
        },
        transaction: t,
      });
    }

    if (assignments.length > 0) {
      await FuelProrationAssignment.bulkCreate(
        assignments.map((a) => ({
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
  const uniqueTripIds = [...new Set(tripIds)];

  const confirmedTripIds = await getConfirmedTripIdsForTruck(tenantId, truckId);
  for (const tripId of uniqueTripIds) {
    if (confirmedTripIds.has(tripId)) {
      throw Object.assign(new Error("Uno o más viajes ya están en un ticket confirmado"), { status: 400 });
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
          tenant_id: tenantId,
          trip_id: tripId,
          fuel_ticket_id: ticketId,
          km_recorridos: null,
          litros_asignados: null,
          costo_asignado: null,
        })) as never[],
        {
          transaction: t,
          updateOnDuplicate: ["fuel_ticket_id", "km_recorridos", "litros_asignados", "costo_asignado"],
        },
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
  if (tripIds.length !== assignments.length) {
    throw Object.assign(new Error("Asignaciones duplicadas para el mismo viaje"), { status: 400 });
  }
  const ticketIdsToAssign = [
    ...new Set(assignments.map((a) => a.fuel_ticket_id).filter((id): id is string => id != null)),
  ];

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
      fecha: { [Op.between]: [inicio, fin] },
    },
    attributes: ["id"],
  });
  const pendingTicketIds = new Set(pendingTickets.map((t) => String(t.id)));

  const filtered = toSave.filter((a) => pendingTicketIds.has(a.fuel_ticket_id));

  await sequelize.transaction(async (t) => {
    await FuelProrationAssignment.destroy({
      where: { tenant_id: tenantId, trip_id: { [Op.in]: tripIds } },
      transaction: t,
    });

    if (filtered.length > 0) {
      await FuelProrationAssignment.bulkCreate(
        filtered.map((a) => ({
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
