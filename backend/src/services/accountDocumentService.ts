import { randomUUID } from "node:crypto";
import { Op, type Transaction, type WhereOptions } from "sequelize";
import {
  AccountDocument,
  AccountDocumentPayment,
  Client,
  Expense,
  FuelLoad,
  FuelTicket,
  MaintenanceRecord,
  Supplier,
  Trip,
} from "../models";
import type {
  AccountDocumentEstatus,
  AccountDocumentOrigen,
  AccountDocumentTipo,
} from "../models/AccountDocument";
import { roundMoney } from "./calc";
import { num } from "../utils/numbers";
import { addDaysToDateStr, localDateStr } from "../utils/localDates";

export type AgingBucket = "corriente" | "1-30" | "31-60" | "90+";
export type DisplayEstatus = "Al día" | "Vencida" | "Pagada" | "Cancelada";

export interface AccountPaymentDto {
  id: string;
  monto: number;
  fecha: string;
  nota?: string;
  created_at?: string;
}

export interface AccountDocumentDto {
  id: string;
  tipo: AccountDocumentTipo;
  client_id?: string;
  supplier_id?: string;
  entidad_nombre: string;
  folio: string;
  concepto: string;
  fecha_emision: string;
  plazo_credito_dias?: number | null;
  fecha_vencimiento?: string | null;
  monto_original: number;
  abonos: number;
  saldo_pendiente: number;
  estatus: AccountDocumentEstatus;
  estatus_display: DisplayEstatus;
  aging_bucket?: AgingBucket | null;
  origen: AccountDocumentOrigen;
  trip_id?: string;
  fuel_ticket_id?: string;
  fuel_load_id?: string;
  maintenance_record_id?: string;
  expense_id?: string;
  payments?: AccountPaymentDto[];
}

export interface AgingSummaryDto {
  tipo: AccountDocumentTipo;
  totals: Record<AgingBucket, { count: number; saldo: number }>;
  documents: AccountDocumentDto[];
}

function httpError(message: string, status: number) {
  const err = new Error(message) as Error & { status?: number };
  err.status = status;
  return err;
}

function paidTotal(payments: { monto: unknown }[]): number {
  return roundMoney(payments.reduce((a, p) => a + num(p.monto), 0));
}

export function daysBetween(fromIso: string, toIso: string): number {
  const [fy, fm, fd] = fromIso.split("-").map(Number);
  const [ty, tm, td] = toIso.split("-").map(Number);
  const from = Date.UTC(fy!, fm! - 1, fd!);
  const to = Date.UTC(ty!, tm! - 1, td!);
  return Math.floor((to - from) / 86_400_000);
}

export function computeAgingBucket(
  doc: { estatus: string; fecha_vencimiento?: string | null },
  saldo: number,
  today = localDateStr(),
): AgingBucket | null {
  if (doc.estatus === "cancelada" || doc.estatus === "pagada" || saldo <= 0) return null;
  const venc = doc.fecha_vencimiento ? String(doc.fecha_vencimiento).slice(0, 10) : null;
  if (!venc || today <= venc) return "corriente";
  const overdue = daysBetween(venc, today);
  if (overdue <= 30) return "1-30";
  if (overdue <= 60) return "31-60";
  return "90+";
}

export function computeDisplayEstatus(
  estatus: AccountDocumentEstatus,
  bucket: AgingBucket | null,
): DisplayEstatus {
  if (estatus === "cancelada") return "Cancelada";
  if (estatus === "pagada") return "Pagada";
  if (bucket && bucket !== "corriente") return "Vencida";
  return "Al día";
}

export function resolveDueDate(
  fechaEmision: string,
  plazo: number | null | undefined,
): string | null {
  if (plazo == null || !Number.isFinite(plazo) || plazo < 0) return null;
  return addDaysToDateStr(fechaEmision, Math.floor(plazo));
}

function toPaymentDto(p: AccountDocumentPayment): AccountPaymentDto {
  return {
    id: p.id,
    monto: num(p.monto),
    fecha: String(p.fecha).slice(0, 10),
    nota: p.nota ?? undefined,
    created_at: p.createdAt ? p.createdAt.toISOString() : undefined,
  };
}

