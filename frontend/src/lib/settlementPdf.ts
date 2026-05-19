import type { Driver } from "@/types/tlo";
import type { SettlementSummary } from "@/lib/calc";
import { apiBaseUrl, getStoredToken } from "@/lib/api";
import {
  DEFAULT_TEMPLATE_SETTLEMENT,
  type PdfTemplate,
} from "@/types/pdfTemplate";
import { renderTemplatePdf, safeFileSegment } from "@/lib/pdfRender";

export { hexToRgb } from "@/lib/pdfRender";

export const DEFAULT_PDF_TEMPLATE_SETTLEMENT = DEFAULT_TEMPLATE_SETTLEMENT;

export async function loadPdfLogoDataUrl(template: "settlement" | "trip" = "settlement"): Promise<string | null> {
  const base = apiBaseUrl();
  const token = getStoredToken();
  if (!base || !token) return null;
  try {
    const res = await fetch(`${base}/tenant/pdf-logo/${template}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export interface SettlementPdfOpts {
  tenantNombre: string;
  driver: Driver;
  inicio: string;
  fin: string;
  summary: SettlementSummary;
  template?: PdfTemplate | null;
  logoDataUrl?: string | null;
}

function resolveTemplate(template?: PdfTemplate | null): PdfTemplate {
  if (!template) return DEFAULT_TEMPLATE_SETTLEMENT;
  return template;
}

export function buildSettlementPdf(opts: SettlementPdfOpts) {
  return renderTemplatePdf({
    template: resolveTemplate(opts.template),
    logoDataUrl: opts.logoDataUrl ?? null,
    data: {
      kind: "settlement",
      tenantNombre: opts.tenantNombre,
      driver: opts.driver,
      inicio: opts.inicio,
      fin: opts.fin,
      summary: opts.summary,
    },
  });
}

export function previewSettlementPdfBlobUrl(opts: SettlementPdfOpts): string {
  const doc = buildSettlementPdf(opts);
  const blob = doc.output("blob");
  return URL.createObjectURL(blob);
}

export async function downloadSettlementPdf(opts: SettlementPdfOpts): Promise<void> {
  const doc = buildSettlementPdf(opts);
  const name = safeFileSegment(opts.driver.nombre);
  doc.save(`liquidacion_${name}_${opts.inicio}_${opts.fin}.pdf`);
}
