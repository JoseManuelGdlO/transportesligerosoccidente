export type TemplateKind = "settlement" | "trip";

export type ZoneId = "header" | "body" | "footer";

export type BlockType =
  | "logo"
  | "title"
  | "tenant_name"
  | "company_fiscal_block"
  | "period_label"
  | "settlement_meta"
  | "trip_header"
  | "trip_meta"
  | "trip_info_grid"
  | "providers_breakdown_table"
  | "trip_total_box"
  | "generated_at"
  | "page_counter"
  | "profitability_kpis"
  | "performance_kpis"
  | "trips_table"
  | "fuel_table"
  | "expenses_table"
  | "commission_block"
  | "viaticos_summary"
  | "ubicaciones_list"
  | "mercancias_list"
  | "net_box"
  | "footer_text"
  | "custom_text"
  | "spacer"
  | "divider";

export type Alignment = "left" | "center" | "right";
export type BlockSize = "sm" | "md" | "lg";

export interface BlockProps {
  align?: Alignment;
  size?: BlockSize;
  label?: string;
  text?: string;
  mm?: number;
}

export interface BlockInstance {
  id: BlockType;
  enabled: boolean;
  props?: BlockProps;
}

export interface PdfBranding {
  titulo: string;
  color_header: string;
  color_header_text: string;
  color_accent: string;
  pie_pagina: string;
}

export interface PdfTemplate {
  branding: PdfBranding;
  sections: {
    header: BlockInstance[];
    body: BlockInstance[];
    footer: BlockInstance[];
  };
}

export interface PdfTemplatesConfig {
  version: 2;
  settlement: PdfTemplate;
  trip: PdfTemplate;
}

export type PropFieldType = "text" | "select" | "number";

export interface PropFieldDef {
  key: keyof BlockProps;
  label: string;
  type: PropFieldType;
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  /** When true, renders a multiline textarea. Only honored for `type: "text"`. */
  multiline?: boolean;
}

export interface BlockCatalogEntry {
  label: string;
  description?: string;
  zones: ZoneId[];
  /** Available for which template kinds */
  kinds: TemplateKind[];
  /** Allow multiple instances of this block per template? */
  multi?: boolean;
  defaultProps?: BlockProps;
  propSchema?: PropFieldDef[];
}

const ALL_ZONES: ZoneId[] = ["header", "body", "footer"];
const BOTH_KINDS: TemplateKind[] = ["settlement", "trip"];

const COMMON_PROPS: PropFieldDef[] = [
  {
    key: "align",
    label: "Alineación",
    type: "select",
    options: [
      { value: "left", label: "Izquierda" },
      { value: "center", label: "Centro" },
      { value: "right", label: "Derecha" },
    ],
  },
];