export function toDocumentDto(
  doc: AccountDocument,
  payments: AccountDocumentPayment[] = [],
  today = localDateStr(),
): AccountDocumentDto {
  const monto = num(doc.monto_original);
  const abonos = paidTotal(payments);
  const saldo = roundMoney(Math.max(0, monto - abonos));
  const bucket = computeAgingBucket(doc, saldo, today);
  return {
    id: doc.id,
    tipo: doc.tipo,
    client_id: doc.client_id ?? undefined,
    supplier_id: doc.supplier_id ?? undefined,
    entidad_nombre: doc.entidad_nombre,
    folio: doc.folio,
    concepto: doc.concepto,
    fecha_emision: String(doc.fecha_emision).slice(0, 10),
    plazo_credito_dias: doc.plazo_credito_dias ?? null,
    fecha_vencimiento: doc.fecha_vencimiento
      ? String(doc.fecha_vencimiento).slice(0, 10)
      : null,
    monto_original: monto,
    abonos,
    saldo_pendiente: saldo,
    estatus: doc.estatus,
    estatus_display: computeDisplayEstatus(doc.estatus, bucket),
    aging_bucket: bucket,
    origen: doc.origen,
    trip_id: doc.trip_id ?? undefined,
    fuel_ticket_id: doc.fuel_ticket_id ?? undefined,
    fuel_load_id: doc.fuel_load_id ?? undefined,
    maintenance_record_id: doc.maintenance_record_id ?? undefined,
    expense_id: doc.expense_id ?? undefined,
    payments: payments.map(toPaymentDto),
  };
}

async function loadPaymentsMap(
  tenantId: string,
  docIds: string[],
): Promise<Map<string, AccountDocumentPayment[]>> {
  const map = new Map<string, AccountDocumentPayment[]>();
  if (!docIds.length) return map;
  const rows = await AccountDocumentPayment.findAll({
    where: { tenant_id: tenantId, document_id: { [Op.in]: docIds } },
    order: [
      ["fecha", "ASC"],
      ["created_at", "ASC"],
    ],
  });
  for (const row of rows) {
    const list = map.get(row.document_id) ?? [];
    list.push(row);
    map.set(row.document_id, list);
  }
  return map;
}

export async function listDocuments(
  tenantId: string,
  opts: {
    tipo?: AccountDocumentTipo;
    estatus?: AccountDocumentEstatus;
    bucket?: AgingBucket;
    q?: string;
    desde?: string;
    hasta?: string;
  } = {},
): Promise<AccountDocumentDto[]> {
  const where: WhereOptions = { tenant_id: tenantId };
  if (opts.tipo) where.tipo = opts.tipo;
  if (opts.estatus) where.estatus = opts.estatus;
  if (opts.desde || opts.hasta) {
    where.fecha_emision = {
      ...(opts.desde ? { [Op.gte]: opts.desde } : {}),
      ...(opts.hasta ? { [Op.lte]: opts.hasta } : {}),
    };
  }
  if (opts.q?.trim()) {
    const q = `%${opts.q.trim()}%`;
    Object.assign(where, {
      [Op.or]: [
        { folio: { [Op.like]: q } },
        { concepto: { [Op.like]: q } },
        { entidad_nombre: { [Op.like]: q } },
      ],
    });
  }

  const rows = await AccountDocument.findAll({
    where,
    order: [
      ["fecha_emision", "DESC"],
      ["created_at", "DESC"],
    ],
  });
  const paymentsMap = await loadPaymentsMap(
    tenantId,
    rows.map((r) => r.id),
  );
  const today = localDateStr();
  let dtos = rows.map((r) => toDocumentDto(r, paymentsMap.get(r.id) ?? [], today));
  if (opts.bucket) {
    dtos = dtos.filter((d) => d.aging_bucket === opts.bucket);
  }
  return dtos;
}

export async function getDocument(
  tenantId: string,
  id: string,
): Promise<AccountDocumentDto> {
  const doc = await AccountDocument.findOne({ where: { id, tenant_id: tenantId } });
  if (!doc) throw httpError("Documento no encontrado", 404);
  const payments = await AccountDocumentPayment.findAll({
    where: { tenant_id: tenantId, document_id: id },
    order: [
      ["fecha", "ASC"],
      ["created_at", "ASC"],
    ],
  });
  return toDocumentDto(doc, payments);
}

