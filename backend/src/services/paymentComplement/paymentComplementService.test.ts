import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, afterEach, describe, it, mock } from "node:test";
import { Op } from "sequelize";
import {
  AccountDocument,
  AccountDocumentPayment,
  CartaPorte,
  CfdiPago,
  CfdiPagoDocumento,
  Client,
  Tenant,
  sequelize,
} from "../../models";
import { encryptSecret } from "../../utils/fiscalCrypto";
import { localDateStr } from "../../utils/localDates";
import { SicofiHttpError } from "../pac/sicofi/sicofiClient";
import type { TaxComponent } from "./taxComponent";
import {
  ComplementError,
  cancelPaymentComplement,
  complementDeps,
  createFromExistingPayments,
  createPaymentComplement,
  createPaymentComplementsPerDocument,
  getPaymentComplementXml,
  retryPaymentComplement,
} from "./paymentComplementService";

const uploadDir = mkdtempSync(path.join(os.tmpdir(), "pago-pdf-"));
process.env.UPLOAD_DIR = uploadDir;

const PAGO_XML = `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante Version="4.0" Serie="P" Folio="1" Fecha="2026-10-16T12:44:00" SubTotal="0" Total="0" TipoDeComprobante="P" LugarExpedicion="45640" Moneda="XXX" Exportacion="01" xmlns:cfdi="http://www.sat.gob.mx/cfd/4" xmlns:pago20="http://www.sat.gob.mx/Pagos20">
  <cfdi:Emisor Rfc="TNU150126V30" Nombre="TRANSPORTES LIGEROS DE OCCIDENTE" RegimenFiscal="624"/>
  <cfdi:Receptor Rfc="EKU9003173C9" Nombre="ESCUELA" DomicilioFiscalReceptor="55060" RegimenFiscalReceptor="601" UsoCFDI="CP01"/>
  <cfdi:Conceptos>
    <cfdi:Concepto ClaveProdServ="84111506" Cantidad="1" ClaveUnidad="ACT" Descripcion="Pago" ValorUnitario="0" Importe="0" ObjetoImp="01"/>
  </cfdi:Conceptos>
  <cfdi:Complemento>
    <pago20:Pagos Version="2.0">
      <pago20:Totales TotalRetencionesIVA="200.00" TotalTrasladosBaseIVA16="5000.00" TotalTrasladosImpuestoIVA16="800.00" MontoTotalPagos="5600.00"/>
      <pago20:Pago FechaPago="2026-10-16T12:00:00" FormaDePagoP="03" MonedaP="MXN" TipoCambioP="1" Monto="5600.00" NumOperacion="SPEI-1">
        <pago20:DoctoRelacionado IdDocumento="D9BE138A-9449-11EE-9430-00155D012007" Serie="I" Folio="15" MonedaDR="MXN" EquivalenciaDR="1" NumParcialidad="1" ImpSaldoAnt="11200.00" ImpPagado="5600.00" ImpSaldoInsoluto="5600.00" ObjetoImpDR="02">
          <pago20:ImpuestosDR>
            <pago20:RetencionesDR>
              <pago20:RetencionDR BaseDR="5000.00" ImpuestoDR="002" TipoFactorDR="Tasa" TasaOCuotaDR="0.040000" ImporteDR="200.00"/>
            </pago20:RetencionesDR>
            <pago20:TrasladosDR>
              <pago20:TrasladoDR BaseDR="5000.00" ImpuestoDR="002" TipoFactorDR="Tasa" TasaOCuotaDR="0.160000" ImporteDR="800.00"/>
            </pago20:TrasladosDR>
          </pago20:ImpuestosDR>
        </pago20:DoctoRelacionado>
        <pago20:ImpuestosP>
          <pago20:RetencionesP><pago20:RetencionP ImpuestoP="002" ImporteP="200.00"/></pago20:RetencionesP>
          <pago20:TrasladosP><pago20:TrasladoP BaseP="5000.00" ImpuestoP="002" TipoFactorP="Tasa" TasaOCuotaP="0.160000" ImporteP="800.00"/></pago20:TrasladosP>
        </pago20:ImpuestosP>
      </pago20:Pago>
    </pago20:Pagos>
    <tfd:TimbreFiscalDigital xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" FechaTimbrado="2026-10-16T12:44:00" UUID="0ca71ac8-61a8-4d50-8136-fc447522c588" NoCertificadoSAT="00001000000718099104" RfcProvCertif="ICA050422AA6" SelloCFD="SELLOCFD12345678" SelloSAT="SELLOSAT" Version="1.1"/>
  </cfdi:Complemento>
</cfdi:Comprobante>`;

