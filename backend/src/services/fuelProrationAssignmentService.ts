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
      const ticketDate = dateOnly(ticket.fecha);
      if (ticketDate < inicio || ticketDate > fin) {
        throw Object.assign(new Error("El ticket no está en el período seleccionado"), { status: 400 });
      }
    }
  }

  await sequelize.transaction(async (t) => {
    await FuelProrationAssignment.destroy({
      where: { tenant_id: tenantId, trip_id: { [Op.in]: tripIds } },
      transaction: t,
    });

    const toCreate = assignments
      .filter((a) => a.fuel_ticket_id != null)
      .map((a) => ({
        tenant_id: tenantId,
        trip_id: a.trip_id,
        fuel_ticket_id: a.fuel_ticket_id!,
      }));

    if (toCreate.length > 0) {
      await FuelProrationAssignment.bulkCreate(toCreate as never[], { transaction: t });
    }
  });
}
