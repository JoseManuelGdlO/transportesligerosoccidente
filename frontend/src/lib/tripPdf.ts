import type { Client, Driver, Trip, Truck } from "@/types/tlo";
import {
  DEFAULT_TEMPLATE_TRIP,
  type PdfTemplate,
} from "@/types/pdfTemplate";
import { renderTemplatePdf, safeFileSegment } from "@/lib/pdfRender";

export interface TripPdfOpts {
  tenantNombre: string;
  trip: Trip;
  driver?: Driver | null;
  truck?: Truck | null;
  client?: Client | null;
  template?: PdfTemplate | null;
  logoDataUrl?: string | null;
}

function resolveTemplate(template?: PdfTemplate | null): PdfTemplate {
  if (!template) return DEFAULT_TEMPLATE_TRIP;
  return template;
}

export function buildTripPdf(opts: TripPdfOpts) {
  return renderTemplatePdf({
    template: resolveTemplate(opts.template),
    logoDataUrl: opts.logoDataUrl ?? null,
    data: {
      kind: "trip",
      tenantNombre: opts.tenantNombre,
      trip: opts.trip,
      driver: opts.driver ?? null,
      truck: opts.truck ?? null,
      client: opts.client ?? null,
    },
  });
}

export function previewTripPdfBlobUrl(opts: TripPdfOpts): string {
  const doc = buildTripPdf(opts);
  const blob = doc.output("blob");
  return URL.createObjectURL(blob);
}

export async function downloadTripPdf(opts: TripPdfOpts): Promise<void> {
  const doc = buildTripPdf(opts);
  const name = safeFileSegment(String(opts.trip.folio || opts.trip.id));
  doc.save(`viaje_${name}.pdf`);
}
