import type { TaxComponent } from "./taxComponent";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function taxKey(t: Pick<TaxComponent, "tipo" | "impuesto" | "tipoFactor" | "tasaOCuota">): string {
  return `${t.tipo}|${t.impuesto}|${t.tipoFactor}|${t.tasaOCuota}`;
}

function trasladoKey(t: TaxComponent): string {
  return `${t.impuesto}|${t.tipoFactor}|${t.tasaOCuota}`;
}

function tasa6(tasa: number): string {
  return tasa.toFixed(6);
}

export function prorateDocumentTaxes(input: {
  impPagado: number;
  totalXml: number;
  impSaldoInsoluto: number;
  original: TaxComponent[];
  previous: TaxComponent[];
}): { objetoImp: "01" | "02"; taxes: TaxComponent[]; totalTraslados: number; totalRetenidos: number } {
  const previousByKey = new Map<string, TaxComponent>();
  for (const prev of input.previous) {
    previousByKey.set(taxKey(prev), prev);
  }

  const taxes = input.original.map((line) => {
    if (input.impSaldoInsoluto === 0) {
      const used = previousByKey.get(taxKey(line));
      return {
        ...line,
        base: round2(line.base - (used?.base ?? 0)),
        importe: round2(line.importe - (used?.importe ?? 0)),
      };
    }
    const factor = input.impPagado / input.totalXml;
    return {
      ...line,
      base: round2(line.base * factor),
      importe: round2(line.importe * factor),
    };
  });

  const hasTax = taxes.some((t) => t.base !== 0 || t.importe !== 0);
  if (!hasTax) {
    return { objetoImp: "01", taxes: [], totalTraslados: 0, totalRetenidos: 0 };
  }

  const totalTraslados = round2(
    taxes.filter((t) => t.tipo === "traslado").reduce((sum, t) => sum + t.importe, 0),
  );
  const totalRetenidos = round2(
    taxes.filter((t) => t.tipo === "retencion").reduce((sum, t) => sum + t.importe, 0),
  );

  return { objetoImp: "02", taxes, totalTraslados, totalRetenidos };
}

export function aggregatePagoImpuestos(
  documentTaxes: TaxComponent[][],
  tipoCambioP: number,
): {
  trasladosP: { BaseP: number; ImpuestoP: string; TipoFactorP: string; TasaOCuotaP: number; ImporteP: number }[];
  retencionesP: { ImpuestoP: string; ImporteP: number }[] | null;
  totales: {
    TotalRetencionesIVA: number;
    TotalRetencionesISR: number;
    TotalRetencionesIEPS: number;
    TotalTrasladosBaseIVA16: number;
    TotalTrasladosImpuestoIVA16: number;
    TotalTrasladosBaseIVA8: number;
    TotalTrasladosImpuestoIVA8: number;
    TotalTrasladosBaseIVA0: number;
    TotalTrasladosImpuestoIVA0: number;
    TotalTrasladosBaseIVAExento: number;
  };
} {
  const flat = documentTaxes.flat();

  const trasladoGroups = new Map<string, TaxComponent[]>();
  const retencionByImpuesto = new Map<string, number>();

  for (const line of flat) {
    if (line.tipo === "traslado") {
      const key = trasladoKey(line);
      const group = trasladoGroups.get(key) ?? [];
      group.push(line);
      trasladoGroups.set(key, group);
      continue;
    }
    retencionByImpuesto.set(line.impuesto, (retencionByImpuesto.get(line.impuesto) ?? 0) + line.importe);
  }

  const trasladosP = [...trasladoGroups.values()].map((group) => {
    const first = group[0];
    return {
      BaseP: round2(group.reduce((sum, t) => sum + t.base, 0)),
      ImpuestoP: first.impuesto,
      TipoFactorP: first.tipoFactor,
      TasaOCuotaP: first.tasaOCuota,
      ImporteP: round2(group.reduce((sum, t) => sum + t.importe, 0)),
    };
  });

  const retencionesEntries = [...retencionByImpuesto.entries()]
    .map(([ImpuestoP, importe]) => ({ ImpuestoP, ImporteP: round2(importe) }))
    .filter((r) => r.ImporteP !== 0);
  const retencionesP = retencionesEntries.length === 0 ? null : retencionesEntries;

  let base16 = 0;
  let imp16 = 0;
  let base8 = 0;
  let imp8 = 0;
  let base0 = 0;
  let imp0 = 0;
  let baseExento = 0;
  for (const t of trasladosP) {
    if (t.TipoFactorP === "Exento") {
      baseExento += t.BaseP;
      continue;
    }
    const tasa = tasa6(t.TasaOCuotaP);
    if (tasa === "0.160000") {
      base16 += t.BaseP;
      imp16 += t.ImporteP;
    } else if (tasa === "0.080000") {
      base8 += t.BaseP;
      imp8 += t.ImporteP;
    } else if (tasa === "0.000000") {
      base0 += t.BaseP;
      imp0 += t.ImporteP;
    }
  }

  let retIva = 0;
  let retIsr = 0;
  let retIeps = 0;
  for (const [impuesto, importe] of retencionByImpuesto) {
    if (impuesto === "002") retIva += importe;
    else if (impuesto === "001") retIsr += importe;
    else if (impuesto === "003") retIeps += importe;
  }

  return {
    trasladosP,
    retencionesP,
    totales: {
      TotalRetencionesIVA: round2(retIva * tipoCambioP),
      TotalRetencionesISR: round2(retIsr * tipoCambioP),
      TotalRetencionesIEPS: round2(retIeps * tipoCambioP),
      TotalTrasladosBaseIVA16: round2(base16 * tipoCambioP),
      TotalTrasladosImpuestoIVA16: round2(imp16 * tipoCambioP),
      TotalTrasladosBaseIVA8: round2(base8 * tipoCambioP),
      TotalTrasladosImpuestoIVA8: round2(imp8 * tipoCambioP),
      TotalTrasladosBaseIVA0: round2(base0 * tipoCambioP),
      TotalTrasladosImpuestoIVA0: round2(imp0 * tipoCambioP),
      TotalTrasladosBaseIVAExento: round2(baseExento * tipoCambioP),
    },
  };
}
