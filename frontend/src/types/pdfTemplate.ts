export type TemplateKind = "settlement" | "trip";

export type ZoneId = "header" | "body" | "footer";

export type BlockType =
  | "logo"
  | "title"
  | "tenant_name"
  | "settlement_meta"
  | "trip_header"
  | "trip_meta"
  | "generated_at"
  | "kpis_summary"
  | "profitability_kpis"
  | "performance_kpis"
  | "trips_table"
  | "fuel_table"
  | "expenses_table"
  | "commission_block"
  | "viaticos_summary"
  | "advances_table"
  | "discounts_table"
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
  settlement_meta: {
    label: "Datos de liquidación",
    description: "Operador y periodo",
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
  generated_at: {
    label: "Fecha de generación",
    zones: ["header", "footer"],
    kinds: BOTH_KINDS,
  },
  kpis_summary: {
    label: "KPIs resumen",
    description: "Viajes, ingresos, km, comisiones, neto",
    zones: ["body"],
    kinds: ["settlement"],
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
    label: "Resumen de viáticos",
    zones: ["body"],
    kinds: ["settlement"],
  },
  advances_table: {
    label: "Anticipos pendientes",
    zones: ["body"],
    kinds: ["settlement"],
  },
  discounts_table: {
    label: "Descuentos pendientes",
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
      { key: "text", label: "Contenido", type: "text", placeholder: "Texto a mostrar" },
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
  titulo: "Liquidación semanal",
  color_header: "#212529",
  color_header_text: "#ffffff",
  color_accent: "#2563eb",
  pie_pagina: "",
};

export const DEFAULT_BRANDING_TRIP: PdfBranding = {
  titulo: "Detalle de viaje",
  color_header: "#212529",
  color_header_text: "#ffffff",
  color_accent: "#2563eb",
  pie_pagina: "",
};

export const DEFAULT_TEMPLATE_SETTLEMENT: PdfTemplate = {
  branding: { ...DEFAULT_BRANDING_SETTLEMENT },
  sections: {
    header: [
      { id: "logo", enabled: true, props: { align: "right" } },
      { id: "title", enabled: true },
      { id: "tenant_name", enabled: true },
      { id: "settlement_meta", enabled: true },
      { id: "generated_at", enabled: true },
    ],
    body: [
      { id: "kpis_summary", enabled: true },
      { id: "trips_table", enabled: true },
      { id: "viaticos_summary", enabled: true },
      { id: "advances_table", enabled: true },
      { id: "discounts_table", enabled: true },
      { id: "net_box", enabled: true },
    ],
    footer: [{ id: "footer_text", enabled: true }],
  },
};

export const DEFAULT_TEMPLATE_TRIP: PdfTemplate = {
  branding: { ...DEFAULT_BRANDING_TRIP },
  sections: {
    header: [
      { id: "logo", enabled: true, props: { align: "right" } },
      { id: "title", enabled: true },
      { id: "tenant_name", enabled: true },
      { id: "trip_header", enabled: true },
      { id: "generated_at", enabled: true },
    ],
    body: [
      { id: "trip_meta", enabled: true },
      { id: "profitability_kpis", enabled: true },
      { id: "performance_kpis", enabled: true },
      { id: "fuel_table", enabled: true },
      { id: "expenses_table", enabled: true },
      { id: "commission_block", enabled: true },
    ],
    footer: [{ id: "footer_text", enabled: true }],
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
