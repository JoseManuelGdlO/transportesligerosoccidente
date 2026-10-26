import type { Client, Trip } from "@/types/tlo";
import type { SettlementSummary } from "@/lib/calc";

type ClientNameSource = Pick<Client, "razon_social" | "alias">;

export function clientDisplayName(client: ClientNameSource | null | undefined, usarAlias = false): string {
  const razon = client?.razon_social?.trim() || "";
  if (!usarAlias) return razon;
  const alias = client?.alias?.trim();
  return alias || razon;
}

export function tripClientDisplayName(
  trip: Pick<Trip, "client_id" | "client_nombre">,
  clients: Pick<Client, "id" | "razon_social" | "alias">[],
  usarAlias = false,
): string {
  const client = clients.find((c) => c.id === trip.client_id);
  if (client) return clientDisplayName(client, usarAlias) || trip.client_nombre?.trim() || "";
  return trip.client_nombre?.trim() || "";
}

export function settlementSummaryWithClientNames(
  summary: SettlementSummary,
  clients: Pick<Client, "id" | "razon_social" | "alias">[],
  usarAlias: boolean,
): SettlementSummary {
  if (!usarAlias) return summary;
  return {
    ...summary,
    trips: summary.trips.map((trip) => ({
      ...trip,
      client_nombre: tripClientDisplayName(trip, clients, true) || trip.client_nombre,
    })),
  };
}