const PPD_XML = `<?xml version="1.0"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" Version="4.0" Serie="I" Folio="15" Fecha="2026-05-01T10:00:00" SubTotal="10000" Total="11200" Moneda="MXN" TipoDeComprobante="I" MetodoPago="PPD" FormaPago="99" LugarExpedicion="44100">
  <cfdi:Receptor Rfc="EKU9003173C9" Nombre="ESCUELA" UsoCFDI="G03" DomicilioFiscalReceptor="55060" RegimenFiscalReceptor="601"/>
  <cfdi:Conceptos>
    <cfdi:Concepto ClaveProdServ="78101802" Cantidad="1" ClaveUnidad="E48" Descripcion="Flete" ValorUnitario="10000" Importe="10000" ObjetoImp="02">
      <cfdi:Impuestos>
        <cfdi:Traslados>
          <cfdi:Traslado Base="10000" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="1600"/>
        </cfdi:Traslados>
        <cfdi:Retenciones>
          <cfdi:Retencion Base="10000" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.040000" Importe="400"/>
        </cfdi:Retenciones>
      </cfdi:Impuestos>
    </cfdi:Concepto>
  </cfdi:Conceptos>
  <cfdi:Complemento>
    <tfd:TimbreFiscalDigital xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" UUID="D9BE138A-9449-11EE-9430-00155D012007" FechaTimbrado="2026-05-01T10:05:00"/>
  </cfdi:Complemento>
</cfdi:Comprobante>`;

const halfTaxes: TaxComponent[] = [
  { tipo: "traslado", impuesto: "002", tipoFactor: "Tasa", tasaOCuota: 0.16, base: 5000, importe: 800 },
  { tipo: "retencion", impuesto: "002", tipoFactor: "Tasa", tasaOCuota: 0.04, base: 5000, importe: 200 },
];

const quarterTaxes: TaxComponent[] = [
  { tipo: "traslado", impuesto: "002", tipoFactor: "Tasa", tasaOCuota: 0.16, base: 2500, importe: 400 },
  { tipo: "retencion", impuesto: "002", tipoFactor: "Tasa", tasaOCuota: 0.04, base: 2500, importe: 100 },
];

type Where = Record<string, unknown>;

function whereOf(opts: unknown): Where {
  if (!opts || typeof opts !== "object") return {};
  const where = (opts as { where?: Where }).where;
  return where ?? {};
}

function idsOf(value: unknown): string[] | null {
  if (typeof value === "string") return [value];
  if (!value || typeof value !== "object") return null;
  const listed = (value as Record<symbol, unknown>)[Op.in];
  return Array.isArray(listed) ? listed.map(String) : null;
}

function makeDoc(id: string, tripId: string) {
  const doc = {
    id,
    tenant_id: "tenant-1",
    tipo: "cxc" as const,
    origen: "viaje" as const,
    estatus: "abierta" as "abierta" | "pagada" | "cancelada",
    client_id: "client-1",
    trip_id: tripId,
    monto_original: "11200",
    entidad_nombre: "ESCUELA",
    folio: "15",
    concepto: "Flete",
    fecha_emision: "2026-05-01",
    update: async (patch: Record<string, unknown>) => {
      Object.assign(doc, patch);
    },
  };
  return doc;
}

interface HarnessOpts {
  docs: ReturnType<typeof makeDoc>[];
  post: (...args: unknown[]) => Promise<unknown>;
  pagoFindAll: (where: Where) => unknown[];
  docLines: unknown[];
  paymentsById: unknown[];
  paymentsByDocument: unknown[];
}