export async function getAgingSummary(
  tenantId: string,
  tipo: AccountDocumentTipo,
): Promise<AgingSummaryDto> {
  const documents = await listDocuments(tenantId, { tipo, estatus: "abierta" });
  const openWithSaldo = documents.filter((d) => d.saldo_pendiente > 0);
  const empty = () => ({ count: 0, saldo: 0 });
  const totals: AgingSummaryDto["totals"] = {
    corriente: empty(),
    "1-30": empty(),
    "31-60": empty(),
    "90+": empty(),
  };
  for (const d of openWithSaldo) {
    const b = d.aging_bucket;
    if (!b) continue;
    totals[b].count += 1;
    totals[b].saldo = roundMoney(totals[b].saldo + d.saldo_pendiente);
  }
  return { tipo, totals, documents: openWithSaldo };
}

export interface CreateDocumentInput {
  tipo: AccountDocumentTipo;
  client_id?: string | null;
  supplier_id?: string | null;
  entidad_nombre?: string;
  folio: string;
  concepto: string;
  fecha_emision: string;
  plazo_credito_dias?: number | null;
  fecha_vencimiento?: string | null;
  monto_original: number;
  origen?: AccountDocumentOrigen;
  trip_id?: string | null;
  fuel_ticket_id?: string | null;
  fuel_load_id?: string | null;
  maintenance_record_id?: string | null;
  expense_id?: string | null;
}

async function resolveEntityName(
  tenantId: string,
  input: CreateDocumentInput,
): Promise<{ client_id: string | null; supplier_id: string | null; entidad_nombre: string }> {
  if (input.tipo === "cxc") {
    if (!input.client_id && !input.entidad_nombre?.trim()) {
      throw httpError("Cliente requerido para CXC", 400);
    }
    let nombre = input.entidad_nombre?.trim() || "";
    if (input.client_id) {
      const c = await Client.findOne({ where: { id: input.client_id, tenant_id: tenantId } });
      if (!c) throw httpError("Cliente no encontrado", 404);
      nombre = nombre || c.razon_social;
    }
    return { client_id: input.client_id ?? null, supplier_id: null, entidad_nombre: nombre };
  }
  if (!input.supplier_id && !input.entidad_nombre?.trim()) {
    throw httpError("Proveedor o nombre requerido para CXP", 400);
  }
  let nombre = input.entidad_nombre?.trim() || "";
  if (input.supplier_id) {
    const s = await Supplier.findOne({ where: { id: input.supplier_id, tenant_id: tenantId } });
    if (!s) throw httpError("Proveedor no encontrado", 404);
    nombre = nombre || s.razon_social;
  }
  return {
    client_id: null,
    supplier_id: input.supplier_id ?? null,
    entidad_nombre: nombre || "Proveedor",
  };
}

export async function createDocument(
  tenantId: string,
  input: CreateDocumentInput,
  t?: Transaction,
): Promise<AccountDocumentDto> {
  if (input.monto_original <= 0) throw httpError("El monto debe ser mayor a 0", 400);
  const entity = await resolveEntityName(tenantId, input);
  const plazo =
    input.plazo_credito_dias != null && Number.isFinite(input.plazo_credito_dias)
      ? Math.floor(input.plazo_credito_dias)
      : null;
  const venc =
    input.fecha_vencimiento?.trim() ||
    resolveDueDate(input.fecha_emision, plazo);

  const row = await AccountDocument.create(
    {
      id: randomUUID(),
      tenant_id: tenantId,
      tipo: input.tipo,
      client_id: entity.client_id,
      supplier_id: entity.supplier_id,
      entidad_nombre: entity.entidad_nombre,
      folio: input.folio.trim(),
      concepto: input.concepto.trim(),
      fecha_emision: input.fecha_emision,
      plazo_credito_dias: plazo,
      fecha_vencimiento: venc,
      monto_original: String(roundMoney(input.monto_original)),
      estatus: "abierta",
      origen: input.origen ?? "manual",
      trip_id: input.trip_id ?? null,
      fuel_ticket_id: input.fuel_ticket_id ?? null,
      fuel_load_id: input.fuel_load_id ?? null,
      maintenance_record_id: input.maintenance_record_id ?? null,
      expense_id: input.expense_id ?? null,
    } as never,
    { transaction: t },
  );
  return toDocumentDto(row, []);
}

