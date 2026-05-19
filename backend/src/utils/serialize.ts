import type { FuelLoad } from "../models/FuelLoad";
import type { FuelTicket } from "../models/FuelTicket";
import type { Expense } from "../models/Expense";
import type { Trip } from "../models/Trip";
import type { Truck } from "../models/Truck";
import type { Driver } from "../models/Driver";
import type { Client } from "../models/Client";
import type { User } from "../models/User";
import type { Role } from "../models/Role";
import type { Permission } from "../models/Permission";
import type { Settlement } from "../models/Settlement";
import type { Tenant } from "../models/Tenant";
import type { TripUbicacion } from "../models/TripUbicacion";
import type { TripMercancia } from "../models/TripMercancia";
import type { CartaPorte } from "../models/CartaPorte";
import { num, iso } from "./numbers";

export function fuelTicketToJson(
  ft: FuelTicket,
  truck?: { numero_economico?: string; placas?: string },
): Record<string, unknown> {
  const p = ft.get({ plain: true }) as Record<string, unknown>;
  return {
    id: p.id,
    truck_id: p.truck_id,
    fecha:
      typeof p.fecha === "string"
        ? p.fecha
        : (iso(p.fecha) ?? "").slice(0, 10),
    hora: p.hora != null ? String(p.hora).slice(0, 8) : undefined,
    folio_tag: p.folio_tag ?? undefined,
    numero_economico_raw: p.numero_economico_raw ?? undefined,
    placas_raw: p.placas_raw ?? undefined,
    odometro: p.odometro,
    litros: num(p.litros),
    precio_litro: num(p.precio_litro),
    importe_total: num(p.importe_total),
    ubicacion: p.ubicacion,
    origen: p.origen,
    external_id: p.external_id ?? undefined,
    numero_economico: truck?.numero_economico,
    placas: truck?.placas,
  };
}

export function fuelToJson(f: FuelLoad): Record<string, unknown> {
  const p = f.get({ plain: true }) as Record<string, unknown>;
  return {
    id: p.id,
    litros: num(p.litros),
    precio_litro: num(p.precio_litro),
    ubicacion: p.ubicacion,
    fecha: iso(p.fecha),
    es_foraneo: !!p.es_foraneo,
    estacion_nombre: p.estacion_nombre ?? undefined,
    es_estacion_empresa: p.es_estacion_empresa !== false,
    comprobante_url: p.comprobante_url ?? undefined,
  };
}

export function expenseToJson(e: Expense): Record<string, unknown> {
  const p = e.get({ plain: true }) as Record<string, unknown>;
  return {
    id: p.id,
    categoria: p.categoria,
    descripcion: p.descripcion,
    monto: num(p.monto),
    comprobado: p.comprobado,
    fecha: iso(p.fecha),
  };
}

export function tripUbicacionToJson(u: TripUbicacion): Record<string, unknown> {
  const p = u.get({ plain: true }) as Record<string, unknown>;
  return {
    id: p.id,
    tipo: p.tipo,
    rfc: p.rfc ?? undefined,
    nombre: p.nombre ?? undefined,
    fecha_hora: p.fecha_hora ? iso(p.fecha_hora) : undefined,
    calle: p.calle ?? undefined,
    colonia: p.colonia ?? undefined,
    municipio: p.municipio ?? undefined,
    localidad: p.localidad ?? undefined,
    estado: p.estado ?? undefined,
    cp: p.cp ?? undefined,
    distancia_km: p.distancia_km != null ? num(p.distancia_km) : undefined,
  };
}

export function tripMercanciaToJson(m: TripMercancia): Record<string, unknown> {
  const p = m.get({ plain: true }) as Record<string, unknown>;
  return {
    id: p.id,
    descripcion: p.descripcion,
    cantidad: num(p.cantidad),
    unidad: p.unidad,
    peso_kg: num(p.peso_kg),
    clave_prod_serv: p.clave_prod_serv ?? undefined,
    material_peligroso: !!p.material_peligroso,
    embalaje: p.embalaje ?? undefined,
  };
}

export function cartaPorteToJson(cp: CartaPorte): Record<string, unknown> {
  const p = cp.get({ plain: true }) as Record<string, unknown>;
  return {
    id: p.id,
    trip_id: p.trip_id,
    estatus: p.estatus,
    uuid: p.uuid ?? undefined,
    serie: p.serie ?? undefined,
    folio_cfdi: p.folio_cfdi ?? undefined,
    pac_proveedor: p.pac_proveedor ?? undefined,
    error_mensaje: p.error_mensaje ?? undefined,
    timbrado_at: p.timbrado_at ? iso(p.timbrado_at) : undefined,
    has_xml: !!p.xml_timbrado,
  };
}

