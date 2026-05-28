import { randomUUID } from "node:crypto";
import type { Transaction } from "sequelize";
import { TripStop, CartaPorte } from "../models";

export type ParadaInput = {
  etiqueta: string;
  client_ubicacion_id?: string | null;
};

export function formatRutaResumen(paradas: { etiqueta: string }[]): string {
  return paradas.map((p) => p.etiqueta.trim()).filter(Boolean).join(" → ");
}

export function deriveOrigenDestino(paradas: ParadaInput[]): { origen: string; destino: string } {
  if (paradas.length < 2) {
    const err = new Error("Se requieren al menos 2 paradas");
    (err as Error & { status?: number }).status = 400;
    throw err;
  }
  return {
    origen: paradas[0].etiqueta.trim(),
    destino: paradas[paradas.length - 1].etiqueta.trim(),
  };
}

export function normalizeParadasInput(
  input:
    | { paradas?: ParadaInput[] | string[]; origen?: string; destino?: string }
    | undefined,
): ParadaInput[] {
  if (input?.paradas && input.paradas.length >= 2) {
    return input.paradas.map((p) =>
      typeof p === "string"
        ? { etiqueta: p.trim() }
        : { etiqueta: p.etiqueta.trim(), client_ubicacion_id: p.client_ubicacion_id ?? null },
    );
  }
  if (input?.origen && input?.destino) {
    return [
      { etiqueta: input.origen.trim() },
      { etiqueta: input.destino.trim() },
    ];
  }
  const err = new Error("Indica paradas (mínimo 2) u origen y destino");
  (err as Error & { status?: number }).status = 400;
  throw err;
}

export async function saveTripStops(
  tenantId: string,
  tripId: string,
  paradas: ParadaInput[],
  t?: Transaction,
) {
  await TripStop.destroy({ where: { trip_id: tripId, tenant_id: tenantId }, transaction: t });
  for (let i = 0; i < paradas.length; i++) {
    const p = paradas[i];
    await TripStop.create(
      {
        id: randomUUID(),
        tenant_id: tenantId,
        trip_id: tripId,
        orden: i + 1,
        etiqueta: p.etiqueta,
        client_ubicacion_id: p.client_ubicacion_id ?? null,
      } as never,
      { transaction: t },
    );
  }
}

export async function listTripStops(tenantId: string, tripId: string, t?: Transaction) {
  return TripStop.findAll({
    where: { tenant_id: tenantId, trip_id: tripId },
    order: [["orden", "ASC"]],
    transaction: t,
  });
}

export async function assertParadasEditable(tenantId: string, tripId: string) {
  const cp = await CartaPorte.findOne({ where: { tenant_id: tenantId, trip_id: tripId } });
  if (cp?.estatus === "timbrada") {
    const err = new Error("No se pueden modificar paradas: la carta porte ya está timbrada");
    (err as Error & { status?: number }).status = 400;
    throw err;
  }
}