export async function updateDocument(
  tenantId: string,
  id: string,
  patch: Partial<{
    folio: string;
    concepto: string;
    fecha_emision: string;
    plazo_credito_dias: number | null;
    fecha_vencimiento: string | null;
    monto_original: number;
    client_id: string | null;
    supplier_id: string | null;
    entidad_nombre: string;
  }>,
): Promise<AccountDocumentDto> {
  const doc = await AccountDocument.findOne({ where: { id, tenant_id: tenantId } });
  if (!doc) throw httpError("Documento no encontrado", 404);
  if (doc.estatus === "cancelada") throw httpError("Documento cancelado", 400);

  const payments = await AccountDocumentPayment.findAll({
    where: { tenant_id: tenantId, document_id: id },
  });
  const abonado = paidTotal(payments);

  const data: Record<string, unknown> = {};
  if (patch.folio !== undefined) data.folio = patch.folio.trim();
  if (patch.concepto !== undefined) data.concepto = patch.concepto.trim();
  if (patch.fecha_emision !== undefined) data.fecha_emision = patch.fecha_emision;
  if (patch.plazo_credito_dias !== undefined) {
    data.plazo_credito_dias = patch.plazo_credito_dias;
  }
  if (patch.monto_original !== undefined) {
    if (patch.monto_original < abonado) {
      throw httpError("El monto no puede ser menor a los abonos realizados", 400);
    }
    data.monto_original = String(roundMoney(patch.monto_original));
  }
  if (patch.entidad_nombre !== undefined) data.entidad_nombre = patch.entidad_nombre.trim();
  if (patch.client_id !== undefined && doc.tipo === "cxc") {
    if (patch.client_id) {
      const c = await Client.findOne({ where: { id: patch.client_id, tenant_id: tenantId } });
      if (!c) throw httpError("Cliente no encontrado", 404);
      data.client_id = c.id;
      if (patch.entidad_nombre === undefined) data.entidad_nombre = c.razon_social;
    } else {
      data.client_id = null;
    }
  }
  if (patch.supplier_id !== undefined && doc.tipo === "cxp") {
    if (patch.supplier_id) {
      const s = await Supplier.findOne({ where: { id: patch.supplier_id, tenant_id: tenantId } });
      if (!s) throw httpError("Proveedor no encontrado", 404);
      data.supplier_id = s.id;
      if (patch.entidad_nombre === undefined) data.entidad_nombre = s.razon_social;
    } else {
      data.supplier_id = null;
    }
  }

  const emision = String(patch.fecha_emision ?? doc.fecha_emision).slice(0, 10);
  const plazo =
    patch.plazo_credito_dias !== undefined
      ? patch.plazo_credito_dias
      : doc.plazo_credito_dias;
  if (patch.fecha_vencimiento !== undefined) {
    data.fecha_vencimiento = patch.fecha_vencimiento;
  } else if (patch.fecha_emision !== undefined || patch.plazo_credito_dias !== undefined) {
    data.fecha_vencimiento = resolveDueDate(emision, plazo);
  }

  await doc.update(data as never);
  await refreshDocumentStatus(doc, payments);
  await doc.reload();
  await syncDocumentToSource(doc, patch);
  return getDocument(tenantId, id);
}