export function tripToJson(t: Trip): Record<string, unknown> {
  const fuel = (t as Trip & { fuel?: FuelLoad[] }).fuel ?? [];
  const expenses = (t as Trip & { expenses?: Expense[] }).expenses ?? [];
  const ubicaciones = (t as Trip & { ubicaciones?: TripUbicacion[] }).ubicaciones ?? [];
  const mercancias = (t as Trip & { mercancias?: TripMercancia[] }).mercancias ?? [];
  const cartaPorte = (t as Trip & { cartaPorte?: CartaPorte | null }).cartaPorte;
  return {
    id: String(t.id),
    folio: t.folio,
    truck_id: String(t.truck_id),
    driver_id: String(t.driver_id),
    client_id: String(t.client_id),
    origen: t.origen,
    destino: t.destino,
    fecha_salida: iso(t.fecha_salida),
    fecha_llegada: t.fecha_llegada ? iso(t.fecha_llegada) : undefined,
    km_inicial: t.km_inicial,
    km_final: t.km_final ?? undefined,
    tarifa: num(t.tarifa),
    viaticos_entregados: num(t.viaticos_entregados),
    num_factura: t.num_factura ?? undefined,
    comision_override: t.comision_override != null ? num(t.comision_override) : undefined,
    tipo_viaje: t.tipo_viaje ?? "local",
    settlement_id: t.settlement_id ?? undefined,
    estatus: t.estatus,
    fuel: fuel.map((row) => fuelToJson(row)),
    expenses: expenses.map((row) => expenseToJson(row)),
    ubicaciones: ubicaciones.map((row) => tripUbicacionToJson(row)),
    mercancias: mercancias.map((row) => tripMercanciaToJson(row)),
    carta_porte: cartaPorte ? cartaPorteToJson(cartaPorte) : undefined,
  };
}

export function truckToJson(t: Truck): Record<string, unknown> {
  const p = t.get({ plain: true }) as Record<string, unknown>;
  return {
    id: p.id,
    numero_economico: p.numero_economico,
    placas: p.placas,
    folio_tag: p.folio_tag ?? undefined,
    marca: p.marca,
    modelo: p.modelo,
    anio: p.anio,
    rendimiento_esperado: num(p.rendimiento_esperado),
    costo_km_ref: num(p.costo_km_ref),
    estatus: p.estatus,
    config_vehicular: p.config_vehicular ?? undefined,
    perm_sct: p.perm_sct ?? undefined,
    num_permiso_sct: p.num_permiso_sct ?? undefined,
    peso_bruto_vehicular: p.peso_bruto_vehicular != null ? num(p.peso_bruto_vehicular) : undefined,
    aseguradora_resp_civil: p.aseguradora_resp_civil ?? undefined,
    poliza_resp_civil: p.poliza_resp_civil ?? undefined,
  };
}

export function driverToJson(d: Driver): Record<string, unknown> {
  const p = d.get({ plain: true }) as Record<string, unknown>;
  return {
    id: p.id,
    nombre: p.nombre,
    telefono: p.telefono,
    licencia: p.licencia,
    fecha_ingreso: p.fecha_ingreso,
    comision_tipo: p.comision_tipo,
    comision_valor: num(p.comision_valor),
    comision_valor_local: num(p.comision_valor_local ?? p.comision_valor),
    comision_valor_foraneo: num(p.comision_valor_foraneo ?? p.comision_valor),
    estatus: p.estatus,
    rfc: p.rfc ?? undefined,
    licencia_federal: p.licencia_federal ?? undefined,
  };
}

export function clientToJson(c: Client): Record<string, unknown> {
  const p = c.get({ plain: true }) as Record<string, unknown>;
  return {
    id: p.id,
    razon_social: p.razon_social,
    rfc: p.rfc,
    contacto: p.contacto,
    telefono: p.telefono,
    calle: p.calle ?? undefined,
    colonia: p.colonia ?? undefined,
    municipio: p.municipio ?? undefined,
    estado: p.estado ?? undefined,
    cp: p.cp ?? undefined,
    pais: p.pais ?? undefined,
  };
}

