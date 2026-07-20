import { randomUUID } from "node:crypto";
import { Op } from "sequelize";
import { FuelTicket, Truck } from "../models";
import type { FuelTicketOrigen } from "../models/FuelTicket";

export type FuelTicketInput = {
  truck_id: string;
  fecha: string;
  hora?: string | null;
  folio?: string | null;
  tag?: string | null;
  numero_economico_raw?: string | null;
  placas_raw?: string | null;
  odometro: number;
  litros: number;
  precio_litro: number;
  importe_total?: number;
  ubicacion?: string;
  origen?: FuelTicketOrigen;
  external_id?: string | null;
  supplier_id?: string | null;
};

function calcImporte(litros: number, precio: number, importe?: number): number {
  if (importe != null && importe > 0) return importe;
  return Math.round(litros * precio * 100) / 100;
}

async function assertFolioUnique(
  tenantId: string,
  folio: string | null | undefined,
  excludeId?: string,
): Promise<void> {
  const f = folio?.trim();
  if (!f) return;
  const where: Record<string, unknown> = { tenant_id: tenantId, folio: f };
  if (excludeId) where.id = { [Op.ne]: excludeId };
  const existing = await FuelTicket.findOne({ where: where as never });
  if (existing) {
    throw Object.assign(new Error("Ya existe un ticket con ese folio en este tenant"), { status: 409 });
  }
}

export async function listFuelTickets(
  tenantId: string,
  filters: { truck_id?: string; inicio?: string; fin?: string },
) {
  const where: Record<string, unknown> = { tenant_id: tenantId };
  if (filters.truck_id) where.truck_id = filters.truck_id;
  if (filters.inicio && filters.fin) {
    where.fecha = { [Op.between]: [filters.inicio, filters.fin] };
  } else if (filters.inicio) {
    where.fecha = { [Op.gte]: filters.inicio };
  } else if (filters.fin) {
    where.fecha = { [Op.lte]: filters.fin };
  }

  return FuelTicket.findAll({
    where,
    include: [{ model: Truck, attributes: ["numero_economico", "placas"] }],
    order: [
      ["fecha", "DESC"],
      ["hora", "DESC"],
    ],
  });
}

export async function getFuelTicketOrThrow(tenantId: string, id: string) {
  const row = await FuelTicket.findOne({
    where: { id, tenant_id: tenantId },
    include: [{ model: Truck, attributes: ["numero_economico", "placas"] }],
  });
  if (!row) throw Object.assign(new Error("Ticket no encontrado"), { status: 404 });
  return row;
}

export async function createFuelTicket(tenantId: string, input: FuelTicketInput) {
  const truck = await Truck.findOne({ where: { id: input.truck_id, tenant_id: tenantId } });
  if (!truck) throw Object.assign(new Error("Camión no encontrado"), { status: 400 });

  await assertFolioUnique(tenantId, input.folio);

  const litros = input.litros;
  const precio = input.precio_litro;
  const row = await FuelTicket.create({
    id: randomUUID(),
    tenant_id: tenantId,
    truck_id: input.truck_id,
    fecha: input.fecha,
    hora: input.hora ?? null,
    folio: input.folio?.trim() || null,
    tag: input.tag?.trim() || null,
    numero_economico_raw: input.numero_economico_raw ?? truck.numero_economico,
    placas_raw: input.placas_raw ?? truck.placas,
    odometro: input.odometro,
    litros: String(litros),
    precio_litro: String(precio),
    importe_total: String(calcImporte(litros, precio, input.importe_total)),
    ubicacion: input.ubicacion?.trim() || "Gasolinera",
    origen: input.origen ?? "manual",
    external_id: input.external_id ?? null,
    supplier_id: input.supplier_id ?? null,
  } as never);
  try {
    const { upsertFromFuelTicket } = await import("./accountDocumentService");
    await upsertFromFuelTicket(row);
  } catch (syncErr) {
    // Ticket ya creado; no fallar la operación por sync de CXP
    console.warn(
      "[fuelTicket] Ticket creado pero falló sync de documento CXP:",
      syncErr instanceof Error ? syncErr.message : syncErr,
    );
  }
  return row;
}

export async function updateFuelTicket(tenantId: string, id: string, patch: Partial<FuelTicketInput>) {
  const row = await getFuelTicketOrThrow(tenantId, id);
  if (patch.truck_id) {
    const truck = await Truck.findOne({ where: { id: patch.truck_id, tenant_id: tenantId } });
    if (!truck) throw Object.assign(new Error("Camión no encontrado"), { status: 400 });
  }

  if (patch.folio !== undefined) {
    await assertFolioUnique(tenantId, patch.folio, id);
  }

  const litros = patch.litros != null ? patch.litros : Number(row.litros);
  const precio = patch.precio_litro != null ? patch.precio_litro : Number(row.precio_litro);
  const importe =
    patch.importe_total != null
      ? patch.importe_total
      : calcImporte(litros, precio, Number(row.importe_total));

  await row.update({
    ...(patch.truck_id != null ? { truck_id: patch.truck_id } : {}),
    ...(patch.fecha != null ? { fecha: patch.fecha } : {}),
    ...(patch.hora !== undefined ? { hora: patch.hora } : {}),
    ...(patch.folio !== undefined ? { folio: patch.folio?.trim() || null } : {}),
    ...(patch.tag !== undefined ? { tag: patch.tag?.trim() || null } : {}),
    ...(patch.numero_economico_raw !== undefined ? { numero_economico_raw: patch.numero_economico_raw } : {}),
    ...(patch.placas_raw !== undefined ? { placas_raw: patch.placas_raw } : {}),
    ...(patch.odometro != null ? { odometro: patch.odometro } : {}),
    ...(patch.litros != null ? { litros: String(litros) } : {}),
    ...(patch.precio_litro != null ? { precio_litro: String(precio) } : {}),
    importe_total: String(importe),
    ...(patch.ubicacion != null ? { ubicacion: patch.ubicacion } : {}),
    ...(patch.external_id !== undefined ? { external_id: patch.external_id } : {}),
    ...(patch.supplier_id !== undefined ? { supplier_id: patch.supplier_id } : {}),
  } as never);

  const updated = await getFuelTicketOrThrow(tenantId, id);
  try {
    const { upsertFromFuelTicket } = await import("./accountDocumentService");
    await upsertFromFuelTicket(updated);
  } catch (syncErr) {
    console.warn(
      "[fuelTicket] Ticket actualizado pero falló sync de documento CXP:",
      syncErr instanceof Error ? syncErr.message : syncErr,
    );
  }
  return updated;
}

export async function deleteFuelTicket(tenantId: string, id: string) {
  const row = await getFuelTicketOrThrow(tenantId, id);
  await row.destroy();
}