/** Propaga cambios editados en el documento CXC/CXP hacia la entidad de origen. */
async function syncDocumentToSource(
  doc: AccountDocument,
  patch: Partial<{
    folio: string;
    concepto: string;
    fecha_emision: string;
    monto_original: number;
    supplier_id: string | null;
    entidad_nombre: string;
    client_id: string | null;
  }>,
) {
  if (doc.origen === "manual") return;

  if (doc.origen === "gasto" && doc.expense_id) {
    const expense = await Expense.findOne({
      where: { id: doc.expense_id, tenant_id: doc.tenant_id },
    });
    if (!expense) return;
    const expPatch: Record<string, unknown> = {};
    if (patch.monto_original !== undefined) expPatch.monto = roundMoney(patch.monto_original);
    if (patch.fecha_emision !== undefined) expPatch.fecha = new Date(patch.fecha_emision);
    if (patch.supplier_id !== undefined) expPatch.supplier_id = patch.supplier_id;
    if (patch.concepto !== undefined) {
      // concepto suele ser "categoria: descripcion"
      const colon = patch.concepto.indexOf(":");
      expPatch.descripcion =
        colon >= 0 ? patch.concepto.slice(colon + 1).trim() || patch.concepto : patch.concepto;
    }
    if (Object.keys(expPatch).length) await expense.update(expPatch as never);
    return;
  }

  if (doc.origen === "combustible" && doc.fuel_ticket_id) {
    const ticket = await FuelTicket.findOne({
      where: { id: doc.fuel_ticket_id, tenant_id: doc.tenant_id },
    });
    if (!ticket) return;
    const tPatch: Record<string, unknown> = {};
    if (patch.monto_original !== undefined) tPatch.importe_total = String(roundMoney(patch.monto_original));
    if (patch.folio !== undefined) tPatch.folio = patch.folio.trim() || null;
    if (patch.fecha_emision !== undefined) tPatch.fecha = patch.fecha_emision;
    if (patch.supplier_id !== undefined) tPatch.supplier_id = patch.supplier_id;
    if (patch.entidad_nombre !== undefined) tPatch.ubicacion = patch.entidad_nombre.trim();
    if (Object.keys(tPatch).length) await ticket.update(tPatch as never);
    return;
  }

  if (doc.origen === "combustible" && doc.fuel_load_id) {
    const load = await FuelLoad.findOne({
      where: { id: doc.fuel_load_id, tenant_id: doc.tenant_id },
    });
    if (!load) return;
    const lPatch: Record<string, unknown> = {};
    if (patch.monto_original !== undefined) {
      const litros = num(load.litros);
      if (litros > 0) {
        lPatch.precio_litro = String(roundMoney(patch.monto_original / litros));
      }
    }
    if (patch.fecha_emision !== undefined) lPatch.fecha = new Date(patch.fecha_emision);
    if (patch.entidad_nombre !== undefined) {
      lPatch.estacion_nombre = patch.entidad_nombre.trim();
      lPatch.ubicacion = patch.entidad_nombre.trim();
    }
    if (Object.keys(lPatch).length) await load.update(lPatch as never);
    return;
  }

  if (doc.origen === "mantenimiento" && doc.maintenance_record_id) {
    const record = await MaintenanceRecord.findOne({
      where: { id: doc.maintenance_record_id, tenant_id: doc.tenant_id },
    });
    if (!record) return;
    const mPatch: Record<string, unknown> = {};
    if (patch.monto_original !== undefined) mPatch.costo = roundMoney(patch.monto_original);
    if (patch.fecha_emision !== undefined) mPatch.fecha = patch.fecha_emision;
    if (patch.supplier_id !== undefined) mPatch.supplier_id = patch.supplier_id;
    if (patch.entidad_nombre !== undefined) mPatch.taller = patch.entidad_nombre.trim();
    if (patch.concepto !== undefined) {
      // "Mantenimiento tipo: descripcion"
      const colon = patch.concepto.indexOf(":");
      mPatch.descripcion =
        colon >= 0 ? patch.concepto.slice(colon + 1).trim() || patch.concepto : patch.concepto;
    }
    if (Object.keys(mPatch).length) await record.update(mPatch as never);
    return;
  }

  if (doc.origen === "viaje" && doc.trip_id) {
    const trip = await Trip.findOne({
      where: { id: doc.trip_id, tenant_id: doc.tenant_id },
    });
    if (!trip) return;
    const tripPatch: Record<string, unknown> = {};
    if (patch.monto_original !== undefined) tripPatch.tarifa = roundMoney(patch.monto_original);
    if (patch.folio !== undefined) tripPatch.num_factura = patch.folio.trim() || null;
    if (patch.client_id !== undefined) tripPatch.client_id = patch.client_id;
    if (Object.keys(tripPatch).length) await trip.update(tripPatch as never);
  }
}