export function tenantFiscalToJson(t: Tenant): Record<string, unknown> {
  const p = t.get({ plain: true }) as Record<string, unknown>;
  return {
    rfc: p.rfc ?? undefined,
    razon_social: p.razon_social ?? undefined,
    regimen_fiscal: p.regimen_fiscal ?? undefined,
    cp_fiscal: p.cp_fiscal ?? undefined,
    calle_fiscal: p.calle_fiscal ?? undefined,
    colonia_fiscal: p.colonia_fiscal ?? undefined,
    municipio_fiscal: p.municipio_fiscal ?? undefined,
    estado_fiscal: p.estado_fiscal ?? undefined,
    pac_proveedor: p.pac_proveedor ?? undefined,
    pac_url: p.pac_url ?? undefined,
    pac_usuario: p.pac_usuario ?? undefined,
    has_pac_token: !!p.pac_token_enc,
    has_csd: !!(p.csd_cer_path && p.csd_key_path),
    cfdi_serie: p.cfdi_serie ?? undefined,
  };
}

export function userToJson(u: User, roleSlug: string): Record<string, unknown> {
  const p = u.get({ plain: true }) as Record<string, unknown> & { creado_en?: Date; createdAt?: Date };
  const creado = p.creado_en ?? p.createdAt;
  return {
    id: p.id,
    nombre: p.nombre,
    email: p.email,
    role: roleSlug,
    estatus: p.estatus,
    ultimo_acceso: p.ultimo_acceso ? iso(p.ultimo_acceso) : undefined,
    creado_en: creado ? iso(creado) : undefined,
  };
}

export function roleDefinitionToJson(role: Role, perms: Permission[]): Record<string, unknown> {
  const r = role.get({ plain: true }) as Record<string, unknown>;
  return {
    role: r.slug,
    nombre: r.nombre,
    descripcion: r.descripcion ?? "",
    permisos: perms.map((p) => p.slug),
  };
}

export function settlementToJson(s: Settlement): Record<string, unknown> {
  const p = s.get({ plain: true }) as Record<string, unknown>;
  return {
    id: p.id,
    driver_id: p.driver_id,
    fecha_inicio: p.fecha_inicio,
    fecha_fin: p.fecha_fin,
    cerrado: p.cerrado,
    cerrado_at: p.cerrado_at ? iso(p.cerrado_at) : undefined,
    snapshot: p.snapshot ?? undefined,
  };
}

export type PdfBrandingJson = {
  titulo: string;
  color_header: string;
  color_header_text: string;
  color_accent: string;
  pie_pagina: string;
};

export type BlockInstanceJson = {
  id: string;
  enabled: boolean;
  props?: Record<string, unknown>;
};

export type PdfTemplateJson = {
  branding: PdfBrandingJson;
  sections: {
    header: BlockInstanceJson[];
    body: BlockInstanceJson[];
    footer: BlockInstanceJson[];
  };
};

export type PdfTemplatesConfigJson = {
  version: 2;
  settlement: PdfTemplateJson;
  trip: PdfTemplateJson;
};

const HEX_RE = /^#[0-9A-Fa-f]{6}$/;

const DEFAULT_BRANDING_SETTLEMENT: PdfBrandingJson = {
  titulo: "Liquidación semanal",
  color_header: "#212529",
  color_header_text: "#ffffff",
  color_accent: "#2563eb",
  pie_pagina: "",
};

const DEFAULT_BRANDING_TRIP: PdfBrandingJson = {
  titulo: "Detalle de viaje",
  color_header: "#212529",
  color_header_text: "#ffffff",
  color_accent: "#2563eb",
  pie_pagina: "",
};

export const DEFAULT_TEMPLATE_SETTLEMENT: PdfTemplateJson = {
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
    footer: [
      { id: "footer_text", enabled: true },
    ],
  },
};

export const DEFAULT_TEMPLATE_TRIP: PdfTemplateJson = {
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
    footer: [
      { id: "footer_text", enabled: true },
    ],
  },
};

export const DEFAULT_PDF_CONFIG: PdfTemplatesConfigJson = {
  version: 2,
  settlement: DEFAULT_TEMPLATE_SETTLEMENT,
  trip: DEFAULT_TEMPLATE_TRIP,
};

