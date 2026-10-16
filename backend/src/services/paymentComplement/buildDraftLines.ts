import { prorateDocumentTaxes } from "./proratePaymentTaxes";
import type { TaxComponent } from "./taxComponent";

export class ComplementError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "ComplementError";
    this.status = status;
  }
}

export interface DraftSource {
  documentId: string;
  clientId: string;
  cartaPorteId: string;
  uuid: string;
  serie: string;
  folio: string;
  moneda: string;
  totalXml: number;
  montoOriginal: number;
  abonosInternos: number;
  /** Insoluto del último complemento timbrado. null si aún no hay. */
  insolutoPrevio: number | null;
  parcialidadPrevia: number;
  fechaComprobante: string;
  taxes: TaxComponent[];
  previousTaxes: TaxComponent[];
  monto: number;
}

export interface DraftLine {
  documentId: string;
  cartaPorteId: string;
  uuid: string;
  serie: string;
  folio: string;
  monedaDr: string;
  equivalenciaDr: 1;
  numParcialidad: number;
  impSaldoAnt: number;
  impPagado: number;
  impSaldoInsoluto: number;
  objetoImpDr: "01" | "02";
  taxes: TaxComponent[];
  totalTraslados: number;
  totalRetenidos: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function buildDraftLines(input: {
  docs: DraftSource[];
  fechaPago: string;
  today: string;
  monedaP: string;
  tipoCambioP: number;
  formaPagoP: string;
  /** `nuevo` topa contra saldo interno y saldo SAT. `existente` solo contra saldo SAT. */
  modo: "nuevo" | "existente";
}): DraftLine[] {
  if (input.docs.length < 1) {
    throw new ComplementError("Debe incluir al menos un documento");
  }

  const clientIds = new Set(input.docs.map((d) => d.clientId));
  const monedas = new Set(input.docs.map((d) => d.moneda));
  if (clientIds.size !== 1 || monedas.size !== 1) {
    throw new ComplementError("Todos los documentos deben ser del mismo cliente y la misma moneda");
  }

  if (input.monedaP !== input.docs[0].moneda) {
    throw new ComplementError("La moneda del pago debe coincidir con la de los documentos");
  }

  if (!/^\d{2}$/.test(input.formaPagoP) || input.formaPagoP === "99") {
    throw new ComplementError("La forma de pago no es válida para complemento");
  }

  if (input.monedaP === "MXN") {
    if (input.tipoCambioP !== 1) {
      throw new ComplementError("El tipo de cambio para MXN debe ser 1");
    }
  } else if (!(input.tipoCambioP > 0)) {
    throw new ComplementError("El tipo de cambio debe ser mayor a 0");
  }

  if (input.fechaPago > input.today) {
    throw new ComplementError("La fecha de pago no puede ser posterior a hoy");
  }

  for (const doc of input.docs) {
    if (doc.fechaComprobante > input.fechaPago) {
      throw new ComplementError("La fecha de pago no puede ser anterior al comprobante");
    }
  }

  for (const doc of input.docs) {
    if (!(doc.monto > 0)) {
      throw new ComplementError("El monto debe ser mayor a 0");
    }
    if (Math.abs(doc.monto * 100 - Math.round(doc.monto * 100)) > 0.001) {
      throw new ComplementError("El monto admite máximo dos decimales");
    }
  }

  for (const doc of input.docs) {
    if (Math.abs(doc.montoOriginal - doc.totalXml) > 0.01) {
      throw new ComplementError("El monto original no coincide con el total del XML");
    }
  }

  return input.docs.map((doc) => {
    const impSaldoAnt = doc.insolutoPrevio ?? doc.totalXml;
    const saldoInterno = round2(doc.montoOriginal - doc.abonosInternos);

    if (input.modo === "nuevo") {
      if (doc.monto > saldoInterno + 0.001) {
        throw new ComplementError("El monto excede el saldo interno");
      }
      if (doc.monto > impSaldoAnt + 0.001) {
        throw new ComplementError("El monto excede el saldo SAT");
      }
    } else if (doc.monto > impSaldoAnt + 0.001) {
      throw new ComplementError("El monto excede el saldo SAT");
    }

    let impSaldoInsoluto = round2(impSaldoAnt - doc.monto);
    if (impSaldoInsoluto < -0.001) {
      throw new ComplementError("El saldo insoluto no puede ser negativo");
    }
    if (Math.abs(impSaldoInsoluto) < 0.001) {
      impSaldoInsoluto = 0;
    }

    const numParcialidad = doc.parcialidadPrevia + 1;
    const proration = prorateDocumentTaxes({
      impPagado: doc.monto,
      totalXml: doc.totalXml,
      impSaldoInsoluto,
      original: doc.taxes,
      previous: doc.previousTaxes,
    });

    return {
      documentId: doc.documentId,
      cartaPorteId: doc.cartaPorteId,
      uuid: doc.uuid,
      serie: doc.serie,
      folio: doc.folio,
      monedaDr: doc.moneda,
      equivalenciaDr: 1,
      numParcialidad,
      impSaldoAnt,
      impPagado: doc.monto,
      impSaldoInsoluto,
      objetoImpDr: proration.objetoImp,
      taxes: proration.taxes,
      totalTraslados: proration.totalTraslados,
      totalRetenidos: proration.totalRetenidos,
    };
  });
}
