import { randomUUID } from "node:crypto";
import { Op, type Transaction, type WhereOptions } from "sequelize";
import {
  AccountDocument,
  AccountDocumentPayment,
  CartaPorte,
  CfdiPago,
  Client,
  Expense,
  FuelLoad,
  FuelTicket,
  MaintenanceRecord,
  Supplier,
  Tenant,
  Trip,
} from "../models";
import type {
  AccountDocumentEstatus,
  AccountDocumentOrigen,
  AccountDocumentTipo,
} from "../models/AccountDocument";
import { roundMoney } from "./calc";
import { parseInvoiceTaxSnapshot } from "./paymentComplement/invoiceTaxSnapshot";
import { documentoRequiereComplemento } from "./paymentComplement/paymentComplementService";
import { num } from "../utils/numbers";
import { addDaysToDateStr, localDateStr } from "../utils/localDates";
import { computeTripInvoiceTaxes, type InvoiceTaxOpts } from "./pac/sicofi/invoiceTaxes";
import { tripRouteLabelFromModel } from "./tripRouteLabel";
import type { TripCfdiConcepto } from "../types/tripCfdiConcepto";
import {
  conceptosFromLegacy,
  maintenanceCxpProjection,
  maintenancePatchFromAccount,
  parseConceptosJson,
  sumConceptos,
  summarizeConceptos,
  validateConceptos,
  type DocumentConcepto,
} from "../types/documentConcepto";

export type AgingBucket = "corriente" | "1-30" | "31-60" | "90+";
export type DisplayEstatus = "Al día" | "Vencida" | "Pagada" | "Cancelada";

export interface AccountPaymentDto {
  id: string;
  monto: number;
  fecha: string;
  nota?: string;
  created_at?: string;
  cfdi_pago_id?: string;
  uuid?: string;
}