function normalizeBranding(raw: unknown, fallback: PdfBrandingJson): PdfBrandingJson {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    titulo:
      typeof o.titulo === "string" && o.titulo.trim()
        ? o.titulo.trim().slice(0, 80)
        : fallback.titulo,
    color_header:
      typeof o.color_header === "string" && HEX_RE.test(o.color_header)
        ? o.color_header
        : fallback.color_header,
    color_header_text:
      typeof o.color_header_text === "string" && HEX_RE.test(o.color_header_text)
        ? o.color_header_text
        : fallback.color_header_text,
    color_accent:
      typeof o.color_accent === "string" && HEX_RE.test(o.color_accent)
        ? o.color_accent
        : fallback.color_accent,
    pie_pagina: typeof o.pie_pagina === "string" ? o.pie_pagina.slice(0, 200) : "",
  };
}

function normalizeBlocks(raw: unknown): BlockInstanceJson[] {
  if (!Array.isArray(raw)) return [];
  const out: BlockInstanceJson[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    if (typeof o.id !== "string" || !o.id) continue;
    const block: BlockInstanceJson = {
      id: o.id.slice(0, 64),
      enabled: o.enabled !== false,
    };
    if (o.props && typeof o.props === "object" && !Array.isArray(o.props)) {
      block.props = o.props as Record<string, unknown>;
    }
    out.push(block);
  }
  return out;
}

function normalizeTemplate(raw: unknown, fallback: PdfTemplateJson): PdfTemplateJson {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const sectionsRaw =
    o.sections && typeof o.sections === "object" ? (o.sections as Record<string, unknown>) : {};
  const header = normalizeBlocks(sectionsRaw.header);
  const body = normalizeBlocks(sectionsRaw.body);
  const footer = normalizeBlocks(sectionsRaw.footer);
  return {
    branding: normalizeBranding(o.branding, fallback.branding),
    sections: {
      header: header.length > 0 ? header : fallback.sections.header,
      body: body.length > 0 ? body : fallback.sections.body,
      footer: footer.length > 0 ? footer : fallback.sections.footer,
    },
  };
}

export function normalizePdfConfig(raw: unknown): PdfTemplatesConfigJson {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};

  const isV2 = (o.version === 2) || ("settlement" in o) || ("trip" in o);

  if (isV2) {
    return {
      version: 2,
      settlement: normalizeTemplate(o.settlement, DEFAULT_TEMPLATE_SETTLEMENT),
      trip: normalizeTemplate(o.trip, DEFAULT_TEMPLATE_TRIP),
    };
  }

  const settlementBranding: PdfBrandingJson = {
    titulo:
      typeof o.titulo === "string" && o.titulo.trim()
        ? o.titulo.trim().slice(0, 80)
        : DEFAULT_BRANDING_SETTLEMENT.titulo,
    color_header:
      typeof o.color_header === "string" && HEX_RE.test(o.color_header)
        ? o.color_header
        : DEFAULT_BRANDING_SETTLEMENT.color_header,
    color_header_text:
      typeof o.color_header_text === "string" && HEX_RE.test(o.color_header_text)
        ? o.color_header_text
        : DEFAULT_BRANDING_SETTLEMENT.color_header_text,
    color_accent: DEFAULT_BRANDING_SETTLEMENT.color_accent,
    pie_pagina: typeof o.pie_pagina === "string" ? o.pie_pagina.slice(0, 200) : "",
  };
  return {
    version: 2,
    settlement: {
      branding: settlementBranding,
      sections: { ...DEFAULT_TEMPLATE_SETTLEMENT.sections },
    },
    trip: {
      branding: { ...DEFAULT_BRANDING_TRIP },
      sections: { ...DEFAULT_TEMPLATE_TRIP.sections },
    },
  };
}

export function tenantToJson(t: Tenant): Record<string, unknown> {
  const p = t.get({ plain: true }) as Record<string, unknown>;
  const pdfConfig = normalizePdfConfig(p.pdf_config);
  return {
    id: p.id,
    slug: p.slug,
    nombre: p.nombre,
    estatus: p.estatus,
    logo_url: p.logo_url ?? undefined,
    color_primary: p.color_primary ?? undefined,
    color_accent: p.color_accent ?? undefined,
    color_sidebar: p.color_sidebar ?? undefined,
    pdf_config: pdfConfig,
    has_pdf_logo: Boolean(p.pdf_logo_path),
    has_pdf_trip_logo: Boolean(p.pdf_trip_logo_path),
  };
}
