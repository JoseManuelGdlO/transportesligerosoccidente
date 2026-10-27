import type { Transaction } from "sequelize";
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
  sumLitersForPeriod,
  tripKmRecorridos,
  type ProratedTicketBlock,
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

export type TankMetricSnapshot = {
  truck_id: string;
  numero_economico: string;
  viajes: number;
  km: number;
  litros_antes: number;
  litros_despues: number;
  rendimiento_esperado: number;
  rendimiento_antes: number | null;
  rendimiento_despues: number | null;
};

export type TankMetricReportRow = {
  unidad: string;
  viajes: number;
  km: number;
  litros_antes: number;
  litros_despues: number;
  rendimiento_antes: string;
  rendimiento_despues: string;
  estado_antes: string;
  estado_despues: string;
};

/** Texto del reporte de combustible: `Rendimiento 4.50 km/L / 3.0 esp.` */
export function formatRendimientoLabel(rend: number | null, esperado: number): string {
  const esp = esperado > 0 ? esperado.toFixed(1) : null;
  if (rend == null) return esp ? `Rendimiento — / ${esp} esp.` : "Rendimiento —";
  if (!esp) return `Rendimiento ${rend.toFixed(2)} km/L`;
  return `Rendimiento ${rend.toFixed(2)} km/L / ${esp} esp.`;
}

export function fuelRendimientoEstado(rend: number | null, esperado: number): string {
  if (rend == null || esperado <= 0) return "—";
  if (rend < esperado * 0.9) return "Bajo rendimiento";
  if (rend > esperado * 1.5) return "Faltan litros";
  return "OK";
}

export function tankMetricReportRows(metrics: TankMetricSnapshot[]): TankMetricReportRow[] {
  return metrics.map((row) => ({
    unidad: row.numero_economico,
    viajes: row.viajes,
    km: row.km,
    litros_antes: row.litros_antes,
    litros_despues: row.litros_despues,
    rendimiento_antes: formatRendimientoLabel(row.rendimiento_antes, row.rendimiento_esperado),
    rendimiento_despues: formatRendimientoLabel(row.rendimiento_despues, row.rendimiento_esperado),
    estado_antes: fuelRendimientoEstado(row.rendimiento_antes, row.rendimiento_esperado),
    estado_despues: fuelRendimientoEstado(row.rendimiento_despues, row.rendimiento_esperado),
  }));
}

function rendimiento(km: number, litros: number): number | null {
  return litros > 0 && km > 0 ? Math.round((km / litros) * 100) / 100 : null;
}

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

/** Km/L actual vs regla de tanque, sin escribir. Misma fórmula que el reporte de combustible. */
export function compareTankReapplyMetrics(input: {
  truck: { id: string; numero_economico: string; rendimiento_esperado?: number };
  trips: TripModel[];
  lines: TankReapplyLine[];
  confirmedLitros: { trip_id: string; litros: number }[];
  pendingBlocks: ProratedTicketBlock[];
  orphanLoads: { trip_id: string; litros: number }[];
}): TankMetricSnapshot {
  const periodTripIds = new Set(input.trips.map((trip) => String(trip.id)));
  const km = input.trips.reduce((sum, trip) => sum + tripKmRecorridos(trip), 0);
  const litrosAntes = sumLitersForPeriod({
    periodTripIds,
    confirmed: input.confirmedLitros,
    pendingBlocks: input.pendingBlocks,
    orphanLoads: input.orphanLoads,
  });
  const litrosDespues = sumLitersForPeriod({
    periodTripIds,
    confirmed: input.lines.flatMap((line) =>
      line.viajes.map((viaje) => ({ trip_id: viaje.trip_id, litros: viaje.litros_asignados })),
    ),
    pendingBlocks: [],
    orphanLoads: input.orphanLoads,
  });
  const rendimientoEsperado = input.truck.rendimiento_esperado ?? 0;
  return {
    truck_id: input.truck.id,
    numero_economico: input.truck.numero_economico,
    viajes: input.trips.length,
    km,
    litros_antes: litrosAntes,
    litros_despues: litrosDespues,
    rendimiento_esperado: rendimientoEsperado,
    rendimiento_antes: rendimiento(km, litrosAntes),
    rendimiento_despues: rendimiento(km, litrosDespues),
  };
}

export async function applyTankReapply(
  tenantId: string,
  lines: TankReapplyLine[],
  transaction?: Transaction,
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
        await tankReapplyOps.reopenTicketProration(tenantId, line.ticket_id, transaction);
        await tankReapplyOps.saveTicketAssignments(
          tenantId,
          line.ticket_id,
          line.viajes.map((viaje) => viaje.trip_id),
          transaction,
        );
        await tankReapplyOps.confirmTicketProration(tenantId, line.ticket_id, transaction);
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
      transaction,
    );
    applied += pending.length;
  }

  return { applied, skipped };
}