export const BLOCK_CATALOG: Record<BlockType, BlockCatalogEntry> = {
  logo: {
    label: "Logo",
    description: "Imagen del logo subido para esta plantilla",
    zones: ["header"],
    kinds: BOTH_KINDS,
    propSchema: COMMON_PROPS,
  },
  title: {
    label: "Título",
    description: "Texto del campo Título del branding",
    zones: ["header"],
    kinds: BOTH_KINDS,
    propSchema: [
      ...COMMON_PROPS,
      {
        key: "size",
        label: "Tamaño",
        type: "select",
        options: [
          { value: "sm", label: "Pequeño" },
          { value: "md", label: "Mediano" },
          { value: "lg", label: "Grande" },
        ],
      },
    ],
  },
  tenant_name: {
    label: "Empresa",
    description: "Nombre de la empresa (tenant)",
    zones: ["header", "body"],
    kinds: BOTH_KINDS,
  },
  company_fiscal_block: {
    label: "Datos de la empresa",
    description:
      "Razón social, dirección, RFC y teléfonos (varias líneas). Se ancla a la esquina superior derecha.",
    zones: ["header", "body", "footer"],
    kinds: BOTH_KINDS,
    defaultProps: {
      align: "right",
      text:
        "RAZÓN SOCIAL S.A. DE C.V.\nDirección, número exterior\nColonia, CP: 00000\nMunicipio, Estado\nRFC: XXXXXXXXXXX\nTels. 00-00000000",
    },
    propSchema: [
      {
        key: "text",
        label: "Texto (una línea por dato)",
        type: "text",
        multiline: true,
        placeholder: "Razón social\nDirección\nCiudad, Estado\nRFC: ...",
      },
      ...COMMON_PROPS,
    ],
  },
  period_label: {
    label: "Periodo / Fecha",
    description: "Periodo del viaje o de la liquidación",
    zones: ["header", "body"],
    kinds: BOTH_KINDS,
    defaultProps: { align: "left", label: "Fecha" },
    propSchema: [
      { key: "label", label: "Etiqueta", type: "text", placeholder: "Fecha / Periodo" },
      ...COMMON_PROPS,
    ],
  },
  settlement_meta: {
    label: "Datos de liquidación",
    description: "Operador y unidad",
    zones: ["header", "body"],
    kinds: ["settlement"],
  },
  trip_header: {
    label: "Encabezado de viaje",
    description: "Folio, ruta, tipo de viaje y estatus",
    zones: ["header", "body"],
    kinds: ["trip"],
  },
  trip_meta: {
    label: "Datos del viaje",
    description: "Cliente, operador, camión, fechas, km, factura",
    zones: ["body"],
    kinds: ["trip"],
  },
  trip_info_grid: {
    label: "Resumen de viaje (2 columnas)",
    description:
      "Folio, ruta, operador, cliente, factura… + Flete, Com. Operador, Gastos, Utilidad y costo/km (estilo análisis).",
    zones: ["body"],
    kinds: ["trip"],
  },
  providers_breakdown_table: {
    label: "Desglose por proveedor",
    description:
      "Diésel agrupado por estación y gastos agrupados por categoría, con subtotal y rendimiento por grupo.",
    zones: ["body"],
    kinds: ["trip"],
  },
  trip_total_box: {
    label: "Total de gastos (caja)",
    description: "Caja resaltada con la suma total de gastos comprobados (diésel + gastos).",
    zones: ["body"],
    kinds: ["trip"],
  },
  generated_at: {
    label: "Fecha de generación",
    zones: ["header", "footer"],
    kinds: BOTH_KINDS,
  },
  page_counter: {
    label: "Numeración de página",
    description: "Muestra «Página X de Y» — útil en el pie de página",
    zones: ["footer", "header"],
    kinds: BOTH_KINDS,
    defaultProps: { align: "right" },
    propSchema: COMMON_PROPS,
  },
  profitability_kpis: {
    label: "KPIs de rentabilidad",
    description: "Ingreso, diesel, gastos, comisión, utilidad, margen",
    zones: ["body"],
    kinds: ["trip"],
  },
  performance_kpis: {
    label: "KPIs de desempeño",
    description: "Km, $/km, rendimiento, costo diesel/km",
    zones: ["body"],
    kinds: ["trip"],
  },
  trips_table: {
    label: "Tabla de viajes",
    description: "Viajes del periodo (viajes, ingresos, km, comisiones, neto)",
    zones: ["body"],
    kinds: ["settlement"],
  },
  fuel_table: {
    label: "Tabla de diésel",
    zones: ["body"],
    kinds: ["trip"],
  },
  expenses_table: {
    label: "Tabla de gastos",
    zones: ["body"],
    kinds: ["trip"],
  },
  commission_block: {
    label: "Bloque de comisión",
    description: "Esquema, tarifa, comisión y override",
    zones: ["body"],
    kinds: ["trip"],
  },
  viaticos_summary: {
    label: "Viáticos, anticipos y descuentos",
    description: "Resumen de viáticos, detalle de anticipos/descuentos y totales del periodo",
    zones: ["body"],
    kinds: ["settlement"],
  },
  ubicaciones_list: {
    label: "Ubicaciones (carta porte)",
    zones: ["body"],
    kinds: ["trip"],
  },
  mercancias_list: {
    label: "Mercancías (carta porte)",
    zones: ["body"],
    kinds: ["trip"],
  },
  net_box: {
    label: "Caja Neto a Pagar",
    zones: ["body"],
    kinds: ["settlement"],
  },
  footer_text: {
    label: "Pie de página",
    description: "Texto del campo Pie de página del branding",
    zones: ["footer"],
    kinds: BOTH_KINDS,
  },
  custom_text: {
    label: "Texto libre",
    description: "Texto editable por bloque",
    zones: ALL_ZONES,
    kinds: BOTH_KINDS,
    multi: true,
    defaultProps: { text: "Texto…", align: "left" },
    propSchema: [
      {
        key: "text",
        label: "Contenido",
        type: "text",
        multiline: true,
        placeholder: "Texto a mostrar",
      },
      ...COMMON_PROPS,
    ],
  },
  spacer: {
    label: "Espacio",
    description: "Separación vertical (mm)",
    zones: ALL_ZONES,
    kinds: BOTH_KINDS,
    multi: true,
    defaultProps: { mm: 6 },
    propSchema: [
      { key: "mm", label: "Altura (mm)", type: "number", min: 1, max: 60, step: 1 },
    ],
  },
  divider: {
    label: "Línea divisoria",
    zones: ALL_ZONES,
    kinds: BOTH_KINDS,
    multi: true,
  },
};

