import type { FuelTicket as FuelTicketModel } from "../models/FuelTicket";
import type { Trip as TripModel } from "../models/Trip";
import {
  saveDraftAssignmentsForTruck,
  saveTicketAssignments,
} from "./fuelProrationAssignmentService";
import {
  buildTankBlocks,
  confirmTicketProration,
  reopenTicketProration,
} from "./fuelProrationService";

export const tankReapplyOps = {
  reopenTicketProration,
  saveTicketAssignments,
  confirmTicketProration,
  saveDraftAssignmentsForTruck,
};

export type TankReapplyLine = {
  truck_id: string;
  numero_economico: string;
  ticket_id: string;
  fecha: string;
  es_foraneo: boolean;
  confirmed: boolean;
  skip_reason: string | null;
  viajes: { trip_id: string; folio: string; litros_asignados: number; costo_asignado: number }[];
};

export function planTankReapply(
  truck: { id: string; numero_economico: string },
  tickets: FuelTicketModel[],
  trips: TripModel[],
): TankReapplyLine[] {
  const ticketById = new Map(tickets.map((ticket) => [String(ticket.id), ticket]));
  return buildTankBlocks(tickets, trips).map((block) => {
    const ticket = ticketById.get(block.ticket_id);
    const viajes = block.viajes.map((viaje) => ({
      trip_id: viaje.trip_id,
      folio: viaje.folio,
      litros_asignados: viaje.litros_asignados,
      costo_asignado: viaje.costo_asignado,
    }));
    return {
      truck_id: truck.id,
      numero_economico: truck.numero_economico,
      ticket_id: block.ticket_id,
      fecha: block.fecha,
      es_foraneo: !!block.es_foraneo,
      confirmed: ticket?.prorrateo_confirmado_at != null,
      skip_reason: viajes.length === 0 ? "sin viajes con km" : null,
      viajes,
    };
  });
}

export async function applyTankReapply(
  tenantId: string,
  lines: TankReapplyLine[],
): Promise<{ applied: number; skipped: number }> {
  const byTruck = new Map<string, TankReapplyLine[]>();
  for (const line of lines) {
    const group = byTruck.get(line.truck_id) ?? [];
    group.push(line);
    byTruck.set(line.truck_id, group);
  }

  let applied = 0;
  let skipped = 0;

  for (const [truckId, truckLines] of byTruck) {
    for (const line of truckLines) {
      if (!line.confirmed) continue;
      if (line.skip_reason) {
        skipped += 1;
        continue;
      }
      try {
        await tankReapplyOps.reopenTicketProration(tenantId, line.ticket_id);
        await tankReapplyOps.saveTicketAssignments(
          tenantId,
          line.ticket_id,
          line.viajes.map((viaje) => viaje.trip_id),
        );
        await tankReapplyOps.confirmTicketProration(tenantId, line.ticket_id);
        applied += 1;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(`ticket ${line.ticket_id}: ${message}`);
      }
    }

    const pending = truckLines.filter((line) => !line.confirmed && !line.skip_reason);
    if (pending.length === 0) continue;
    await tankReapplyOps.saveDraftAssignmentsForTruck(
      tenantId,
      truckId,
      pending.flatMap((line) =>
        line.viajes.map((viaje) => ({ trip_id: viaje.trip_id, fuel_ticket_id: line.ticket_id })),
      ),
    );
    applied += pending.length;
  }

  return { applied, skipped };
}