export interface AccountDocumentDto {
  id: string;
  tipo: AccountDocumentTipo;
  client_id?: string;
  supplier_id?: string;
  entidad_nombre: string;
  folio: string;
  concepto: string;
  conceptos?: DocumentConcepto[];
  fecha_emision: string;
  fecha_ingreso_cobranza?: string | null;
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

export interface StatementTotalsDto {
  pendiente: number;
  vencido: number;
  pagadas: number;
}

export interface AgingSummaryDto {
  tipo: AccountDocumentTipo;
  totals: Record<AgingBucket, { count: number; saldo: number }>;
  /** Cartera completa del tipo, sin búsqueda, fechas, cubeta ni estatus. */
  statement: StatementTotalsDto;
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
  fechaBase: string | null | undefined,
  plazo: number | null | undefined,
): string | null {
  if (!fechaBase) return null;
  if (plazo == null || !Number.isFinite(plazo) || plazo < 0) return null;
  return addDaysToDateStr(fechaBase, Math.floor(plazo));
}

export function nextDueDate(input: {
  fechaEmision: string;
  fechaCobranza: string | null;
  plazo: number | null;
  fechaVencimientoExplicita?: string | null;
}): string | null {
  if (input.fechaVencimientoExplicita?.trim()) return input.fechaVencimientoExplicita.trim();
  return resolveDueDate(input.fechaCobranza || input.fechaEmision, input.plazo);
}

export function cobranzaAConservar(
  actual: string | null | undefined,
  incoming: string | null | undefined,
  preserveIfSet: boolean,
): string | null {
  const prev = actual ? String(actual).slice(0, 10) : null;
  const next = incoming ? String(incoming).slice(0, 10) : null;
  if (preserveIfSet && prev) return prev;
  if (!next && prev) return prev;
  return next;
}

function toPaymentDto(p: AccountDocumentPayment): AccountPaymentDto {
  return {
    id: p.id,
    monto: num(p.monto),
    fecha: String(p.fecha).slice(0, 10),
    nota: p.nota ?? undefined,
    created_at: p.createdAt ? p.createdAt.toISOString() : undefined,
    cfdi_pago_id: p.cfdi_pago_id ?? undefined,
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
    conceptos: parseConceptosJson(doc.conceptos),
    fecha_emision: String(doc.fecha_emision).slice(0, 10),
    fecha_ingreso_cobranza: doc.fecha_ingreso_cobranza
      ? String(doc.fecha_ingreso_cobranza).slice(0, 10)
      : null,
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

/** Documentos cuyo UUID fiscal (factura o complemento) coincide con el patrón LIKE. */
async function fiscalUuidMatchIds(
  tenantId: string,
  pattern: string,
): Promise<{ tripIds: string[]; documentIds: string[] }> {
  const [cartas, pagos] = await Promise.all([
    CartaPorte.findAll({
      where: { tenant_id: tenantId, uuid: { [Op.like]: pattern } },
      attributes: ["trip_id"],
    }),
    CfdiPago.findAll({
      where: { tenant_id: tenantId, uuid: { [Op.like]: pattern } },
      attributes: ["id"],
    }),
  ]);
  const tripIds = [...new Set(cartas.map((row) => row.trip_id).filter(Boolean))];
  const pagoIds = pagos.map((row) => row.id);
  if (!pagoIds.length) return { tripIds, documentIds: [] };
  const payments = await AccountDocumentPayment.findAll({
    where: { tenant_id: tenantId, cfdi_pago_id: { [Op.in]: pagoIds } },
    attributes: ["document_id"],
  });
  return {
    tripIds,
    documentIds: [...new Set(payments.map((row) => row.document_id))],
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
    const or: WhereOptions[] = [
      { folio: { [Op.like]: q } },
      { concepto: { [Op.like]: q } },
      { entidad_nombre: { [Op.like]: q } },
      { id: { [Op.like]: q } },
    ];
    const { tripIds, documentIds } = await fiscalUuidMatchIds(tenantId, q);
    if (tripIds.length) or.push({ trip_id: { [Op.in]: tripIds } });
    if (documentIds.length) or.push({ id: { [Op.in]: documentIds } });
    const aliasClients = await Client.findAll({
      where: { tenant_id: tenantId, alias: { [Op.like]: q } },
      attributes: ["id"],
    });
    if (aliasClients.length) {
      or.push({ client_id: { [Op.in]: aliasClients.map((c) => c.id) } });
    }
    Object.assign(where, { [Op.or]: or });
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

/** Totales de cartera. Canceladas no entran. Vencido es el saldo de las abiertas ya vencidas. */
export function statementTotalsFromDocuments(
  docs: Array<{
    estatus: string;
    estatus_display: string;
    saldo_pendiente: number;
    monto_original: number;
  }>,
): StatementTotalsDto {
  let pendiente = 0;
  let vencido = 0;
  let pagadas = 0;
  for (const d of docs) {
    if (d.estatus === "abierta") pendiente += d.saldo_pendiente;
    if (d.estatus_display === "Vencida") vencido += d.saldo_pendiente;
    if (d.estatus === "pagada") pagadas += d.monto_original;
  }
  return {
    pendiente: roundMoney(pendiente),
    vencido: roundMoney(vencido),
    pagadas: roundMoney(pagadas),
  };
}

export async function getAgingSummary(
  tenantId: string,
  tipo: AccountDocumentTipo,
): Promise<AgingSummaryDto> {
  const documents = await listDocuments(tenantId, { tipo });
  const openWithSaldo = documents.filter((d) => d.estatus === "abierta" && d.saldo_pendiente > 0);
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
  return {
    tipo,
    totals,
    statement: statementTotalsFromDocuments(documents),
    documents: openWithSaldo,
  };
}

export interface CreateDocumentInput {
  tipo: AccountDocumentTipo;
  client_id?: string | null;
  supplier_id?: string | null;
  entidad_nombre?: string;
  folio: string;
  concepto: string;
  conceptos?: DocumentConcepto[];
  fecha_emision: string;
  fecha_ingreso_cobranza?: string | null;
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
  t?: Transaction,
): Promise<{ client_id: string | null; supplier_id: string | null; entidad_nombre: string }> {
  if (input.tipo === "cxc") {
    if (!input.client_id && !input.entidad_nombre?.trim()) {
      throw httpError("Cliente requerido para CXC", 400);
    }
    let nombre = input.entidad_nombre?.trim() || "";
    if (input.client_id) {
      const c = await Client.findOne({
        where: { id: input.client_id, tenant_id: tenantId },
        transaction: t,
      });
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
    const s = await Supplier.findOne({
      where: { id: input.supplier_id, tenant_id: tenantId },
      transaction: t,
    });
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
  const entity = await resolveEntityName(tenantId, input, t);
  const plazo =
    input.plazo_credito_dias != null && Number.isFinite(input.plazo_credito_dias)
      ? Math.floor(input.plazo_credito_dias)
      : null;
  const cobranza = input.fecha_ingreso_cobranza?.trim() || null;
  const venc =
    input.fecha_vencimiento?.trim() ||
    resolveDueDate(cobranza || input.fecha_emision, plazo);

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
      conceptos: input.conceptos ?? [
        { descripcion: input.concepto.trim(), precio: roundMoney(input.monto_original) },
      ],
      fecha_emision: input.fecha_emision,
      fecha_ingreso_cobranza: cobranza,
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
    conceptos: DocumentConcepto[];
    fecha_emision: string;
    fecha_ingreso_cobranza: string | null;
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
  if (patch.conceptos !== undefined) {
    const conceptos = validateConceptos(patch.conceptos);
    const total = sumConceptos(conceptos);
    if (total < abonado) {
      throw httpError("El monto no puede ser menor a los abonos realizados", 400);
    }
    data.conceptos = conceptos;
    data.concepto = summarizeConceptos(conceptos);
    data.monto_original = String(roundMoney(total));
  } else {
    if (patch.concepto !== undefined) data.concepto = patch.concepto.trim();
    if (patch.monto_original !== undefined) {
      if (patch.monto_original < abonado) {
        throw httpError("El monto no puede ser menor a los abonos realizados", 400);
      }
      data.monto_original = String(roundMoney(patch.monto_original));
    }
    // Legacy single-field edits must keep conceptos in sync with concepto + monto.
    if (patch.concepto !== undefined || patch.monto_original !== undefined) {
      const desc =
        patch.concepto !== undefined ? patch.concepto.trim() : String(doc.concepto ?? "");
      const monto =
        patch.monto_original !== undefined
          ? roundMoney(patch.monto_original)
          : roundMoney(num(doc.monto_original));
      data.conceptos = conceptosFromLegacy(desc, monto);
    }
  }
  if (patch.fecha_emision !== undefined) data.fecha_emision = patch.fecha_emision;
  if (patch.plazo_credito_dias !== undefined) {
    data.plazo_credito_dias = patch.plazo_credito_dias;
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
  if (patch.fecha_ingreso_cobranza !== undefined) {
    data.fecha_ingreso_cobranza = patch.fecha_ingreso_cobranza?.trim() || null;
  }
  const cobranza =
    patch.fecha_ingreso_cobranza !== undefined
      ? patch.fecha_ingreso_cobranza?.trim() || null
      : doc.fecha_ingreso_cobranza
        ? String(doc.fecha_ingreso_cobranza).slice(0, 10)
        : null;
  if (patch.fecha_vencimiento !== undefined) {
    data.fecha_vencimiento = patch.fecha_vencimiento;
  } else if (
    patch.fecha_emision !== undefined ||
    patch.plazo_credito_dias !== undefined ||
    patch.fecha_ingreso_cobranza !== undefined
  ) {
    data.fecha_vencimiento = nextDueDate({
      fechaEmision: emision,
      fechaCobranza: cobranza,
      plazo,
    });
  }

  await doc.update(data as never);
  await refreshDocumentStatus(doc, payments);
  await doc.reload();
  const syncPatch = { ...patch };
  if (patch.conceptos !== undefined) {
    const conceptos = validateConceptos(patch.conceptos);
    syncPatch.monto_original = sumConceptos(conceptos);
    syncPatch.concepto = summarizeConceptos(conceptos);
  } else if (data.conceptos !== undefined) {
    syncPatch.conceptos = data.conceptos as DocumentConcepto[];
    if (data.concepto !== undefined) syncPatch.concepto = String(data.concepto);
    if (data.monto_original !== undefined) syncPatch.monto_original = num(data.monto_original);
  }
  await syncDocumentToSource(doc, syncPatch);
  return getDocument(tenantId, id);
}

/** Propaga cambios editados en el documento CXC/CXP hacia la entidad de origen. */
async function syncDocumentToSource(
  doc: AccountDocument,
  patch: Partial<{
    folio: string;
    concepto: string;
    conceptos: DocumentConcepto[];
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
    const mPatch = maintenancePatchFromAccount(patch);
    if (patch.fecha_emision !== undefined) mPatch.fecha = patch.fecha_emision;
    if (patch.supplier_id !== undefined) mPatch.supplier_id = patch.supplier_id;
    if (patch.entidad_nombre !== undefined) mPatch.taller = patch.entidad_nombre.trim();
    if (Object.keys(mPatch).length) await record.update(mPatch as never);
    return;
  }

  if (doc.origen === "viaje" && doc.trip_id) {
    const trip = await Trip.findOne({
      where: { id: doc.trip_id, tenant_id: doc.tenant_id },
    });
    if (!trip) return;
    const carta = await CartaPorte.findOne({
      where: { tenant_id: doc.tenant_id, trip_id: trip.id },
    });
    const omitirMontoYFolio = viajeSyncOmiteMontoYFolio(carta);
    const tripPatch: Record<string, unknown> = {};
    if (!omitirMontoYFolio && patch.monto_original !== undefined) {
      tripPatch.tarifa = roundMoney(patch.monto_original);
    }
    if (!omitirMontoYFolio && patch.folio !== undefined) {
      tripPatch.num_factura = patch.folio.trim() || null;
    }
    if (patch.client_id !== undefined) tripPatch.client_id = patch.client_id;
    if (Object.keys(tripPatch).length) await trip.update(tripPatch as never);
  }
}

async function refreshDocumentStatus(
  doc: AccountDocument,
  payments: AccountDocumentPayment[],
  t?: Transaction,
) {
  if (doc.estatus === "cancelada") return;
  const saldo = roundMoney(Math.max(0, num(doc.monto_original) - paidTotal(payments)));
  const next: AccountDocumentEstatus = saldo <= 0 ? "pagada" : "abierta";
  if (doc.estatus !== next) {
    await doc.update({ estatus: next } as never, { transaction: t });
  }
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

  if (doc.origen === "viaje" && doc.tipo === "cxc" && doc.trip_id) {
    const carta = await CartaPorte.findOne({
      where: {
        tenant_id: tenantId,
        trip_id: doc.trip_id,
        estatus: "timbrada",
        tipo_comprobante: "ingreso",
      },
    });
    if (carta?.xml_timbrado) {
      const snap = parseInvoiceTaxSnapshot(carta.xml_timbrado);
      if (
        documentoRequiereComplemento(snap, {
          tipo: doc.tipo,
          origen: doc.origen,
          estatus: doc.estatus,
          client_id: doc.client_id,
        })
      ) {
        throw httpError("Esta factura PPD se cobra con complemento de pago", 400);
      }
    }
  }

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

/** Si el documento ya existe, conserva su nombre hasta que haya un proveedor de catálogo. */
async function entidadSinProveedor(
  tenantId: string,
  sourceField: "maintenance_record_id" | "expense_id",
  sourceId: string,
  fallback: string,
  t?: Transaction,
): Promise<string> {
  const existing = await AccountDocument.findOne({
    where: { tenant_id: tenantId, [sourceField]: sourceId },
    attributes: ["entidad_nombre"],
    transaction: t,
  });
  const prev = existing?.entidad_nombre?.trim();
  return prev || fallback;
}

/**
 * Combustible no entra al catálogo por el nombre de la estación.
 * Un proveedor `manual` ya elegido se respeta; uno `auto` se suelta.
 */
async function resolveFuelTicketParty(ticket: FuelTicket): Promise<{
  supplierId: string | null;
  nombre: string;
  plazo: number | null;
}> {
  const estacion = ticket.ubicacion?.trim() || "Gasolinera";
  const linked = ticket.supplier_id ? await Supplier.findByPk(ticket.supplier_id) : null;

  if (linked && linked.origen === "manual") {
    return {
      supplierId: linked.id,
      nombre: linked.razon_social,
      plazo: linked.dias_credito ?? null,
    };
  }
  if (ticket.supplier_id) {
    await ticket.update({ supplier_id: null } as never);
  }
  return { supplierId: null, nombre: estacion, plazo: null };
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
  input: CreateDocumentInput & {
    reopenIfCancelada?: boolean;
    preserveCobranzaIfSet?: boolean;
  },
  t?: Transaction,
): Promise<AccountDocumentDto | null> {
  const existing = await AccountDocument.findOne({
    where: { tenant_id: tenantId, [sourceField]: sourceId },
    transaction: t,
    lock: t ? t.LOCK.UPDATE : undefined,
  });
  if (existing) {
    if (existing.estatus === "cancelada" && !input.reopenIfCancelada) {
      return toDocumentDto(existing, []);
    }
    const payments = await AccountDocumentPayment.findAll({
      where: { tenant_id: tenantId, document_id: existing.id },
      transaction: t,
    });
    const abonado = paidTotal(payments);
    if (input.monto_original < abonado) {
      // keep current monto if new amount would break payments
      return toDocumentDto(existing, payments);
    }
    const entity = await resolveEntityName(tenantId, input, t);
    const plazo =
      input.plazo_credito_dias != null && Number.isFinite(input.plazo_credito_dias)
        ? Math.floor(input.plazo_credito_dias)
        : null;
    const cobranza = cobranzaAConservar(
      existing.fecha_ingreso_cobranza,
      input.fecha_ingreso_cobranza,
      input.preserveCobranzaIfSet === true,
    );
    const venc = nextDueDate({
      fechaEmision: input.fecha_emision,
      fechaCobranza: cobranza,
      plazo,
      fechaVencimientoExplicita: input.fecha_vencimiento,
    });
    await existing.update({
      client_id: entity.client_id,
      supplier_id: entity.supplier_id,
      entidad_nombre: entity.entidad_nombre,
      folio: input.folio.trim(),
      concepto: input.concepto.trim(),
      conceptos: input.conceptos ?? [
        { descripcion: input.concepto.trim(), precio: roundMoney(input.monto_original) },
      ],
      fecha_emision: input.fecha_emision,
      fecha_ingreso_cobranza: cobranza,
      plazo_credito_dias: plazo,
      fecha_vencimiento: venc,
      monto_original: String(roundMoney(input.monto_original)),
      estatus: "abierta",
    } as never, { transaction: t });
    await refreshDocumentStatus(existing, payments, t);
    return toDocumentDto(existing, payments);
  }
  if (input.monto_original <= 0) return null;
  return createDocument(tenantId, { ...input, [sourceField]: sourceId }, t);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function cxcMontoDesdeTarifa(tarifa: number): number {
  return computeTripInvoiceTaxes(tarifa).total;
}

/** `Total` del comprobante timbrado. No usa `TotalImpuestosTrasladados` ni otros nodos. */
export function totalCfdiDesdeXml(xml: string | null | undefined): number | null {
  if (!xml?.trim()) return null;
  const tag = xml.match(/<(?:[\w.-]+:)?Comprobante\b([^>]*)>/);
  if (!tag?.[1]) return null;
  const raw = tag[1].match(/\bTotal="([^"]+)"/) ?? tag[1].match(/\bTotal='([^']+)'/);
  if (!raw?.[1]) return null;
  const n = Number(raw[1]);
  if (!Number.isFinite(n)) return null;
  return round2(n);
}

/** Misma suma que `mapConceptos` arma para el payload de ingreso. */
function totalDesdeConceptosCfdi(conceptos: TripCfdiConcepto[], taxOpts: InvoiceTaxOpts): number {
  let total = 0;
  for (const line of conceptos) {
    const importe = round2(Number(line.valor_unitario) * Number(line.cantidad || 1));
    const taxes = computeTripInvoiceTaxes(importe, taxOpts);
    const gravado = line.objeto_imp !== "01";
    const iva = gravado ? taxes.iva : 0;
    const retencion = gravado ? taxes.retencion : 0;
    total = round2(total + taxes.subtotal + iva - retencion);
  }
  return total;
}

/**
 * Monto CXC de un ingreso timbrado.
 * Prioridad: `Total` del XML, luego conceptos CFDI con las mismas tasas, luego la tarifa.
 */
export function cxcMontoFiscal(input: {
  tarifa: number;
  xml?: string | null;
  conceptos?: TripCfdiConcepto[] | null;
  taxOpts?: InvoiceTaxOpts;
}): number {
  const desdeXml = totalCfdiDesdeXml(input.xml);
  if (desdeXml != null) return desdeXml;
  const taxOpts = input.taxOpts ?? {};
  const conceptos = Array.isArray(input.conceptos) ? input.conceptos : [];
  if (conceptos.length > 0) return totalDesdeConceptosCfdi(conceptos, taxOpts);
  return computeTripInvoiceTaxes(input.tarifa, taxOpts).total;
}

async function taxOptsDesdeTenant(tenantId: string): Promise<InvoiceTaxOpts> {
  const tenant = await Tenant.findByPk(tenantId);
  const iva = tenant?.iva_tasa_default != null ? num(tenant.iva_tasa_default) : undefined;
  const retencion = tenant?.retencion_tasa_default != null ? num(tenant.retencion_tasa_default) : undefined;
  return {
    ivaTasa: iva != null && Number.isFinite(iva) ? iva : undefined,
    retencionTasa: retencion != null && Number.isFinite(retencion) ? retencion : undefined,
  };
}

async function montoCxcDeIngresoTimbrado(
  trip: Pick<Trip, "tenant_id" | "tarifa" | "cfdi_conceptos">,
  xml: string | null | undefined,
): Promise<number> {
  const desdeXml = totalCfdiDesdeXml(xml);
  if (desdeXml != null) return desdeXml;
  const taxOpts = await taxOptsDesdeTenant(trip.tenant_id);
  return cxcMontoFiscal({
    tarifa: num(trip.tarifa),
    conceptos: trip.cfdi_conceptos,
    taxOpts,
  });
}

export function folioCxcTimbrado(
  carta: { serie: string | null; folio_cfdi: string | null },
  numFactura: string | null | undefined,
): string {
  const serie = carta.serie?.trim() || "";
  const folio = carta.folio_cfdi?.trim() || "";
  if (serie && folio) return `${serie}-${folio}`;
  if (folio) return folio;
  return (numFactura ?? "").trim();
}

export function debeSincronizarCxc(input: {
  estatus: string;
  tipo_comprobante: string | null;
  monto: number;
}): boolean {
  return (
    input.estatus === "timbrada" &&
    input.tipo_comprobante === "ingreso" &&
    input.monto > 0
  );
}

/** El backfill de viajes solo crea la CXC que falta; una ya existente, incluso cancelada, no se reescribe. */
export function backfillOmiteCxcExistente(yaExiste: boolean): boolean {
  return yaExiste;
}

/** Ingreso ya timbrado: el total fiscal y el folio CFDI no se escriben de vuelta en tarifa ni num_factura. */
export function viajeSyncOmiteMontoYFolio(
  carta: { estatus: string; tipo_comprobante: string | null } | null,
): boolean {
  return carta?.estatus === "timbrada" && carta.tipo_comprobante === "ingreso";
}

export async function upsertFromStampedIngreso(
  trip: Trip,
  carta: {
    estatus: string;
    tipo_comprobante: string | null;
    timbrado_at: Date | null;
    serie: string | null;
    folio_cfdi: string | null;
    xml_timbrado?: string | null;
  },
): Promise<AccountDocumentDto | null> {
  const monto = await montoCxcDeIngresoTimbrado(trip, carta.xml_timbrado);
  if (
    !debeSincronizarCxc({
      estatus: carta.estatus,
      tipo_comprobante: carta.tipo_comprobante,
      monto,
    })
  ) {
    return null;
  }
  const client = await Client.findOne({
    where: { id: trip.client_id, tenant_id: trip.tenant_id },
  });
  const plazo = client?.dias_credito ?? null;
  const emision = trip.fecha_llegada
    ? localDateStr(new Date(trip.fecha_llegada))
    : trip.fecha_salida
      ? localDateStr(new Date(trip.fecha_salida))
      : localDateStr();
  return upsertBySource(trip.tenant_id, "trip_id", trip.id, {
    tipo: "cxc",
    client_id: trip.client_id,
    entidad_nombre: client?.razon_social,
    folio: folioCxcTimbrado(carta, trip.num_factura),
    concepto: `Servicio de transporte ${tripRouteLabelFromModel(trip)}`,
    fecha_emision: emision,
    fecha_ingreso_cobranza: carta.timbrado_at
      ? localDateStr(new Date(carta.timbrado_at))
      : localDateStr(),
    plazo_credito_dias: plazo,
    monto_original: monto,
    origen: "viaje",
    preserveCobranzaIfSet: true,
  });
}

export async function upsertFromFuelTicket(
  ticket: FuelTicket,
): Promise<AccountDocumentDto | null> {
  const monto = num(ticket.importe_total);
  if (monto <= 0) return null;
  const party = await resolveFuelTicketParty(ticket);
  const folio = ticket.folio?.trim() || `COMB-${ticket.id.slice(0, 8).toUpperCase()}`;
  return upsertBySource(ticket.tenant_id, "fuel_ticket_id", ticket.id, {
    tipo: "cxp",
    supplier_id: party.supplierId,
    entidad_nombre: party.nombre,
    folio,
    concepto: `Combustible ${num(ticket.litros)} L @ ${ticket.ubicacion}`,
    fecha_emision: String(ticket.fecha).slice(0, 10),
    plazo_credito_dias: party.plazo,
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
  const emision = localDateStr(new Date(load.fecha));
  const folio = `COMB-L-${load.id.slice(0, 8).toUpperCase()}`;
  return upsertBySource(load.tenant_id, "fuel_load_id", load.id, {
    tipo: "cxp",
    supplier_id: null,
    entidad_nombre: nombre,
    folio,
    concepto: `Combustible viaje ${num(load.litros)} L`,
    fecha_emision: emision,
    plazo_credito_dias: null,
    monto_original: monto,
    origen: "combustible",
  });
}

export type MaintenanceCxpSyncPlan =
  | { action: "noop" }
  | { action: "cancel" }
  | { action: "upsert" }
  | { action: "reject"; message: string };

export function planMaintenanceCxpSync(
  monto: number,
  existing: { estatus: string } | null,
  abonado: number,
  paymentCount: number,
): MaintenanceCxpSyncPlan {
  const linked = existing && existing.estatus !== "cancelada" ? existing : null;
  if (!linked) {
    return monto <= 0 ? { action: "noop" } : { action: "upsert" };
  }
  if (monto <= 0) {
    if (paymentCount > 0 || abonado > 0) {
      return { action: "reject", message: "No se puede dejar en 0/negativo un CXP con abonos" };
    }
    return { action: "cancel" };
  }
  if (monto < abonado) {
    return { action: "reject", message: "El monto no puede ser menor a los abonos realizados" };
  }
  return { action: "upsert" };
}

async function loadLinkedMaintenanceCxp(
  tenantId: string,
  maintenanceRecordId: string,
  t?: Transaction,
) {
  const existing = await AccountDocument.findOne({
    where: { tenant_id: tenantId, maintenance_record_id: maintenanceRecordId },
    transaction: t,
    lock: t ? t.LOCK.UPDATE : undefined,
  });
  if (!existing) {
    return { existing: null, payments: [] as AccountDocumentPayment[], abonado: 0 };
  }
  const payments = await AccountDocumentPayment.findAll({
    where: { tenant_id: tenantId, document_id: existing.id },
    transaction: t,
  });
  return { existing, payments, abonado: paidTotal(payments) };
}

export async function assertMaintenanceCxpSyncAllowed(
  tenantId: string,
  maintenanceRecordId: string,
  monto: number,
  t?: Transaction,
): Promise<void> {
  const { existing, payments, abonado } = await loadLinkedMaintenanceCxp(
    tenantId,
    maintenanceRecordId,
    t,
  );
  const plan = planMaintenanceCxpSync(monto, existing, abonado, payments.length);
  if (plan.action === "reject") throw httpError(plan.message, 400);
}

export async function upsertFromMaintenance(
  record: MaintenanceRecord,
  t?: Transaction,
): Promise<AccountDocumentDto | null> {
  const projected = maintenanceCxpProjection(record);
  const monto = projected.monto;
  const { existing, payments, abonado } = await loadLinkedMaintenanceCxp(
    record.tenant_id,
    record.id,
    t,
  );
  const plan = planMaintenanceCxpSync(monto, existing, abonado, payments.length);
  if (plan.action === "reject") throw httpError(plan.message, 400);
  if (plan.action === "noop") return null;
  if (plan.action === "cancel" && existing) {
    await existing.update({ estatus: "cancelada" } as never, { transaction: t });
    return toDocumentDto(existing, payments);
  }

  let supplierId = record.supplier_id;
  let nombre = record.taller?.trim() || "Taller";
  let plazo: number | null = null;
  if (supplierId) {
    const s = await Supplier.findByPk(supplierId, { transaction: t });
    if (s) {
      nombre = s.razon_social;
      plazo = s.dias_credito ?? null;
    }
  } else {
    supplierId = null;
    nombre = await entidadSinProveedor(
      record.tenant_id,
      "maintenance_record_id",
      record.id,
      nombre,
      t,
    );
  }
  return upsertBySource(
    record.tenant_id,
    "maintenance_record_id",
    record.id,
    {
      tipo: "cxp",
      supplier_id: supplierId,
      entidad_nombre: nombre,
      folio: projected.folio,
      concepto: projected.concepto,
      conceptos: projected.conceptos,
      fecha_emision: String(record.fecha).slice(0, 10),
      plazo_credito_dias: plazo,
      monto_original: monto,
      origen: "mantenimiento",
      reopenIfCancelada: true,
    },
    t,
  );
}

export async function upsertFromExpense(
  expense: Expense,
): Promise<AccountDocumentDto | null> {
  if (expense.tipo !== "gasto") return null;
  const monto = num(expense.monto);
  if (monto <= 0) return null;
  let supplierId = expense.supplier_id;
  let nombre = expense.descripcion?.trim() || `Gasto ${expense.categoria}`;
  let plazo: number | null = null;
  if (supplierId) {
    const s = await Supplier.findByPk(supplierId);
    if (s) {
      nombre = s.razon_social;
      plazo = s.dias_credito ?? null;
    }
  } else {
    supplierId = null;
    nombre = await entidadSinProveedor(expense.tenant_id, "expense_id", expense.id, nombre);
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

/** Corrige el monto de una CXC ya creada para que coincida con el total fiscal. No reabre canceladas. */
async function alinearMontoCxc(doc: AccountDocument, monto: number): Promise<boolean> {
  if (doc.estatus === "cancelada") return false;
  const next = roundMoney(monto);
  if (!(next > 0)) return false;
  if (roundMoney(num(doc.monto_original)) === next) return false;
  const payments = await AccountDocumentPayment.findAll({
    where: { tenant_id: doc.tenant_id, document_id: doc.id },
  });
  const abonado = paidTotal(payments);
  if (next < abonado) {
    console.warn(
      `[cxc] No se ajusta ${doc.folio}: el total del CFDI (${next}) es menor que los abonos (${abonado})`,
    );
    return false;
  }
  const parsed = parseConceptosJson(doc.conceptos);
  const patch: Record<string, unknown> = { monto_original: String(next) };
  if (parsed.length <= 1) {
    const descripcion = (parsed[0]?.descripcion || doc.concepto || "Servicio de transporte").trim();
    patch.conceptos = [{ descripcion, precio: next }];
  }
  await doc.update(patch as never);
  await refreshDocumentStatus(doc, payments);
  return true;
}

export async function backfillTenant(tenantId: string): Promise<{
  cxc: number;
  cxp: number;
}> {
  let cxc = 0;
  let cxp = 0;

  const trips = await Trip.findAll({ where: { tenant_id: tenantId } });
  for (const trip of trips) {
    const carta = await CartaPorte.findOne({
      where: { tenant_id: tenantId, trip_id: trip.id },
    });
    if (!carta) continue;
    const monto = await montoCxcDeIngresoTimbrado(trip, carta.xml_timbrado);
    if (
      !debeSincronizarCxc({
        estatus: carta.estatus,
        tipo_comprobante: carta.tipo_comprobante,
        monto,
      })
    ) {
      continue;
    }
    const existente = await AccountDocument.findOne({
      where: {
        tenant_id: tenantId,
        trip_id: trip.id,
        origen: "viaje",
        tipo: "cxc",
      },
    });
    if (existente && backfillOmiteCxcExistente(true)) {
      if (await alinearMontoCxc(existente, monto)) cxc += 1;
      continue;
    }
    const r = await upsertFromStampedIngreso(trip, carta);
    if (r) cxc += 1;
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