function installHarness(opts: HarnessOpts) {
  const pagoRows: Array<Record<string, unknown> & { update: (patch: Record<string, unknown>) => Promise<void> }> = [];
  const pagoPatches: Record<string, unknown>[] = [];

  mock.method(complementDeps, "accessToken", async () => "jwt");
  const post = mock.method(complementDeps, "postPagos40", opts.post);
  mock.method(Tenant, "findByPk", async () => ({
    id: "tenant-1",
    cp_fiscal: "44100",
    cfdi_serie_pago: "P",
    pac_usuario: "sicofi-user",
    pac_token_enc: encryptSecret("secret"),
    pac_url: null,
  }));
  mock.method(Client, "findByPk", async () => ({
    id: "client-1",
    tenant_id: "tenant-1",
    rfc: "EKU9003173C9",
    razon_social: "ESCUELA",
    alias: "Apodo interno",
    cp: "55060",
    regimen_fiscal: "601",
  }));
  const documents = mock.method(AccountDocument, "findAll", async () => opts.docs);
  mock.method(CartaPorte, "findOne", async (query: unknown) => {
    const tripId = String(whereOf(query).trip_id ?? "");
    const doc = opts.docs.find((row) => row.trip_id === tripId) ?? opts.docs[0];
    return {
      id: `cp-${doc?.trip_id ?? "trip"}`,
      trip_id: doc?.trip_id,
      estatus: "timbrada",
      tipo_comprobante: "ingreso",
      xml_timbrado: PPD_XML,
      uuid: "D9BE138A-9449-11EE-9430-00155D012007",
    };
  });
  const pagos = mock.method(CfdiPago, "findAll", async (query: unknown) => {
    const where = whereOf(query);
    const listed = opts.pagoFindAll(where);
    const created = where.estatus
      ? pagoRows.filter((row) => row.estatus === where.estatus)
      : pagoRows;
    const seen = new Set(listed.map((row) => String((row as { id?: string }).id ?? "")));
    return [...listed, ...created.filter((row) => !seen.has(String(row.id ?? "")))];
  });
  const pagoCreate = mock.method(CfdiPago, "create", async (values: Record<string, unknown>) => {
    const row = {
      ...values,
      update: async (patch: Record<string, unknown>) => {
        Object.assign(row, patch);
        pagoPatches.push(patch);
      },
    };
    pagoRows.push(row);
    return row;
  });
  const createdLines: Record<string, unknown>[] = [];
  const lineBulk = mock.method(CfdiPagoDocumento, "bulkCreate", async (rows: unknown[]) => {
    createdLines.push(...(rows as Record<string, unknown>[]));
    return rows;
  });
  const docLines = mock.method(CfdiPagoDocumento, "findAll", async (query: unknown) => {
    const ids = idsOf(whereOf(query).account_document_id);
    const matches = (row: unknown) => {
      if (!ids) return true;
      return ids.includes(String((row as { account_document_id?: string }).account_document_id ?? ""));
    };
    return [...opts.docLines.filter(matches), ...createdLines.filter(matches)];
  });
  const payments = mock.method(AccountDocumentPayment, "findAll", async (query: unknown) => {
    const where = whereOf(query);
    if ("id" in where) return opts.paymentsById;
    return opts.paymentsByDocument;
  });
  const paymentBulk = mock.method(AccountDocumentPayment, "bulkCreate", async (rows: unknown[]) => rows);
  const paymentUpdate = mock.method(AccountDocumentPayment, "update", async () => [1]);
  const transaction = mock.method(sequelize, "transaction", async (work: unknown) => {
    if (typeof work !== "function") throw new Error("transaction sin callback");
    return (work as (tx: object) => Promise<unknown>)({});
  });

  return { post, documents, pagos, pagoCreate, lineBulk, docLines, payments, paymentBulk, paymentUpdate, transaction, pagoRows, pagoPatches };
}

function input(documentos: { documentId: string; monto: number }[], numOperacion?: string) {
  return {
    clientId: "client-1",
    fechaPago: localDateStr(),
    formaPagoP: "03",
    monedaP: "MXN",
    tipoCambioP: 1,
    numOperacion,
    documentos,
  };
}

