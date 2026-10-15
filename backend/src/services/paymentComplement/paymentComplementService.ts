import { randomUUID } from "node:crypto";
import { Op, Transaction } from "sequelize";
import {
  AccountDocument,
  AccountDocumentPayment,
  CartaPorte,
  CfdiPago,
  CfdiPagoDocumento,
  Client,
  sequelize,
  Tenant,
} from "../../models";
import { roundMoney } from "../calc";
import type { TimbradoResult } from "../pac/types";
import { resolveSicofiBaseUrl, resolveSicofiPagos40Url } from "../pac/sicofi/config";
import { getSicofiAccessToken, invalidateSicofiAccessToken } from "../pac/sicofi/sicofiAuth";
import { isSicofiHttp401, sicofiPostPagos40 } from "../pac/sicofi/sicofiClient";
import { decryptSecret } from "../../utils/fiscalCrypto";
import { localDateStr, localDateTimeSatStr } from "../../utils/localDates";
import { num } from "../../utils/numbers";
import { buildDraftLines, ComplementError, type DraftLine } from "./buildDraftLines";
import { buildPagos40Payload } from "./buildPagos40Payload";
import { parseInvoiceTaxSnapshot } from "./invoiceTaxSnapshot";
import { renderPagoPdf, writePagoPdf } from "./renderPagoPdf";
import type { TaxComponent } from "./taxComponent";

export { ComplementError };

const PAYMENT_IDS_MARK = "\n__payment_ids:";

export const complementDeps = {
  postPagos40: sicofiPostPagos40,
  accessToken: getSicofiAccessToken,
  invalidateToken: invalidateSicofiAccessToken,
};

export interface CreateComplementInput {
  clientId: string;
  fechaPago: string;
  formaPagoP: string;
  monedaP: string;
  tipoCambioP: number;
  numOperacion?: string;
  documentos: { documentId: string; monto: number }[];
}

export interface ComplementDto {
  id: string;
  estatus: "error" | "timbrado";
  uuid?: string;
  serie: string;
  folio: string;
  monto: number;
  error_mensaje?: string;
  lineas: { document_id: string; num_parcialidad: number; imp_pagado: number; imp_saldo_insoluto: number }[];
}

type LinkMode = { kind: "create" } | { kind: "link"; paymentIds: string[] };