async function refreshDocumentStatus(
  doc: AccountDocument,
  payments: AccountDocumentPayment[],
) {
  if (doc.estatus === "cancelada") return;
  const saldo = roundMoney(Math.max(0, num(doc.monto_original) - paidTotal(payments)));
  const next: AccountDocumentEstatus = saldo <= 0 ? "pagada" : "abierta";
  if (doc.estatus !== next) await doc.update({ estatus: next } as never);
}

export async function addPayment(
  tenantId: string,
  documentId: string,
  data: { monto: number; fecha: string; nota?: string },
  createdBy?: string,
): Promise<AccountDocumentDto> {
  if (data.monto <= 0) throw httpError("El abono debe ser mayor a 0", 400);
  const doc = await AccountDocument.findOne({
    where: { id: documentId, tenant_id: tenantId },
  });
  if (!doc) throw httpError("Documento no encontrado", 404);
  if (doc.estatus === "cancelada") throw httpError("Documento cancelado", 400);

  const payments = await AccountDocumentPayment.findAll({
    where: { tenant_id: tenantId, document_id: documentId },
  });
  const saldo = roundMoney(Math.max(0, num(doc.monto_original) - paidTotal(payments)));
  if (data.monto > saldo + 0.001) {
    throw httpError(`El abono excede el saldo pendiente (${saldo})`, 400);
  }

  await AccountDocumentPayment.create({
    id: randomUUID(),
    tenant_id: tenantId,
    document_id: documentId,
    monto: String(roundMoney(data.monto)),
    fecha: data.fecha,
    nota: data.nota?.trim() || null,
    created_by: createdBy ?? null,
  } as never);

  const refreshed = await AccountDocumentPayment.findAll({
    where: { tenant_id: tenantId, document_id: documentId },
  });
  await refreshDocumentStatus(doc, refreshed);
  return getDocument(tenantId, documentId);
}

export async function cancelDocument(
  tenantId: string,
  id: string,
): Promise<AccountDocumentDto> {
  const doc = await AccountDocument.findOne({ where: { id, tenant_id: tenantId } });
  if (!doc) throw httpError("Documento no encontrado", 404);
  if (doc.estatus === "cancelada") return getDocument(tenantId, id);
  const payments = await AccountDocumentPayment.findAll({
    where: { tenant_id: tenantId, document_id: id },
  });
  if (payments.length > 0) {
    throw httpError("No se puede cancelar un documento con abonos", 400);
  }
  await doc.update({ estatus: "cancelada" } as never);
  return getDocument(tenantId, id);
}

/** Busca o crea proveedor por razón social (match case-insensitive). */
export async function findOrCreateSupplierByName(
  tenantId: string,
  nombre: string,
  opts?: { dias_credito?: number | null; transaction?: Transaction },
): Promise<Supplier> {
  const trimmed = nombre.trim() || "Proveedor";
  const existing = await Supplier.findOne({
    where: {
      tenant_id: tenantId,
      razon_social: { [Op.like]: trimmed },
    },
    transaction: opts?.transaction,
  });
  if (existing) return existing;
  return Supplier.create(
    {
      id: randomUUID(),
      tenant_id: tenantId,
      razon_social: trimmed,
      dias_credito: opts?.dias_credito ?? null,
      estatus: "activo",
    } as never,
    { transaction: opts?.transaction },
  );
}

async function upsertBySource(
  tenantId: string,
  sourceField:
    | "trip_id"
    | "fuel_ticket_id"
    | "fuel_load_id"
    | "maintenance_record_id"
    | "expense_id",
  sourceId: string,
  input: CreateDocumentInput & { skipIfCancelada?: boolean },
): Promise<AccountDocumentDto | null> {
  const existing = await AccountDocument.findOne({
    where: { tenant_id: tenantId, [sourceField]: sourceId },
  });
  if (existing) {
    if (existing.estatus === "cancelada") return toDocumentDto(existing, []);
    const payments = await AccountDocumentPayment.findAll({
      where: { tenant_id: tenantId, document_id: existing.id },
    });
    const abonado = paidTotal(payments);
    if (input.monto_original < abonado) {
      // keep current monto if new amount would break payments
      return toDocumentDto(existing, payments);
    }
    const entity = await resolveEntityName(tenantId, input);
    const plazo =
      input.plazo_credito_dias != null && Number.isFinite(input.plazo_credito_dias)
        ? Math.floor(input.plazo_credito_dias)
        : null;
    const venc =
      input.fecha_vencimiento?.trim() ||
      resolveDueDate(input.fecha_emision, plazo);
    await existing.update({
      client_id: entity.client_id,
      supplier_id: entity.supplier_id,
      entidad_nombre: entity.entidad_nombre,
      folio: input.folio.trim(),
      concepto: input.concepto.trim(),
      fecha_emision: input.fecha_emision,
      plazo_credito_dias: plazo,
      fecha_vencimiento: venc,
      monto_original: String(roundMoney(input.monto_original)),
    } as never);
    await refreshDocumentStatus(existing, payments);
    return getDocument(tenantId, existing.id);
  }
  if (input.monto_original <= 0) return null;
  return createDocument(tenantId, { ...input, [sourceField]: sourceId });
}