describe("paymentComplementService", () => {
  after(() => {
    rmSync(uploadDir, { recursive: true, force: true });
  });

  afterEach(() => {
    mock.restoreAll();
  });

  it("Sicofi rechaza y no hay abono", async () => {
    const doc = makeDoc("doc-1", "trip-1");
    const h = installHarness({
      docs: [doc],
      post: async () => {
        throw new SicofiHttpError(400, "XML inválido");
      },
      pagoFindAll: (where) => (where.estatus === "error" || where.estatus === "timbrado" ? [] : []),
      docLines: [],
      paymentsById: [],
      paymentsByDocument: [],
    });

    const dto = await createPaymentComplement("tenant-1", "user-1", input([{ documentId: "doc-1", monto: 100 }]));

    assert.equal(dto.estatus, "error");
    assert.match(dto.error_mensaje ?? "", /XML inválido/);
    assert.equal(h.paymentBulk.mock.calls.length, 0);
    assert.equal(h.pagoCreate.mock.calls.length, 1);
    assert.equal(h.pagoCreate.mock.calls[0]?.arguments[0]?.error_mensaje, "pendiente");
    assert.equal(h.documents.mock.calls[0]?.arguments[0]?.lock, "UPDATE");
    assert.equal(h.transaction.mock.calls.length > 0, true);
  });

  it("timbrado crea un abono por factura", async () => {
    const docs = [makeDoc("doc-1", "trip-1"), makeDoc("doc-2", "trip-2")];
    const h = installHarness({
      docs,
      post: async () => ({ uuid: "UUID-1", xmlTimbrado: PAGO_XML, fechaTimbrado: "2026-10-15T12:00:00" }),
      pagoFindAll: () => [],
      docLines: [],
      paymentsById: [],
      paymentsByDocument: [],
    });

    const dto = await createPaymentComplement(
      "tenant-1",
      "user-1",
      input(
        [
          { documentId: "doc-1", monto: 100 },
          { documentId: "doc-2", monto: 50 },
        ],
        "SPEI-1",
      ),
    );

    assert.equal(dto.estatus, "timbrado");
    assert.equal(dto.uuid, "UUID-1");
    const createdId = String(h.pagoCreate.mock.calls[0]?.arguments[0]?.id);
    const paymentRows = h.paymentBulk.mock.calls[0]?.arguments[0] as { cfdi_pago_id: string }[];
    assert.equal(paymentRows.length, 2);
    assert.equal(paymentRows[0]?.cfdi_pago_id, createdId);
    assert.equal(paymentRows[1]?.cfdi_pago_id, createdId);
    assert.equal(
      h.pagoPatches.some((patch) => patch.estatus === "timbrado" && patch.uuid === "UUID-1"),
      true,
    );
    assert.equal(h.pagoRows[0]?.pdf_path, `tenant-1/complementos-pago/${createdId}.pdf`);
    const body = h.post.mock.calls[0]?.arguments[1] as {
      Usuario?: string;
      Contrasena?: string;
      ReceptorCFDI?: { Email?: string | null; RazonSocial?: string };
      DatosCFDI?: { EmailMensaje?: string | null; MensajePDF?: string; Serie?: string; Fecha?: string };
      Pagos?: { CFDIPagos40?: { FechaPago?: string; NumOperacion?: string }[] };
    };
    assert.equal(body.Usuario, "sicofi-user");
    assert.equal(body.Contrasena, "secret");
    assert.equal(body.ReceptorCFDI?.RazonSocial, "ESCUELA");
    assert.equal(body.ReceptorCFDI?.Email, null);
    assert.equal(body.DatosCFDI?.EmailMensaje, null);
    assert.equal(body.DatosCFDI?.MensajePDF, "");
    assert.equal(body.DatosCFDI?.Serie, "P");
    assert.equal(body.Pagos?.CFDIPagos40?.[0]?.NumOperacion, "SPEI-1");
    assert.equal(body.Pagos?.CFDIPagos40?.[0]?.FechaPago, body.DatosCFDI?.Fecha);
    assert.match(body.Pagos?.CFDIPagos40?.[0]?.FechaPago ?? "", new RegExp(`^${localDateStr()}T\\d{2}:\\d{2}:\\d{2}$`));
    assert.match(String(h.post.mock.calls[0]?.arguments[0]), /\/Comprobante40\/Pagos40$/);
  });

  it("manda correo y mensaje a Sicofi y los guarda en el complemento", async () => {
    const doc = makeDoc("doc-1", "trip-1");
    const h = installHarness({
      docs: [doc],
      post: async () => ({ uuid: "UUID-MAIL", xmlTimbrado: PAGO_XML, fechaTimbrado: "2026-10-15T12:00:00" }),
      pagoFindAll: () => [],
      docLines: [],
      paymentsById: [],
      paymentsByDocument: [],
    });

    await createPaymentComplement("tenant-1", "user-1", {
      ...input([{ documentId: "doc-1", monto: 100 }]),
      email: "  cliente@empresa.com ",
      emailMensaje: "  Adjunto el complemento. ",
    });

    const created = h.pagoCreate.mock.calls[0]?.arguments[0] as { email?: string | null; email_mensaje?: string | null };
    assert.equal(created.email, "cliente@empresa.com");
    assert.equal(created.email_mensaje, "Adjunto el complemento.");
    const body = h.post.mock.calls[0]?.arguments[1] as {
      ReceptorCFDI?: { Email?: string | null };
      DatosCFDI?: { EmailMensaje?: string | null };
    };
    assert.equal(body.ReceptorCFDI?.Email, "cliente@empresa.com");
    assert.equal(body.DatosCFDI?.EmailMensaje, "Adjunto el complemento.");
  });

  it("guarda numero de operacion y comentarios y los manda a Sicofi", async () => {
    const doc = makeDoc("doc-1", "trip-1");
    const h = installHarness({
      docs: [doc],
      post: async () => ({ uuid: "UUID-NOTA", xmlTimbrado: PAGO_XML, fechaTimbrado: "2026-10-15T12:00:00" }),
      pagoFindAll: () => [],
      docLines: [],
      paymentsById: [],
      paymentsByDocument: [],
    });

    await createPaymentComplement("tenant-1", "user-1", {
      ...input([{ documentId: "doc-1", monto: 100 }], "  SPEI-9  "),
      comentarios: "  Pago | parcial  ",
    });

    const created = h.pagoCreate.mock.calls[0]?.arguments[0] as {
      num_operacion?: string | null;
      comentarios?: string | null;
    };
    assert.equal(created.num_operacion, "SPEI-9");
    assert.equal(created.comentarios, "Pago parcial");
    const body = h.post.mock.calls[0]?.arguments[1] as {
      DatosCFDI?: { MensajePDF?: string };
      Pagos?: { CFDIPagos40?: { NumOperacion?: string }[] };
    };
    assert.equal(body.DatosCFDI?.MensajePDF, "Pago parcial");
    assert.equal(body.Pagos?.CFDIPagos40?.[0]?.NumOperacion, "SPEI-9");
  });

  it("parcialidad 2 usa el insoluto de la última línea timbrada", async () => {
    const doc = makeDoc("doc-1", "trip-1");
    const h = installHarness({
      docs: [doc],
      post: async () => ({ uuid: "UUID-2", xmlTimbrado: PAGO_XML, fechaTimbrado: "2026-10-15T12:00:00" }),
      pagoFindAll: (where) => (where.estatus === "timbrado" ? [{ id: "pago-prev", estatus: "timbrado" }] : []),
      docLines: [
        {
          id: "line-prev",
          cfdi_pago_id: "pago-prev",
          account_document_id: "doc-1",
          num_parcialidad: 1,
          imp_saldo_ant: "11200",
          imp_pagado: "5600",
          imp_saldo_insoluto: "5600",
          impuestos: halfTaxes,
        },
      ],
      paymentsById: [],
      paymentsByDocument: [],
    });

    await createPaymentComplement("tenant-1", "user-1", input([{ documentId: "doc-1", monto: 100 }]));

    const lines = h.lineBulk.mock.calls[0]?.arguments[0] as { num_parcialidad: number; imp_saldo_ant: string }[];
    assert.equal(lines.length, 1);
    assert.equal(lines[0]?.num_parcialidad, 2);
    assert.equal(Number(lines[0]?.imp_saldo_ant), 5600);
    assert.equal(h.pagos.mock.calls.some((call) => whereOf(call.arguments[0]).estatus === "timbrado"), true);
  });

  it("from-payments liga abonos y no inserta otros", async () => {
    const doc = makeDoc("doc-1", "trip-1");
    const payment = {
      id: "pay-1",
      tenant_id: "tenant-1",
      document_id: "doc-1",
      monto: "5600",
      cfdi_pago_id: null,
      fecha: "2026-10-01",
    };
    const h = installHarness({
      docs: [doc],
      post: async () => ({ uuid: "UUID-4", xmlTimbrado: PAGO_XML, fechaTimbrado: "2026-10-15T12:00:00" }),
      pagoFindAll: () => [],
      docLines: [],
      paymentsById: [payment],
      paymentsByDocument: [payment],
    });

    const dto = await createFromExistingPayments("tenant-1", "user-1", {
      clientId: "client-1",
      fechaPago: localDateStr(),
      formaPagoP: "03",
      monedaP: "MXN",
      tipoCambioP: 1,
      paymentIds: ["pay-1"],
    });

    assert.equal(dto.estatus, "timbrado");
    assert.equal(h.paymentBulk.mock.calls.length, 0);
    assert.equal(h.paymentUpdate.mock.calls.length, 1);
    const createdId = String(h.pagoCreate.mock.calls[0]?.arguments[0]?.id);
    assert.equal(h.paymentUpdate.mock.calls[0]?.arguments[0]?.cfdi_pago_id, createdId);
    assert.equal(h.payments.mock.calls.some((call) => "id" in whereOf(call.arguments[0])), true);
  });

  it("documento con intento en error rechaza 409", async () => {
    const doc = makeDoc("doc-1", "trip-1");
    const h = installHarness({
      docs: [doc],
      post: async () => ({ uuid: "NO", xmlTimbrado: PAGO_XML, fechaTimbrado: "2026-10-15T12:00:00" }),
      pagoFindAll: (where) => (where.estatus === "error" ? [{ id: "pago-err", estatus: "error" }] : []),
      docLines: [
        {
          id: "line-err",
          cfdi_pago_id: "pago-err",
          account_document_id: "doc-1",
          num_parcialidad: 1,
          imp_saldo_insoluto: "11200",
          impuestos: [],
        },
      ],
      paymentsById: [],
      paymentsByDocument: [],
    });

    await assert.rejects(
      () => createPaymentComplement("tenant-1", "user-1", input([{ documentId: "doc-1", monto: 100 }])),
      (err: unknown) => {
        assert.ok(err instanceof ComplementError);
        assert.equal(err.status, 409);
        assert.match(err.message, /pago-err/);
        assert.match(err.message, /Hay un complemento pendiente/);
        return true;
      },
    );
    assert.equal(h.pagoCreate.mock.calls.length, 0);
    assert.equal(h.paymentBulk.mock.calls.length, 0);
    assert.equal(h.post.mock.calls.length, 0);
  });

  it("la tercera parcialidad cierra contra la suma de impuestos timbrados", async () => {
    const doc = makeDoc("doc-1", "trip-1");
    const h = installHarness({
      docs: [doc],
      post: async () => ({ uuid: "UUID-3", xmlTimbrado: PAGO_XML, fechaTimbrado: "2026-10-15T12:00:00" }),
      pagoFindAll: (where) =>
        where.estatus === "timbrado"
          ? [
              { id: "pago-1", estatus: "timbrado" },
              { id: "pago-2", estatus: "timbrado" },
            ]
          : [],
      docLines: [
        {
          cfdi_pago_id: "pago-1",
          account_document_id: "doc-1",
          num_parcialidad: 1,
          imp_saldo_insoluto: "5600",
          imp_pagado: "5600",
          impuestos: halfTaxes,
        },
        {
          cfdi_pago_id: "pago-2",
          account_document_id: "doc-1",
          num_parcialidad: 2,
          imp_saldo_insoluto: "2800",
          imp_pagado: "2800",
          impuestos: quarterTaxes,
        },
      ],
      paymentsById: [],
      paymentsByDocument: [],
    });

    await createPaymentComplement("tenant-1", "user-1", input([{ documentId: "doc-1", monto: 2800 }]));

    const created = (h.lineBulk.mock.calls[0]?.arguments[0] as { num_parcialidad: number; impuestos: TaxComponent[] }[])[0];
    assert.equal(created?.num_parcialidad, 3);
    const iva = created?.impuestos.find((tax) => tax.tipo === "traslado");
    const ret = created?.impuestos.find((tax) => tax.tipo === "retencion");
    assert.equal(iva?.base, 2500);
    assert.equal(iva?.importe, 400);
    assert.equal(ret?.base, 2500);
    assert.equal(ret?.importe, 100);
  });

  it("un complemento por factura sigue si una falla y deja su id para reintentar", async () => {
    const docs = [makeDoc("doc-1", "trip-1"), makeDoc("doc-2", "trip-2"), makeDoc("doc-3", "trip-3")];
    let llamadas = 0;
    const h = installHarness({
      docs,
      post: async () => {
        llamadas += 1;
        if (llamadas === 2) throw new SicofiHttpError(400, "serie no dada de alta");
        return { uuid: `UUID-${llamadas}`, xmlTimbrado: PAGO_XML, fechaTimbrado: "2026-10-15T12:00:00" };
      },
      pagoFindAll: () => [],
      docLines: [],
      paymentsById: [],
      paymentsByDocument: [],
    });

    const result = await createPaymentComplementsPerDocument(
      "tenant-1",
      "user-1",
      input([
        { documentId: "doc-1", monto: 100 },
        { documentId: "doc-2", monto: 80 },
        { documentId: "doc-3", monto: 60 },
      ]),
    );

    assert.equal(h.post.mock.calls.length, 3);
    assert.deepEqual(
      result.timbrados.map((dto) => dto.folio),
      ["1", "3"],
    );
    assert.equal(result.timbrados[0]?.estatus, "timbrado");
    assert.equal(result.timbrados[1]?.estatus, "timbrado");
    assert.equal(result.fallidos.length, 1);
    assert.equal(result.fallidos[0]?.documentId, "doc-2");
    assert.equal(typeof result.fallidos[0]?.complementoId, "string");
    assert.match(result.fallidos[0]?.error ?? "", /serie no dada de alta/);
    const abonos = h.paymentBulk.mock.calls.flatMap((call) => call.arguments[0] as { document_id: string }[]);
    assert.deepEqual(
      abonos.map((row) => row.document_id),
      ["doc-1", "doc-3"],
    );

    await assert.rejects(
      () => createPaymentComplement("tenant-1", "user-1", input([{ documentId: "doc-2", monto: 80 }])),
      (err: unknown) => {
        assert.ok(err instanceof ComplementError);
        assert.equal(err.status, 409);
        assert.match(err.message, new RegExp(String(result.fallidos[0]?.complementoId)));
        return true;
      },
    );
  });
});

