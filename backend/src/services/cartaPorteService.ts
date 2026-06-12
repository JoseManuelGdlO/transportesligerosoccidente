import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  Trip,
  Tenant,
  Truck,
  Driver,
  Client,
  CartaPorte,
  TripUbicacion,
  TripMercancia,
} from "../models";
import { getTripOrThrow } from "./tripService";
import { STATUSES_INCLUDE, tripHasStatusSlug } from "./tripStatusService";
import { getPacProvider } from "./pac";
import { buildFactura40Payload } from "./pac/sicofi/buildFactura40Payload";
import { validateSicofiFactura40 } from "./pac/sicofi/validateSicofiFactura40";
import type { TimbradoContext, TimbradoOpts } from "./pac/types";
import { ensureUbicacionesFromClient, defaultIdUbicacionSat } from "./tripFiscalService";
import { num } from "../utils/numbers";

function err(msg: string, status = 400): Error {
  const e = new Error(msg);
  (e as Error & { status?: number }).status = status;
  return e;
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatFecha(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function idUbicacion(u: TripUbicacion, tripId: string): string {
  return u.id_ubicacion_sat || defaultIdUbicacionSat(u.tipo, tripId, u.orden);
}

function domicilioAttrs(
  u: TripUbicacion,
  calleFallback: string,
  client: Client,
): string {
  const parts = [
    `Calle="${esc(u.calle || calleFallback)}"`,
    u.numero_exterior ? ` NumeroExterior="${esc(u.numero_exterior)}"` : "",
    u.numero_interior ? ` NumeroInterior="${esc(u.numero_interior)}"` : "",
    u.colonia ? ` Colonia="${esc(u.colonia)}"` : "",
    u.municipio ? ` Municipio="${esc(u.municipio)}"` : "",
    u.localidad ? ` Localidad="${esc(u.localidad)}"` : "",
    ` Estado="${esc(u.estado!)}"`,
    ` Pais="${esc(u.pais || client.pais || "MEX")}"`,
    ` CodigoPostal="${esc(u.cp!)}"`,
  ];
  return parts.join("");
}

export async function getOrCreateCartaPorte(tenantId: string, tripId: string) {
  await ensureUbicacionesFromClient(tenantId, tripId);
  let cp = await CartaPorte.findOne({ where: { tenant_id: tenantId, trip_id: tripId } });
  if (!cp) {
    const trip = await Trip.findOne({ where: { id: tripId, tenant_id: tenantId } });
    cp = await CartaPorte.create({
      id: randomUUID(),
      tenant_id: tenantId,
      trip_id: tripId,
      estatus: "borrador",
      id_ccp: randomUUID(),
      transporte_internacional: trip?.tipo_viaje === "foraneo",
    } as never);
  } else if (!cp.id_ccp) {
    await cp.update({ id_ccp: randomUUID() } as never);
  }
  return cp;
}

export async function getCartaPorteForTrip(tenantId: string, tripId: string) {
  await getTripOrThrow(tenantId, tripId, false);
  return getOrCreateCartaPorte(tenantId, tripId);
}

async function loadTripContext(tenantId: string, tripId: string) {
  const trip = await Trip.findOne({
    where: { id: tripId, tenant_id: tenantId },
    include: [
      STATUSES_INCLUDE,
      { association: "paradas" },
      { association: "ubicaciones" },
      { association: "mercancias" },
      { model: Truck },
      { model: Driver },
      { model: Client },
    ],
  });
  if (!trip) throw err("Viaje no encontrado", 404);
  const tenant = await Tenant.findByPk(tenantId);
  if (!tenant) throw err("Empresa no encontrada", 404);
  const cartaPorte = await getOrCreateCartaPorte(tenantId, tripId);
  return { trip, tenant, cartaPorte };
}

export function validateCartaPorteData(
  trip: Trip,
  tenant: Tenant,
  ubicaciones: TripUbicacion[],
  mercancias: TripMercancia[],
  truck?: Truck | null,
  driver?: Driver | null,
): string[] {
  const issues: string[] = [];
  if (!tenant.rfc) issues.push("RFC de la empresa no configurado");
  if (!tenant.razon_social) issues.push("Razón social de la empresa no configurada");
  if (!tenant.regimen_fiscal) issues.push("Régimen fiscal no configurado");
  if (!tenant.cp_fiscal) issues.push("Código postal fiscal de la empresa no configurado");
  if (!tenant.csd_cer_path || !tenant.csd_key_path) {
    issues.push("Certificados CSD (.cer y .key) no cargados");
  }
  const sorted = [...ubicaciones].sort((a, b) => a.orden - b.orden);
  if (sorted.length < 2) {
    issues.push("Se requieren al menos 2 ubicaciones (origen y destino)");
  }
  const origen = sorted.find((u) => u.orden === 1) ?? sorted[0];
  const destinos = sorted.filter((u) => u.orden > 1);
  if (!origen?.cp) issues.push("Ubicación origen: falta código postal");
  if (!origen?.estado) issues.push("Ubicación origen: falta estado");
  for (const d of destinos) {
    const label = d.orden === sorted.length ? "destino final" : `parada ${d.orden}`;
    if (!d.cp) issues.push(`Ubicación ${label}: falta código postal`);
    if (!d.estado) issues.push(`Ubicación ${label}: falta estado`);
    if (!d.distancia_km) issues.push(`Ubicación ${label}: falta distancia del tramo en km`);
  }
  if (mercancias.length === 0) issues.push("Agrega al menos una mercancía");
  if (!truck?.config_vehicular) issues.push("Camión: falta configuración vehicular SAT");
  if (!truck?.perm_sct) issues.push("Camión: falta permiso SCT");
  if (!truck?.num_permiso_sct) issues.push("Camión: falta número de permiso SCT");
  if (!truck?.peso_bruto_vehicular) issues.push("Camión: falta peso bruto vehicular");
  if (!truck?.aseguradora_resp_civil || truck.aseguradora_resp_civil === "NA") {
    issues.push("Camión: falta aseguradora de responsabilidad civil");
  }
  if (!truck?.poliza_resp_civil || truck.poliza_resp_civil === "NA") {
    issues.push("Camión: falta póliza de responsabilidad civil");
  }
  if (!driver?.nombre) issues.push("Operador no asignado");
  if (!driver?.rfc) issues.push("Operador: falta RFC");
  if (!driver?.licencia_federal && !driver?.licencia) {
    issues.push("Operador: falta licencia federal");
  }
  if (!tripHasStatusSlug(trip, "en_curso") && !tripHasStatusSlug(trip, "cerrado")) {
    issues.push("Estado de viaje no válido para carta porte");
  }
  return issues;
}

export function buildCartaPorteXml(
  trip: Trip,
  tenant: Tenant,
  cartaPorte: CartaPorte,
  ubicaciones: TripUbicacion[],
  mercancias: TripMercancia[],
  truck: Truck,
  driver: Driver,
  client: Client,
  folio: string,
): string {
  const sorted = [...ubicaciones].sort((a, b) => a.orden - b.orden);
  const origen = sorted[0];
  const destinos = sorted.slice(1);
  const ultimo = destinos[destinos.length - 1];
  const idOrigen = idUbicacion(origen, trip.id);
  const idDestinoFinal = idUbicacion(ultimo, trip.id);
  const totalDist = destinos.reduce((s, d) => s + num(d.distancia_km), 0);
  const now = formatFecha(new Date());
  const transpInternac =
    cartaPorte.transporte_internacional || trip.tipo_viaje === "foraneo" ? "Sí" : "No";
  const idCcp = cartaPorte.id_ccp || randomUUID();

  const paradas = (trip as Trip & { paradas?: { orden: number; etiqueta: string }[] }).paradas ?? [];
  const etiquetaByOrden = new Map(paradas.map((p) => [p.orden, p.etiqueta]));
  const calleFallback = (u: TripUbicacion) =>
    u.calle || etiquetaByOrden.get(u.orden) || (u.orden === 1 ? trip.origen : trip.destino);

  const ubicXml = sorted
    .map((u) => {
      const idUb = idUbicacion(u, trip.id);
      const fecha = u.fecha_hora ? formatFecha(new Date(u.fecha_hora)) : now;
      const dom = domicilioAttrs(u, calleFallback(u), client);
      if (u.orden === 1) {
        return `<cartaporte31:Ubicacion TipoUbicacion="Origen" IDUbicacion="${esc(idUb)}" RFCRemitenteDestinatario="${esc(u.rfc || client.rfc)}" NombreRemitenteDestinatario="${esc(u.nombre || client.razon_social)}" FechaHoraSalidaLlegada="${fecha}">
          <cartaporte31:Domicilio ${dom} />
        </cartaporte31:Ubicacion>`;
      }
      return `<cartaporte31:Ubicacion TipoUbicacion="Destino" IDUbicacion="${esc(idUb)}" RFCRemitenteDestinatario="${esc(u.rfc || client.rfc)}" NombreRemitenteDestinatario="${esc(u.nombre || client.razon_social)}" FechaHoraSalidaLlegada="${fecha}" DistanciaRecorrida="${u.distancia_km}">
          <cartaporte31:Domicilio ${dom} />
        </cartaporte31:Ubicacion>`;
    })
    .join("");

  const mercXml = mercancias
    .map((m) => {
      const cantTransp = m.cantidad_transportada ?? m.cantidad;
      const bienes = m.clave_prod_serv ? ` BienesTransp="${esc(m.clave_prod_serv)}"` : "";
      return `<cartaporte31:Mercancia Descripcion="${esc(m.descripcion)}" Cantidad="${m.cantidad}" ClaveUnidad="${esc(m.unidad)}" PesoEnKg="${m.peso_kg}"${bienes}>
        <cartaporte31:CantidadTransportada Cantidad="${cantTransp}" IDOrigen="${esc(idOrigen)}" IDDestino="${esc(idDestinoFinal)}" />
      </cartaporte31:Mercancia>`;
    })
    .join("");

  const tipoFigura = driver.tipo_figura || "01";

  const regimenReceptor = client.regimen_fiscal || "601";

  return `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" xmlns:cartaporte31="http://www.sat.gob.mx/CartaPorte31" Version="4.0" Serie="${esc(tenant.cfdi_serie || "CP")}" Folio="${esc(folio)}" Fecha="${now}" SubTotal="0" Moneda="XXX" Total="0" TipoDeComprobante="T" Exportacion="01" LugarExpedicion="${esc(tenant.cp_fiscal || "00000")}" MetodoPago="PUE" FormaPago="99">
  <cfdi:Emisor Rfc="${esc(tenant.rfc!)}" Nombre="${esc(tenant.razon_social!)}" RegimenFiscal="${esc(tenant.regimen_fiscal!)}" />
  <cfdi:Receptor Rfc="${esc(client.rfc)}" Nombre="${esc(client.razon_social)}" DomicilioFiscalReceptor="${esc(client.cp || ultimo.cp || "00000")}" RegimenFiscalReceptor="${esc(regimenReceptor)}" UsoCFDI="S01" />
  <cfdi:Conceptos>
    <cfdi:Concepto ClaveProdServ="78101800" Cantidad="1" ClaveUnidad="E48" Descripcion="Transporte de carga" ValorUnitario="0" Importe="0" ObjetoImp="01" />
  </cfdi:Conceptos>
  <cfdi:Complemento>
    <cartaporte31:CartaPorte Version="3.1" IdCCP="${esc(idCcp)}" TranspInternac="${transpInternac}" TotalDistRec="${totalDist}">
      <cartaporte31:Ubicaciones>
        ${ubicXml}
      </cartaporte31:Ubicaciones>
      <cartaporte31:Mercancias PesoBrutoTotal="${mercancias.reduce((s, m) => s + num(m.peso_kg), 0)}" UnidadPeso="KGM" NumTotalMercancias="${mercancias.length}">
        ${mercXml}
      </cartaporte31:Mercancias>
      <cartaporte31:FiguraTransporte>
        <cartaporte31:TiposFigura TipoFigura="${esc(tipoFigura)}" RFCFigura="${esc(driver.rfc || "XAXX010101000")}" NumLicencia="${esc(driver.licencia_federal || driver.licencia)}" NombreFigura="${esc(driver.nombre)}" />
      </cartaporte31:FiguraTransporte>
      <cartaporte31:AutotransporteFederal PermSCT="${esc(truck.perm_sct!)}" NumPermisoSCT="${esc(truck.num_permiso_sct!)}">
        <cartaporte31:IdentificacionVehicular ConfigVehicular="${esc(truck.config_vehicular!)}" PesoBrutoVehicular="${truck.peso_bruto_vehicular || 0}" PlacaVM="${esc(truck.placas)}" AnioModeloVM="${truck.anio}" />
        <cartaporte31:Seguros AseguraRespCivil="${esc(truck.aseguradora_resp_civil || "NA")}" PolizaRespCivil="${esc(truck.poliza_resp_civil || "NA")}" />
      </cartaporte31:AutotransporteFederal>
    </cartaporte31:CartaPorte>
  </cfdi:Complemento>
</cfdi:Comprobante>`;
}

function buildTimbradoContext(
  trip: Trip,
  tenant: Tenant,
  cartaPorte: CartaPorte,
  ubicaciones: TripUbicacion[],
  mercancias: TripMercancia[],
  truck: Truck,
  driver: Driver,
  client: Client,
  tipo: "ingreso" | "traslado",
  opts?: TimbradoOpts,
): TimbradoContext {
  return {
    tipo,
    trip,
    tenant,
    cartaPorte,
    ubicaciones,
    mercancias,
    truck,
    driver,
    client,
    opts,
  };
}

export async function previewCartaPorte(
  tenantId: string,
  tripId: string,
  tipo: "ingreso" | "traslado" = "traslado",
  opts?: TimbradoOpts,
) {
  const { trip, tenant, cartaPorte } = await loadTripContext(tenantId, tripId);
  const truck = (trip as Trip & { Truck?: Truck }).Truck;
  const driver = (trip as Trip & { Driver?: Driver }).Driver;
  const client = (trip as Trip & { Client?: Client }).Client;
  const ubicaciones = (trip as Trip & { ubicaciones?: TripUbicacion[] }).ubicaciones ?? [];
  const mercancias = (trip as Trip & { mercancias?: TripMercancia[] }).mercancias ?? [];
  const isSicofi = (tenant.pac_proveedor || "").toLowerCase() === "sicofi";
  let issues = validateCartaPorteData(trip, tenant, ubicaciones, mercancias, truck, driver);
  if (isSicofi) {
    issues = issues.filter((i) => !i.includes("Certificados CSD"));
  }
  const cp = cartaPorte;
  const folio = cp.folio_cfdi || trip.folio.replace(/[^0-9]/g, "").slice(-8) || "1";
  let payload_preview: Record<string, unknown> | undefined;
  if (truck && driver && client) {
    const ctx = buildTimbradoContext(
      trip,
      tenant,
      cp,
      ubicaciones,
      mercancias,
      truck,
      driver,
      client,
      tipo,
      opts,
    );
    if (isSicofi) {
      const sicofiIssues = validateSicofiFactura40(ctx);
      issues = [...issues, ...sicofiIssues];
      if (issues.length === 0) {
        payload_preview = buildFactura40Payload(ctx) as unknown as Record<string, unknown>;
      }
    } else if (issues.length === 0) {
      payload_preview = buildFactura40Payload(ctx) as unknown as Record<string, unknown>;
    }
  }
  const xml =
    issues.length === 0 && truck && driver && client
      ? buildCartaPorteXml(trip, tenant, cp, ubicaciones, mercancias, truck, driver, client, folio)
      : undefined;
  return { valid: issues.length === 0, issues, xml, payload_preview, cartaPorte: cp };
}

export async function timbrarCartaPorte(
  tenantId: string,
  tripId: string,
  tipo: "ingreso" | "traslado" = "traslado",
  opts?: TimbradoOpts,
) {
  const preview = await previewCartaPorte(tenantId, tripId, tipo, opts);
  if (!preview.valid) {
    throw err(preview.issues.join("; ") || "Datos incompletos para timbrar");
  }
  const { trip, tenant } = await loadTripContext(tenantId, tripId);
  const truck = (trip as Trip & { Truck?: Truck }).Truck;
  const driver = (trip as Trip & { Driver?: Driver }).Driver;
  const client = (trip as Trip & { Client?: Client }).Client;
  if (!truck || !driver || !client) {
    throw err("Datos incompletos para timbrar");
  }
  const ubicaciones = (trip as Trip & { ubicaciones?: TripUbicacion[] }).ubicaciones ?? [];
  const mercancias = (trip as Trip & { mercancias?: TripMercancia[] }).mercancias ?? [];
  const cp = await getOrCreateCartaPorte(tenantId, tripId);
  if (cp.estatus === "timbrada") {
    throw err("La carta porte ya está timbrada");
  }
  const pac = getPacProvider(tenant);
  const ctx = buildTimbradoContext(
    trip,
    tenant,
    cp,
    ubicaciones,
    mercancias,
    truck,
    driver,
    client,
    tipo,
    opts,
  );
  try {
    const result = await pac.timbrar(ctx);
    const uploadRoot = process.env.UPLOAD_DIR || "./uploads";
    const dir = path.join(uploadRoot, tenantId, "cartas-porte");
    await mkdir(dir, { recursive: true });
    const xmlPath = path.join(dir, `${tripId}.xml`);
    await writeFile(xmlPath, result.xmlTimbrado, "utf8");
    const serie = result.serie || tenant.cfdi_serie || "CP";
    const folioCfdi = result.folio || cp.folio_cfdi;
    await cp.update({
      estatus: "timbrada",
      uuid: result.uuid,
      xml_timbrado: result.xmlTimbrado,
      pac_proveedor: pac.name,
      pac_response: result.pacResponse ?? null,
      error_mensaje: null,
      timbrado_at: new Date(),
      folio_cfdi: folioCfdi,
      serie,
      tipo_comprobante: tipo,
    } as never);
    if (tipo === "ingreso" && folioCfdi && !trip.num_factura?.trim()) {
      await trip.update({ num_factura: `${serie}-${folioCfdi}` } as never);
    }
    return cp;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al timbrar";
    await cp.update({ estatus: "error", error_mensaje: msg } as never);
    throw err(msg, 502);
  }
}

export async function cancelarCartaPorte(tenantId: string, tripId: string, motivo: string) {
  const cp = await getOrCreateCartaPorte(tenantId, tripId);
  if (cp.estatus !== "timbrada" || !cp.uuid) {
    throw err("Solo se puede cancelar una carta porte timbrada");
  }
  const tenant = await Tenant.findByPk(tenantId);
  if (!tenant?.rfc) throw err("RFC de empresa no configurado");
  const pac = getPacProvider(tenant);
  await pac.cancelar(cp.uuid, motivo, tenant.rfc);
  await cp.update({ estatus: "cancelada" } as never);
  return cp;
}