export const DEFAULT_BRANDING_SETTLEMENT: PdfBranding = {
  titulo: "Liquidación Semanal",
  color_header: "#212529",
  color_header_text: "#ffffff",
  color_accent: "#2563eb",
  pie_pagina: "",
};

const DEFAULT_SETTLEMENT_COMPANY_TEXT =
  "RAZÓN SOCIAL S.A. DE C.V.\nDirección, número exterior\nColonia, CP: 00000\nMunicipio, Estado\nRFC: XXXXXXXXXXX\nTels. 00-00000000";

export const DEFAULT_BRANDING_TRIP: PdfBranding = {
  titulo: "Análisis de Viaje",
  color_header: "#212529",
  color_header_text: "#ffffff",
  color_accent: "#2563eb",
  pie_pagina: "",
};

const DEFAULT_TRIP_COMPANY_TEXT =
  "RAZÓN SOCIAL S.A. DE C.V.\nDirección, número exterior\nColonia, CP: 00000\nMunicipio, Estado\nRFC: XXXXXXXXXXX\nTels. 00-00000000";

export const DEFAULT_TEMPLATE_SETTLEMENT: PdfTemplate = {
  branding: { ...DEFAULT_BRANDING_SETTLEMENT },
  sections: {
    header: [
      { id: "logo", enabled: true, props: { align: "right" } },
      { id: "title", enabled: true, props: { align: "left", size: "lg" } },
      {
        id: "company_fiscal_block",
        enabled: true,
        props: { align: "right", text: DEFAULT_SETTLEMENT_COMPANY_TEXT },
      },
      { id: "period_label", enabled: true, props: { align: "left", label: "Periodo" } },
      { id: "settlement_meta", enabled: true },
    ],
    body: [
      { id: "trips_table", enabled: true },
      { id: "viaticos_summary", enabled: true },
      { id: "net_box", enabled: true },
    ],
    footer: [
      { id: "footer_text", enabled: true, props: { align: "center" } },
      { id: "generated_at", enabled: true, props: { align: "left" } },
      { id: "page_counter", enabled: true, props: { align: "right" } },
    ],
  },
};

export const DEFAULT_TEMPLATE_TRIP: PdfTemplate = {
  branding: { ...DEFAULT_BRANDING_TRIP },
  sections: {
    header: [
      { id: "logo", enabled: true, props: { align: "right" } },
      { id: "title", enabled: true, props: { align: "left", size: "lg" } },
      {
        id: "company_fiscal_block",
        enabled: true,
        props: { align: "right", text: DEFAULT_TRIP_COMPANY_TEXT },
      },
      { id: "period_label", enabled: true, props: { align: "left", label: "Fecha" } },
    ],
    body: [
      { id: "trip_info_grid", enabled: true },
      { id: "providers_breakdown_table", enabled: true },
      { id: "trip_total_box", enabled: true },
    ],
    footer: [
      { id: "footer_text", enabled: true, props: { align: "center" } },
      { id: "generated_at", enabled: true, props: { align: "left" } },
      { id: "page_counter", enabled: true, props: { align: "right" } },
    ],
  },
};

export const DEFAULT_PDF_TEMPLATES: PdfTemplatesConfig = {
  version: 2,
  settlement: DEFAULT_TEMPLATE_SETTLEMENT,
  trip: DEFAULT_TEMPLATE_TRIP,
};

export function isBlockType(id: string): id is BlockType {
  return Object.prototype.hasOwnProperty.call(BLOCK_CATALOG, id);
}

export function blockAllowedInZone(id: BlockType, zone: ZoneId, kind: TemplateKind): boolean {
  const def = BLOCK_CATALOG[id];
  if (!def) return false;
  if (!def.kinds.includes(kind)) return false;
  return def.zones.includes(zone);
}

export function blockAvailableForKind(id: BlockType, kind: TemplateKind): boolean {
  const def = BLOCK_CATALOG[id];
  return Boolean(def && def.kinds.includes(kind));
}