describe("cancelPaymentComplement", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  function install(opts: {
    pago: Record<string, unknown> | null;
    lines: Array<Record<string, unknown>>;
    siblings: Array<Record<string, unknown>>;
    stampedIds: string[];
    cancelar?: () => Promise<void>;
  }) {
    const patches: Record<string, unknown>[] = [];
    const pago = opts.pago
      ? {
          ...opts.pago,
          update: async (patch: Record<string, unknown>) => {
            Object.assign(pago, patch);
            patches.push(patch);
          },
        }
      : null;
    mock.method(CfdiPago, "findOne", async () => pago);
    mock.method(CfdiPago, "findAll", async () =>
      opts.stampedIds.map((id) => ({ id })),
    );
    mock.method(CfdiPagoDocumento, "findAll", async (query: unknown) => {
      const where = (query as { where?: { cfdi_pago_id?: string } }).where ?? {};
      if (where.cfdi_pago_id) return opts.lines;
      return opts.siblings;
    });
    const paymentUpdate = mock.method(AccountDocumentPayment, "update", async () => [1]);
    const lineDestroy = mock.method(CfdiPagoDocumento, "destroy", async () => 0);
    mock.method(sequelize, "transaction", async (work: unknown) => {
      if (typeof work !== "function") throw new Error("transaction sin callback");
      return (work as (tx: object) => Promise<unknown>)({});
    });
    mock.method(Tenant, "findByPk", async () => ({
      id: "tenant-1",
      rfc: "TNU150126V30",
      pac_proveedor: "sicofi",
    }));
    const cancelar = mock.method(
      complementDeps,
      "cancelar",
      opts.cancelar ?? (async () => undefined),
    );
    return { pago, patches, paymentUpdate, lineDestroy, cancelar };
  }

  const line = {
    cfdi_pago_id: "pago-1",
    account_document_id: "doc-1",
    num_parcialidad: 1,
  };

  it("cancela la última parcialidad y suelta los abonos", async () => {
    const h = install({
      pago: {
        id: "pago-1",
        tenant_id: "tenant-1",
        estatus: "timbrado",
        uuid: "0ca71ac8-61a8-4d50-8136-fc447522c588",
      },
      lines: [line],
      siblings: [line],
      stampedIds: ["pago-1"],
    });

    const result = await cancelPaymentComplement("tenant-1", "pago-1", "02", {
      folioSustitucion: "  ",
    });

    assert.equal(result.estatus, "cancelado");
    assert.equal(result.uuid, "0ca71ac8-61a8-4d50-8136-fc447522c588");
    assert.equal(h.cancelar.mock.calls[0]?.arguments[0], "0ca71ac8-61a8-4d50-8136-fc447522c588");
    assert.equal(h.cancelar.mock.calls[0]?.arguments[1], "02");
    assert.equal(h.cancelar.mock.calls[0]?.arguments[3], undefined);
    assert.deepEqual(h.paymentUpdate.mock.calls[0]?.arguments[0], { cfdi_pago_id: null });
    assert.equal(
      (h.paymentUpdate.mock.calls[0]?.arguments[1] as { where: { cfdi_pago_id: string } }).where
        .cfdi_pago_id,
      "pago-1",
    );
    assert.equal(h.patches.at(-1)?.estatus, "cancelado");
    assert.equal(h.lineDestroy.mock.calls.length, 0);
  });

  it("manda el folio de sustitución recortado", async () => {
    const h = install({
      pago: {
        id: "pago-1",
        estatus: "timbrado",
        uuid: "0ca71ac8-61a8-4d50-8136-fc447522c588",
      },
      lines: [line],
      siblings: [line],
      stampedIds: ["pago-1"],
    });

    await cancelPaymentComplement("tenant-1", "pago-1", "01", {
      folioSustitucion: "  AAA-NUEVO  ",
    });

    assert.deepEqual(h.cancelar.mock.calls[0]?.arguments[3], {
      folioSustitucion: "AAA-NUEVO",
    });
  });

  it("no toca la base si el PAC rechaza", async () => {
    const h = install({
      pago: {
        id: "pago-1",
        estatus: "timbrado",
        uuid: "0ca71ac8-61a8-4d50-8136-fc447522c588",
      },
      lines: [line],
      siblings: [line],
      stampedIds: ["pago-1"],
      cancelar: async () => {
        throw new Error("UUID no encontrado");
      },
    });

    await assert.rejects(
      () => cancelPaymentComplement("tenant-1", "pago-1", "02"),
      (err: unknown) => {
        assert.ok(err instanceof ComplementError);
        assert.equal(err.status, 422);
        assert.match(err.message, /UUID no encontrado/);
        return true;
      },
    );
    assert.equal(h.paymentUpdate.mock.calls.length, 0);
    assert.equal(h.patches.length, 0);
  });

  it("rechaza error, cancelado y timbrado sin UUID antes de llamar al PAC", async () => {
    for (const pago of [
      { id: "pago-1", estatus: "error", uuid: null },
      { id: "pago-1", estatus: "cancelado", uuid: "0ca71ac8-61a8-4d50-8136-fc447522c588" },
      { id: "pago-1", estatus: "timbrado", uuid: null },
    ]) {
      const h = install({ pago, lines: [line], siblings: [line], stampedIds: ["pago-1"] });
      await assert.rejects(
        () => cancelPaymentComplement("tenant-1", "pago-1", "02"),
        (err: unknown) => {
          assert.ok(err instanceof ComplementError);
          assert.equal(err.status, 400);
          assert.equal(err.message, "Solo se puede cancelar un complemento timbrado");
          return true;
        },
      );
      assert.equal(h.cancelar.mock.calls.length, 0);
      mock.restoreAll();
    }
  });

  it("rechaza un timbrado sin líneas", async () => {
    const h = install({
      pago: {
        id: "pago-1",
        estatus: "timbrado",
        uuid: "0ca71ac8-61a8-4d50-8136-fc447522c588",
      },
      lines: [],
      siblings: [],
      stampedIds: [],
    });

    await assert.rejects(
      () => cancelPaymentComplement("tenant-1", "pago-1", "02"),
      (err: unknown) => {
        assert.ok(err instanceof ComplementError);
        assert.equal(err.message, "El complemento no tiene líneas");
        return true;
      },
    );
    assert.equal(h.cancelar.mock.calls.length, 0);
  });

  it("rechaza cancelar si hay una parcialidad posterior timbrada", async () => {
    const h = install({
      pago: {
        id: "pago-1",
        estatus: "timbrado",
        uuid: "0ca71ac8-61a8-4d50-8136-fc447522c588",
      },
      lines: [
        line,
        { cfdi_pago_id: "pago-1", account_document_id: "doc-2", num_parcialidad: 1 },
      ],
      siblings: [
        line,
        { cfdi_pago_id: "pago-1", account_document_id: "doc-2", num_parcialidad: 1 },
        { cfdi_pago_id: "pago-2", account_document_id: "doc-2", num_parcialidad: 2 },
      ],
      stampedIds: ["pago-1", "pago-2"],
    });

    await assert.rejects(
      () => cancelPaymentComplement("tenant-1", "pago-1", "02"),
      /Solo se puede cancelar la última parcialidad timbrada de cada factura/,
    );
    assert.equal(h.cancelar.mock.calls.length, 0);
    assert.equal(h.paymentUpdate.mock.calls.length, 0);
  });

  it("permite cancelar cuando la otra parcialidad timbrada es anterior", async () => {
    const h = install({
      pago: {
        id: "pago-2",
        estatus: "timbrado",
        uuid: "11111111-1111-1111-1111-111111111111",
      },
      lines: [{ cfdi_pago_id: "pago-2", account_document_id: "doc-1", num_parcialidad: 2 }],
      siblings: [
        { cfdi_pago_id: "pago-1", account_document_id: "doc-1", num_parcialidad: 1 },
        { cfdi_pago_id: "pago-2", account_document_id: "doc-1", num_parcialidad: 2 },
      ],
      stampedIds: ["pago-1", "pago-2"],
    });

    const result = await cancelPaymentComplement("tenant-1", "pago-2", "02");

    assert.equal(result.estatus, "cancelado");
    assert.equal(h.cancelar.mock.calls.length, 1);
  });
});