export function documentoRequiereComplemento(
  snap: { metodoPago?: string } | null,
  doc: {
    tipo: string;
    origen: string;
    estatus: string;
    client_id: string | null;
  },
): boolean {
  return (
    doc.tipo === "cxc" &&
    doc.origen === "viaje" &&
    doc.estatus !== "cancelada" &&
    Boolean(doc.client_id) &&
    snap?.metodoPago === "PPD"
  );
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function taxKey(tax: TaxComponent): string {
  return `${tax.tipo}|${tax.impuesto}|${tax.tipoFactor}|${tax.tasaOCuota}`;
}

function asTaxes(value: unknown): TaxComponent[] {
  if (Array.isArray(value)) return value as TaxComponent[];
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed) ? (parsed as TaxComponent[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

/** Suma impuestos de todas las parcialidades timbradas. La que cierra resta este total al XML. */
function sumTaxes(lines: { impuestos?: unknown }[]): TaxComponent[] {
  const map = new Map<string, TaxComponent>();
  for (const line of lines) {
    for (const tax of asTaxes(line.impuestos)) {
      const key = taxKey(tax);
      const existing = map.get(key);
      if (existing) {
        existing.base = round2(existing.base + num(tax.base));
        existing.importe = round2(existing.importe + num(tax.importe));
        continue;
      }
      map.set(key, {
        ...tax,
        base: round2(num(tax.base)),
        importe: round2(num(tax.importe)),
      });
    }
  }
  return [...map.values()];
}

function annotate(message: string, paymentIds: string[] | null): string {
  if (!paymentIds?.length) return message;
  return `${message}${PAYMENT_IDS_MARK}${paymentIds.join(",")}`;
}

function parseAnnotated(message: string | null | undefined): { text: string; paymentIds: string[] } {
  if (!message) return { text: "", paymentIds: [] };
  const idx = message.indexOf(PAYMENT_IDS_MARK);
  if (idx < 0) return { text: message, paymentIds: [] };
  const paymentIds = message
    .slice(idx + PAYMENT_IDS_MARK.length)
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  return { text: message.slice(0, idx), paymentIds };
}

function toComplementDto(pago: {
  id: string;
  estatus: "error" | "timbrado";
  uuid?: string | null;
  serie: string;
  folio: string;
  monto: unknown;
  error_mensaje?: string | null;
}, lineas: DraftLine[]): ComplementDto {
  const text = parseAnnotated(pago.error_mensaje).text.trim();
  return {
    id: pago.id,
    estatus: pago.estatus,
    uuid: pago.uuid || undefined,
    serie: pago.serie,
    folio: String(pago.folio),
    monto: num(pago.monto),
    error_mensaje: text || undefined,
    lineas: lineas.map((linea) => ({
      document_id: linea.documentId,
      num_parcialidad: linea.numParcialidad,
      imp_pagado: linea.impPagado,
      imp_saldo_insoluto: linea.impSaldoInsoluto,
    })),
  };
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "Error al timbrar el complemento";
}

async function loadTenant(tenantId: string): Promise<{
  tenant: Tenant;
  serie: string;
  usuario: string;
  contrasena: string;
  cpFiscal: string;
}> {
  const tenant = await Tenant.findByPk(tenantId);
  if (!tenant) throw new ComplementError("Empresa no encontrada", 404);
  const cpFiscal = tenant.cp_fiscal?.trim() ?? "";
  const usuario = tenant.pac_usuario?.trim() ?? "";
  const tokenEnc = tenant.pac_token_enc?.trim() ?? "";
  if (!cpFiscal || !usuario || !tokenEnc) {
    throw new ComplementError("Faltan datos fiscales o credenciales PAC", 400);
  }
  let contrasena = "";
  try {
    contrasena = decryptSecret(tokenEnc);
  } catch {
    throw new ComplementError("No se pudo descifrar la contraseña Sicofi", 400);
  }
  if (!contrasena) throw new ComplementError("No se pudo descifrar la contraseña Sicofi", 400);
  return {
    tenant,
    serie: tenant.cfdi_serie_pago?.trim() || "P",
    usuario,
    contrasena,
    cpFiscal,
  };
}

async function loadClient(tenantId: string, clientId: string): Promise<Client> {
  const client = await Client.findByPk(clientId);
  if (!client || client.tenant_id !== tenantId) throw new ComplementError("Cliente no encontrado", 404);
  if (!client.rfc?.trim() || !client.razon_social?.trim() || !client.cp?.trim() || !client.regimen_fiscal?.trim()) {
    throw new ComplementError("El cliente no tiene datos fiscales completos", 400);
  }
  return client;
}

function nextFolio(rows: { folio?: string | null }[]): string {
  let max = 0;
  for (const row of rows) {
    const n = Number.parseInt(String(row.folio ?? ""), 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return String(max + 1);
}

async function postPagos(
  tenant: Tenant,
  usuario: string,
  contrasena: string,
  body: Record<string, unknown>,
): Promise<TimbradoResult> {
  const base = resolveSicofiBaseUrl(tenant);
  const url = resolveSicofiPagos40Url(tenant);
  let accessToken = await complementDeps.accessToken(base, usuario, contrasena);
  try {
    return await complementDeps.postPagos40(url, body, accessToken);
  } catch (error) {
    if (!isSicofiHttp401(error)) throw error;
    complementDeps.invalidateToken(base, usuario);
    accessToken = await complementDeps.accessToken(base, usuario, contrasena, { forceRefresh: true });
    return complementDeps.postPagos40(url, body, accessToken);
  }
}

function payloadBody(input: {
  serie: string;
  folio: string;
  cpFiscal: string;
  formaPagoP: string;
  fechaPago: string;
  monedaP: string;
  tipoCambioP: number;
  numOperacion: string;
  client: Client;
  lineas: DraftLine[];
  usuario: string;
  contrasena: string;
}): Record<string, unknown> {
  const payload = buildPagos40Payload({
    serie: input.serie,
    folio: Number(input.folio),
    fechaCfdi: localDateTimeSatStr(),
    lugarExpedicion: input.cpFiscal,
    formaPagoP: input.formaPagoP,
    fechaPago: input.fechaPago,
    monedaP: input.monedaP,
    tipoCambioP: input.tipoCambioP,
    numOperacion: input.numOperacion,
    receptor: {
      rfc: input.client.rfc,
      razonSocial: input.client.razon_social,
      domicilioFiscal: input.client.cp ?? "",
      regimenFiscal: input.client.regimen_fiscal ?? "",
    },
    lineas: input.lineas,
  });
  return {
    Usuario: input.usuario,
    Contrasena: input.contrasena,
    ...payload,
  };
}

async function refreshStatuses(docs: AccountDocument[], tenantId: string, transaction: Transaction) {
  for (const doc of docs) {
    if (doc.estatus === "cancelada") continue;
    const pays = await AccountDocumentPayment.findAll({
      where: { tenant_id: tenantId, document_id: doc.id },
      transaction,
    });
    const paid = roundMoney(pays.reduce((sum, pay) => sum + num(pay.monto), 0));
    const saldo = roundMoney(num(doc.monto_original) - paid);
    const next = saldo <= 0 ? "pagada" : "abierta";
    if (doc.estatus !== next) await doc.update({ estatus: next }, { transaction });
  }
}

async function finishStamp(input: {
  tenant: Tenant;
  usuario: string;
  contrasena: string;
  tenantId: string;
  pago: CfdiPago;
  draft: DraftLine[];
  body: Record<string, unknown>;
  docs: AccountDocument[];
  mode: LinkMode;
  fechaPago: string;
  numOperacion: string | null;
  userId: string | null;
}): Promise<ComplementDto> {
  const paymentIds = input.mode.kind === "link" ? input.mode.paymentIds : null;
  let result: TimbradoResult;
  try {
    result = await postPagos(input.tenant, input.usuario, input.contrasena, input.body);
  } catch (error) {
    if (error instanceof ComplementError) throw error;
    const message = messageOf(error);
    await input.pago.update({ error_mensaje: annotate(message, paymentIds) });
    return toComplementDto(input.pago, input.draft);
  }

  const stampedAt = new Date(result.fechaTimbrado);
  await sequelize.transaction(async (transaction) => {
    await input.pago.update(
      {
        estatus: "timbrado",
        uuid: result.uuid,
        xml_timbrado: result.xmlTimbrado,
        timbrado_at: Number.isNaN(stampedAt.getTime()) ? new Date() : stampedAt,
        error_mensaje: null,
      },
      { transaction },
    );
    if (input.mode.kind === "link") {
      await AccountDocumentPayment.update(
        { cfdi_pago_id: input.pago.id },
        {
          where: { id: input.mode.paymentIds, tenant_id: input.tenantId, cfdi_pago_id: null },
          transaction,
        },
      );
    } else {
      await AccountDocumentPayment.bulkCreate(
        input.draft.map((linea) => ({
          id: randomUUID(),
          tenant_id: input.tenantId,
          document_id: linea.documentId,
          monto: String(roundMoney(linea.impPagado)),
          fecha: input.fechaPago,
          nota: input.numOperacion,
          cfdi_pago_id: input.pago.id,
          created_by: input.userId,
        })) as never,
        { transaction },
      );
    }
    await refreshStatuses(input.docs, input.tenantId, transaction);
  });

  const pdf = await renderPagoPdf();
  const pdfPath = await writePagoPdf(input.pago.id, input.tenantId, pdf);
  await input.pago.update({ pdf_path: pdfPath });
  return toComplementDto(input.pago, input.draft);
}

async function draftFromDocuments(
  tenantId: string,
  input: CreateComplementInput,
  transaction: Transaction,
  modo: "nuevo" | "existente",
): Promise<{ docs: AccountDocument[]; draft: DraftLine[]; folio: string }> {
  const documentIds = input.documentos.map((doc) => doc.documentId);
  if (new Set(documentIds).size !== documentIds.length) {
    throw new ComplementError("Documento repetido");
  }

  const found = await AccountDocument.findAll({
    where: { id: { [Op.in]: documentIds }, tenant_id: tenantId },
    lock: Transaction.LOCK.UPDATE,
    transaction,
  });
  const byId = new Map(found.map((doc) => [doc.id, doc]));
  const docs = documentIds.map((id) => byId.get(id));
  if (docs.some((doc) => !doc)) throw new ComplementError("Documento no encontrado", 404);
  const locked = docs as AccountDocument[];

  const sources = [];
  for (const requested of input.documentos) {
    const doc = byId.get(requested.documentId)!;
    if (doc.tipo !== "cxc" || doc.origen !== "viaje" || !doc.client_id || !doc.trip_id) {
      throw new ComplementError("El documento no admite complemento de pago", 400);
    }
    if (doc.estatus === "cancelada") throw new ComplementError("Documento cancelado", 400);
    if (doc.client_id !== input.clientId) {
      throw new ComplementError("Todos los documentos deben ser del mismo cliente", 400);
    }

    const carta = await CartaPorte.findOne({
      where: {
        tenant_id: tenantId,
        trip_id: doc.trip_id,
        estatus: "timbrada",
        tipo_comprobante: "ingreso",
      },
      transaction,
    });
    if (!carta?.xml_timbrado) {
      throw new ComplementError("La factura no tiene XML timbrado", 400);
    }
    let snap;
    try {
      snap = parseInvoiceTaxSnapshot(carta.xml_timbrado);
    } catch (error) {
      throw new ComplementError(messageOf(error), 400);
    }
    if (!snap.uuid) {
      throw new ComplementError("La factura no tiene UUID", 400);
    }
    if (snap.metodoPago !== "PPD") {
      throw new ComplementError("Solo facturas PPD admiten complemento de pago", 400);
    }

    sources.push({ doc, carta, snap, monto: requested.monto });
  }

  const stampedPagos = await CfdiPago.findAll({
    where: { tenant_id: tenantId, estatus: "timbrado" },
    transaction,
  });
  const errorPagos = await CfdiPago.findAll({
    where: { tenant_id: tenantId, estatus: "error" },
    transaction,
  });
  const storedLines = await CfdiPagoDocumento.findAll({
    where: { tenant_id: tenantId, account_document_id: documentIds },
    order: [["num_parcialidad", "ASC"]],
    transaction,
  });
  const payments = await AccountDocumentPayment.findAll({
    where: { tenant_id: tenantId, document_id: documentIds },
    transaction,
  });

  const stampedIds = new Set(stampedPagos.map((pago) => pago.id));
  const errorIds = new Set(errorPagos.map((pago) => pago.id));
  const pending = storedLines.find(
    (line) => documentIds.includes(line.account_document_id) && errorIds.has(line.cfdi_pago_id),
  );
  if (pending) {
    throw new ComplementError(
      `Hay un complemento pendiente (${pending.cfdi_pago_id}). Reintentalo o descartalo.`,
      409,
    );
  }

  const folioRows = await CfdiPago.findAll({
    where: { tenant_id: tenantId },
    attributes: ["folio"],
    transaction,
  });

  const abonos = new Map<string, number>();
  for (const payment of payments) {
    abonos.set(
      payment.document_id,
      roundMoney((abonos.get(payment.document_id) ?? 0) + num(payment.monto)),
    );
  }

  const draft = buildDraftLines({
    docs: sources.map(({ doc, carta, snap, monto }) => {
      const previous = storedLines
        .filter((line) => line.account_document_id === doc.id && stampedIds.has(line.cfdi_pago_id))
        .sort((a, b) => Number(a.num_parcialidad) - Number(b.num_parcialidad));
      const last = previous.at(-1);
      return {
        documentId: doc.id,
        clientId: doc.client_id ?? input.clientId,
        cartaPorteId: carta.id,
        uuid: snap.uuid,
        serie: snap.serie ?? "",
        folio: snap.folio ?? "",
        moneda: snap.moneda,
        totalXml: snap.total,
        montoOriginal: num(doc.monto_original),
        abonosInternos: abonos.get(doc.id) ?? 0,
        insolutoPrevio: last ? num(last.imp_saldo_insoluto) : null,
        parcialidadPrevia: last ? Number(last.num_parcialidad) : 0,
        fechaComprobante: snap.fecha,
        taxes: snap.taxes,
        previousTaxes: sumTaxes(previous),
        monto,
      };
    }),
    fechaPago: input.fechaPago,
    today: localDateStr(),
    monedaP: input.monedaP,
    tipoCambioP: input.tipoCambioP,
    formaPagoP: input.formaPagoP,
    modo,
  });

  return { docs: locked, draft, folio: nextFolio(folioRows) };
}

async function runComplement(
  tenantId: string,
  userId: string | undefined,
  input: CreateComplementInput,
  mode: LinkMode,
): Promise<ComplementDto> {
  const fiscal = await loadTenant(tenantId);
  const client = await loadClient(tenantId, input.clientId);
  const prepared = await sequelize.transaction(async (transaction) => {
    const { docs, draft, folio } = await draftFromDocuments(
      tenantId,
      input,
      transaction,
      mode.kind === "link" ? "existente" : "nuevo",
    );
    const monto = roundMoney(draft.reduce((sum, linea) => sum + linea.impPagado, 0));
    const paymentIds = mode.kind === "link" ? mode.paymentIds : null;
    const pago = await CfdiPago.create(
      {
        id: randomUUID(),
        tenant_id: tenantId,
        client_id: input.clientId,
        fecha_pago: new Date(`${input.fechaPago}T12:00:00`),
        forma_pago_p: input.formaPagoP,
        moneda_p: input.monedaP,
        tipo_cambio_p: String(input.tipoCambioP),
        monto: monto.toFixed(2),
        num_operacion: input.numOperacion?.trim() || null,
        serie: fiscal.serie,
        folio,
        estatus: "error",
        error_mensaje: annotate("pendiente", paymentIds),
        created_by: userId ?? null,
      } as never,
      { transaction },
    );
    await CfdiPagoDocumento.bulkCreate(
      draft.map((linea) => ({
        id: randomUUID(),
        tenant_id: tenantId,
        cfdi_pago_id: pago.id,
        account_document_id: linea.documentId,
        carta_porte_id: linea.cartaPorteId,
        num_parcialidad: linea.numParcialidad,
        imp_saldo_ant: linea.impSaldoAnt.toFixed(2),
        imp_pagado: linea.impPagado.toFixed(2),
        imp_saldo_insoluto: linea.impSaldoInsoluto.toFixed(2),
        moneda_dr: linea.monedaDr,
        equivalencia_dr: "1.000000",
        objeto_imp_dr: linea.objetoImpDr,
        impuestos: linea.taxes,
      })) as never,
      { transaction },
    );
    return { docs, draft, folio, pago };
  });

  const fechaPagoPayload = `${input.fechaPago}T12:00:00`;
  const body = payloadBody({
    serie: fiscal.serie,
    folio: prepared.folio,
    cpFiscal: fiscal.cpFiscal,
    formaPagoP: input.formaPagoP,
    fechaPago: fechaPagoPayload,
    monedaP: input.monedaP,
    tipoCambioP: input.tipoCambioP,
    numOperacion: input.numOperacion?.trim() ?? "",
    client,
    lineas: prepared.draft,
    usuario: fiscal.usuario,
    contrasena: fiscal.contrasena,
  });

  return finishStamp({
    tenant: fiscal.tenant,
    usuario: fiscal.usuario,
    contrasena: fiscal.contrasena,
    tenantId,
    pago: prepared.pago,
    draft: prepared.draft,
    body,
    docs: prepared.docs,
    mode,
    fechaPago: input.fechaPago,
    numOperacion: input.numOperacion?.trim() || null,
    userId: userId ?? null,
  });
}

export async function createPaymentComplement(
  tenantId: string,
  userId: string | undefined,
  input: CreateComplementInput,
): Promise<ComplementDto> {
  return runComplement(tenantId, userId, input, { kind: "create" });
}

export async function createFromExistingPayments(
  tenantId: string,
  userId: string | undefined,
  input: Omit<CreateComplementInput, "documentos"> & { paymentIds: string[] },
): Promise<ComplementDto> {
  if (input.paymentIds.length < 1) throw new ComplementError("Debe incluir al menos un abono");
  const payments = await AccountDocumentPayment.findAll({
    where: { id: input.paymentIds, tenant_id: tenantId },
  });
  if (payments.length !== input.paymentIds.length) throw new ComplementError("Abono no encontrado", 404);
  for (const payment of payments) {
    if (payment.cfdi_pago_id) throw new ComplementError("El abono ya tiene complemento", 400);
  }
  const sums = new Map<string, number>();
  for (const payment of payments) {
    sums.set(payment.document_id, roundMoney((sums.get(payment.document_id) ?? 0) + num(payment.monto)));
  }
  return runComplement(
    tenantId,
    userId,
    {
      ...input,
      documentos: [...sums.entries()].map(([documentId, monto]) => ({ documentId, monto })),
    },
    { kind: "link", paymentIds: input.paymentIds },
  );
}

function fechaPagoPayload(value: Date | string): string {
  if (value instanceof Date) return localDateTimeSatStr(value);
  const text = String(value);
  if (text.includes("T")) return text.slice(0, 19);
  return `${text.slice(0, 10)}T12:00:00`;
}

function fechaOnly(value: Date | string): string {
  if (value instanceof Date) return localDateStr(value);
  return String(value).slice(0, 10);
}

async function draftFromStored(tenantId: string, rows: CfdiPagoDocumento[]): Promise<DraftLine[]> {
  const drafts: DraftLine[] = [];
  for (const row of rows) {
    const carta = await CartaPorte.findOne({
      where: { id: row.carta_porte_id, tenant_id: tenantId },
    });
    if (!carta?.xml_timbrado) throw new ComplementError("La factura no tiene XML timbrado", 400);
    const snap = parseInvoiceTaxSnapshot(carta.xml_timbrado);
    const taxes = asTaxes(row.impuestos);
    drafts.push({
      documentId: row.account_document_id,
      cartaPorteId: row.carta_porte_id,
      uuid: snap.uuid,
      serie: snap.serie ?? "",
      folio: snap.folio ?? "",
      monedaDr: row.moneda_dr,
      equivalenciaDr: 1,
      numParcialidad: Number(row.num_parcialidad),
      impSaldoAnt: num(row.imp_saldo_ant),
      impPagado: num(row.imp_pagado),
      impSaldoInsoluto: num(row.imp_saldo_insoluto),
      objetoImpDr: row.objeto_imp_dr === "01" ? "01" : "02",
      taxes,
      totalTraslados: roundMoney(taxes.filter((tax) => tax.tipo === "traslado").reduce((sum, tax) => sum + num(tax.importe), 0)),
      totalRetenidos: roundMoney(taxes.filter((tax) => tax.tipo === "retencion").reduce((sum, tax) => sum + num(tax.importe), 0)),
    });
  }
  return drafts;
}

export async function retryPaymentComplement(tenantId: string, id: string): Promise<ComplementDto> {
  const pago = await CfdiPago.findOne({ where: { id, tenant_id: tenantId } });
  if (!pago) throw new ComplementError("Complemento no encontrado", 404);
  if (pago.estatus === "timbrado") throw new ComplementError("El complemento ya está timbrado", 400);
  const stored = parseAnnotated(pago.error_mensaje);
  const lineRows = await CfdiPagoDocumento.findAll({
    where: { tenant_id: tenantId, cfdi_pago_id: pago.id },
    order: [["num_parcialidad", "ASC"]],
  });
  if (!lineRows.length) throw new ComplementError("El complemento no tiene líneas", 400);
  const fiscal = await loadTenant(tenantId);
  const client = await loadClient(tenantId, pago.client_id);
  const draft = await draftFromStored(tenantId, lineRows);
  const docs = await AccountDocument.findAll({
    where: { id: draft.map((linea) => linea.documentId), tenant_id: tenantId },
  });
  const fechaPago = fechaPagoPayload(pago.fecha_pago);
  const body = payloadBody({
    serie: pago.serie,
    folio: String(pago.folio),
    cpFiscal: fiscal.cpFiscal,
    formaPagoP: pago.forma_pago_p,
    fechaPago,
    monedaP: pago.moneda_p,
    tipoCambioP: num(pago.tipo_cambio_p),
    numOperacion: pago.num_operacion?.trim() ?? "",
    client,
    lineas: draft,
    usuario: fiscal.usuario,
    contrasena: fiscal.contrasena,
  });
  return finishStamp({
    tenant: fiscal.tenant,
    usuario: fiscal.usuario,
    contrasena: fiscal.contrasena,
    tenantId,
    pago,
    draft,
    body,
    docs,
    mode: stored.paymentIds.length ? { kind: "link", paymentIds: stored.paymentIds } : { kind: "create" },
    fechaPago: fechaOnly(pago.fecha_pago),
    numOperacion: pago.num_operacion?.trim() || null,
    userId: pago.created_by ?? null,
  });
}

export async function discardPaymentComplement(tenantId: string, id: string): Promise<void> {
  const pago = await CfdiPago.findOne({ where: { id, tenant_id: tenantId } });
  if (!pago) throw new ComplementError("Complemento no encontrado", 404);
  if (pago.estatus !== "error") {
    throw new ComplementError("Solo se puede descartar un complemento en error", 400);
  }
  await sequelize.transaction(async (transaction) => {
    await CfdiPagoDocumento.destroy({
      where: { cfdi_pago_id: pago.id, tenant_id: tenantId },
      transaction,
    });
    await pago.destroy({ transaction });
  });
}