export async function upsertFromTrip(trip: Trip): Promise<AccountDocumentDto | null> {
  const tarifa = num(trip.tarifa);
  if (tarifa <= 0) return null;
  const client = await Client.findOne({
    where: { id: trip.client_id, tenant_id: trip.tenant_id },
  });
  const plazo = client?.dias_credito ?? null;
  const emision = trip.fecha_llegada
    ? localDateStr(new Date(trip.fecha_llegada))
    : trip.fecha_salida
      ? localDateStr(new Date(trip.fecha_salida))
      : localDateStr();
  const folio = trip.num_factura?.trim() || `VIAJE-${trip.folio}`;
  return upsertBySource(trip.tenant_id, "trip_id", trip.id, {
    tipo: "cxc",
    client_id: trip.client_id,
    entidad_nombre: client?.razon_social,
    folio,
    concepto: `Servicio de transporte ${trip.origen} → ${trip.destino}`,
    fecha_emision: emision,
    plazo_credito_dias: plazo,
    monto_original: tarifa,
    origen: "viaje",
  });
}

export async function upsertFromFuelTicket(
  ticket: FuelTicket,
): Promise<AccountDocumentDto | null> {
  const monto = num(ticket.importe_total);
  if (monto <= 0) return null;
  let supplierId = ticket.supplier_id;
  let nombre = ticket.ubicacion || "Gasolinera";
  let plazo: number | null = null;
  if (supplierId) {
    const s = await Supplier.findByPk(supplierId);
    if (s) {
      nombre = s.razon_social;
      plazo = s.dias_credito ?? null;
    }
  } else {
    const s = await findOrCreateSupplierByName(ticket.tenant_id, nombre);
    supplierId = s.id;
    plazo = s.dias_credito ?? null;
  }
  const folio = ticket.folio?.trim() || `COMB-${ticket.id.slice(0, 8).toUpperCase()}`;
  return upsertBySource(ticket.tenant_id, "fuel_ticket_id", ticket.id, {
    tipo: "cxp",
    supplier_id: supplierId,
    entidad_nombre: nombre,
    folio,
    concepto: `Combustible ${num(ticket.litros)} L @ ${ticket.ubicacion}`,
    fecha_emision: String(ticket.fecha).slice(0, 10),
    plazo_credito_dias: plazo,
    monto_original: monto,
    origen: "combustible",
  });
}

export async function upsertFromFuelLoad(
  load: FuelLoad,
): Promise<AccountDocumentDto | null> {
  if (load.fuel_ticket_id) return null; // ticket owns the CXP
  const monto = roundMoney(num(load.litros) * num(load.precio_litro));
  if (monto <= 0) return null;
  const nombre = load.estacion_nombre?.trim() || load.ubicacion || "Gasolinera";
  const s = await findOrCreateSupplierByName(load.tenant_id, nombre);
  const emision = localDateStr(new Date(load.fecha));
  const folio = `COMB-L-${load.id.slice(0, 8).toUpperCase()}`;
  return upsertBySource(load.tenant_id, "fuel_load_id", load.id, {
    tipo: "cxp",
    supplier_id: s.id,
    entidad_nombre: s.razon_social,
    folio,
    concepto: `Combustible viaje ${num(load.litros)} L`,
    fecha_emision: emision,
    plazo_credito_dias: s.dias_credito ?? null,
    monto_original: monto,
    origen: "combustible",
  });
}