describe("complemento cancelado en reintento y descarga", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("no reintenta un complemento cancelado", async () => {
    mock.method(CfdiPago, "findOne", async () => ({
      id: "pago-1",
      estatus: "cancelado",
      uuid: "0ca71ac8-61a8-4d50-8136-fc447522c588",
    }));

    await assert.rejects(
      () => retryPaymentComplement("tenant-1", "pago-1"),
      (err: unknown) => {
        assert.ok(err instanceof ComplementError);
        assert.equal(err.status, 400);
        assert.equal(err.message, "El complemento está cancelado");
        return true;
      },
    );
  });

  it("entrega el XML de un complemento cancelado", async () => {
    mock.method(CfdiPago, "findOne", async () => ({
      id: "pago-1",
      estatus: "cancelado",
      uuid: "0ca71ac8-61a8-4d50-8136-fc447522c588",
      serie: "P",
      folio: "4",
      xml_timbrado: "<xml/>",
    }));
    mock.method(CfdiPagoDocumento, "findAll", async () => []);

    const file = await getPaymentComplementXml("tenant-1", "pago-1");

    assert.equal(file.xml, "<xml/>");
    assert.match(file.filename, /P-4/);
  });

  it("sigue ocultando el XML de un complemento en error", async () => {
    mock.method(CfdiPago, "findOne", async () => ({
      id: "pago-1",
      estatus: "error",
      xml_timbrado: "<xml/>",
    }));

    await assert.rejects(
      () => getPaymentComplementXml("tenant-1", "pago-1"),
      (err: unknown) => {
        assert.ok(err instanceof ComplementError);
        assert.equal(err.status, 404);
        assert.equal(
          err.message,
          "El archivo solo está disponible para un complemento timbrado o cancelado",
        );
        return true;
      },
    );
  });
});