export async function upsertFromMaintenance(
  record: MaintenanceRecord,
): Promise<AccountDocumentDto | null> {
  const monto = num(record.costo);
  if (monto <= 0) return null;
  let supplierId = record.supplier_id;
  let nombre = record.taller?.trim() || "Taller";
  let plazo: number | null = null;
  if (supplierId) {
    const s = await Supplier.findByPk(supplierId);
    if (s) {
      nombre = s.razon_social;
      plazo = s.dias_credito ?? null;
    }
  } else {
    const s = await findOrCreateSupplierByName(record.tenant_id, nombre);
    supplierId = s.id;
    plazo = s.dias_credito ?? null;
  }
  const folio = `MANT-${record.id.slice(0, 8).toUpperCase()}`;
  return upsertBySource(record.tenant_id, "maintenance_record_id", record.id, {
    tipo: "cxp",
    supplier_id: supplierId,
    entidad_nombre: nombre,
    folio,
    concepto: `Mantenimiento ${record.tipo}: ${record.descripcion}`.slice(0, 512),
    fecha_emision: String(record.fecha).slice(0, 10),
    plazo_credito_dias: plazo,
    monto_original: monto,
    origen: "mantenimiento",
  });
}

export async function upsertFromExpense(
  expense: Expense,
): Promise<AccountDocumentDto | null> {
  if (expense.tipo !== "gasto") return null;
  const monto = num(expense.monto);
  if (monto <= 0) return null;
  let supplierId = expense.supplier_id;
  let nombre = "Proveedor";
  let plazo: number | null = null;
  if (supplierId) {
    const s = await Supplier.findByPk(supplierId);
    if (s) {
      nombre = s.razon_social;
      plazo = s.dias_credito ?? null;
    }
  } else {
    const s = await findOrCreateSupplierByName(
      expense.tenant_id,
      `Gasto ${expense.categoria}`,
    );
    supplierId = s.id;
    nombre = s.razon_social;
    plazo = s.dias_credito ?? null;
  }
  const emision = localDateStr(new Date(expense.fecha));
  const folio = `GASTO-${expense.id.slice(0, 8).toUpperCase()}`;
  return upsertBySource(expense.tenant_id, "expense_id", expense.id, {
    tipo: "cxp",
    supplier_id: supplierId,
    entidad_nombre: nombre,
    folio,
    concepto: `${expense.categoria}: ${expense.descripcion}`.slice(0, 512),
    fecha_emision: emision,
    plazo_credito_dias: plazo,
    monto_original: monto,
    origen: "gasto",
  });
}

export async function backfillTenant(tenantId: string): Promise<{
  cxc: number;
  cxp: number;
}> {
  let cxc = 0;
  let cxp = 0;

  const trips = await Trip.findAll({ where: { tenant_id: tenantId } });
  for (const trip of trips) {
    const closed = (trip as Trip & { statuses?: { slug?: string }[] }).statuses;
    // Without statuses loaded, upsert if has tarifa and num_factura or fecha_llegada
    if (num(trip.tarifa) > 0 && (trip.num_factura || trip.fecha_llegada)) {
      const r = await upsertFromTrip(trip);
      if (r) cxc += 1;
    }
  }

  const tickets = await FuelTicket.findAll({ where: { tenant_id: tenantId } });
  for (const t of tickets) {
    const r = await upsertFromFuelTicket(t);
    if (r) cxp += 1;
  }

  const loads = await FuelLoad.findAll({
    where: { tenant_id: tenantId, fuel_ticket_id: null },
  });
  for (const l of loads) {
    const r = await upsertFromFuelLoad(l);
    if (r) cxp += 1;
  }

  const maints = await MaintenanceRecord.findAll({ where: { tenant_id: tenantId } });
  for (const m of maints) {
    const r = await upsertFromMaintenance(m);
    if (r) cxp += 1;
  }

  const expenses = await Expense.findAll({
    where: { tenant_id: tenantId, tipo: "gasto" },
  });
  for (const e of expenses) {
    const r = await upsertFromExpense(e);
    if (r) cxp += 1;
  }

  return { cxc, cxp };
}
