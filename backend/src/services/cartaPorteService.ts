import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { uploadRootDir } from "../middlewares/uploadDocument";
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
import { loadSatMaterialPeligrosoByClaves, validateMercanciasCatalog } from "./satCatalogService";
import type { TimbradoContext, TimbradoOpts } from "./pac/types";
import {
  ensureUbicacionesFromClient,
  normalizeFiscalUbicaciones,
  resolveIdUbicacionSat,
} from "./tripFiscalService";
import { enrichUbicacionesDomicilio } from "./postalia/enrichUbicacionesDomicilio";
import { num } from "../utils/numbers";
import { renderCfdiPdfFromXml } from "./cfdiPdf";

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
  return resolveIdUbicacionSat(u.id_ubicacion_sat, u.tipo, tripId, u.orden);
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
    u.estado ? ` Estado="${esc(u.estado)}"` : "",
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
  client?: Client | null,
): string[] {
  const issues: string[] = [];
  if (!tenant.rfc) issues.push("RFC de la empresa no configurado");
  if (!tenant.razon_social) issues.push("Razón social de la empresa no configurada");
  if (!tenant.regimen_fiscal) issues.push("Régimen fiscal no configurado");
  if (!tenant.cp_fiscal) issues.push("Código postal fiscal de la empresa no configurado");
  if (!tenant.csd_cer_path || !tenant.csd_key_path) {
    issues.push("Certificados CSD (.cer y .key) no cargados");
  }
  const sorted = normalizeFiscalUbicaciones(ubicaciones);
  if (sorted.length < 2) {
    issues.push("Se requieren al menos 2 ubicaciones (origen y destino)");
  }
  const origen = sorted[0];
  const destinoFinal = sorted[sorted.length - 1];
  if (!origen?.cp) issues.push("Ubicación origen: falta código postal");
  if (!(origen?.rfc?.trim() || client?.rfc?.trim())) {
    issues.push("Ubicación origen: falta RFC");
  }
  if (!(origen?.nombre?.trim() || client?.razon_social?.trim())) {
    issues.push("Ubicación origen: falta razón social");
  }
  if (destinoFinal && destinoFinal.orden > 1) {
    if (!destinoFinal.cp) issues.push("Ubicación destino final: falta código postal");
    if (!(destinoFinal.rfc?.trim() || client?.rfc?.trim())) {
      issues.push("Ubicación destino final: falta RFC");
    }
    if (!(destinoFinal.nombre?.trim() || client?.razon_social?.trim())) {
      issues.push("Ubicación destino final: falta razón social");
    }
    if (num(destinoFinal.distancia_km) <= 0) {
      issues.push("Ubicación destino final: falta distancia del tramo en km");
    }
    if (origen?.fecha_hora && destinoFinal.fecha_hora) {
      const salidaMs = new Date(origen.fecha_hora).getTime();
      const llegadaMs = new Date(destinoFinal.fecha_hora).getTime();
      if (!Number.isNaN(salidaMs) && !Number.isNaN(llegadaMs) && llegadaMs <= salidaMs) {
        issues.push(
          "Ubicación destino final: la fecha/hora de llegada debe ser posterior a la de salida",
        );
      }
    }
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
  const sorted = normalizeFiscalUbicaciones(ubicaciones);
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

  const regimenReceptor = tenant.regimen_fiscal || "601";
  const cpReceptor = tenant.cp_fiscal || "00000";

  return `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" xmlns:cartaporte31="http://www.sat.gob.mx/CartaPorte31" Version="4.0" Folio="${esc(folio)}" Fecha="${now}" SubTotal="0" Moneda="XXX" Total="0" TipoDeComprobante="T" Exportacion="01" LugarExpedicion="${esc(cpReceptor)}">
  <cfdi:Emisor Rfc="${esc(tenant.rfc!)}" Nombre="${esc(tenant.razon_social!)}" RegimenFiscal="${esc(tenant.regimen_fiscal!)}" />
  <cfdi:Receptor Rfc="${esc(tenant.rfc!)}" Nombre="${esc(tenant.razon_social!)}" DomicilioFiscalReceptor="${esc(cpReceptor)}" RegimenFiscalReceptor="${esc(regimenReceptor)}" UsoCFDI="S01" />
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
  satMaterialPeligrosoByClave?: TimbradoContext["satMaterialPeligrosoByClave"],
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
    satMaterialPeligrosoByClave,
  };
}

async function satMaterialPeligrosoForMercancias(
  mercancias: TripMercancia[],
): Promise<TimbradoContext["satMaterialPeligrosoByClave"]> {
  const claves = mercancias
    .map((m) => m.clave_prod_serv?.trim())
    .filter((c): c is string => !!c);
  return loadSatMaterialPeligrosoByClaves(claves);
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
  let ubicaciones = normalizeFiscalUbicaciones(
    (trip as Trip & { ubicaciones?: TripUbicacion[] }).ubicaciones ?? [],
  );
  const mercancias = (trip as Trip & { mercancias?: TripMercancia[] }).mercancias ?? [];
  const isSicofi = (tenant.pac_proveedor || "").toLowerCase() === "sicofi";

  const enriched = await enrichUbicacionesDomicilio(tenantId, tripId, ubicaciones);
  ubicaciones = enriched.ubicaciones;
  let issues = [...enriched.issues];

  issues = [...issues, ...validateCartaPorteData(trip, tenant, ubicaciones, mercancias, truck, driver, client)];
  const catalogIssues = await validateMercanciasCatalog(mercancias);
  issues = [...issues, ...catalogIssues];
  if (isSicofi) {
    issues = issues.filter((i) => !i.includes("Certificados CSD"));
  }
  const cp = cartaPorte;
  const folio = cp.folio_cfdi || trip.folio.replace(/[^0-9]/g, "").slice(-8) || "1";
  let payload_preview: Record<string, unknown> | undefined;
  if (truck && driver && client) {
    const satMaterialPeligrosoByClave = await satMaterialPeligrosoForMercancias(mercancias);
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
      satMaterialPeligrosoByClave,
    );
    if (isSicofi) {
      const sicofiIssues = await validateSicofiFactura40(ctx);
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
  const ubicaciones = normalizeFiscalUbicaciones(
    (trip as Trip & { ubicaciones?: TripUbicacion[] }).ubicaciones ?? [],
  );
  const mercancias = (trip as Trip & { mercancias?: TripMercancia[] }).mercancias ?? [];
  const cp = await getOrCreateCartaPorte(tenantId, tripId);
  if (cp.estatus === "timbrada") {
    throw err("La carta porte ya está timbrada");
  }
  const pac = getPacProvider(tenant);
  const satMaterialPeligrosoByClave = await satMaterialPeligrosoForMercancias(mercancias);
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
    satMaterialPeligrosoByClave,
  );
  try {
    const result = await pac.timbrar(ctx);
    const dir = path.join(uploadRootDir(), tenantId, "cartas-porte");
    await mkdir(dir, { recursive: true });
    const xmlPath = path.join(dir, `${tripId}.xml`);
    await writeFile(xmlPath, result.xmlTimbrado, "utf8");
    const pdfRelPath = cartaPortePdfRelPath(tenantId, tripId);
    const pdfPath = uploadAbsFromRel(pdfRelPath);
    let pdfStored: string | null = null;
    try {
      const pdfBuffer = await renderCfdiPdfFromXml(result.xmlTimbrado, tenant);
      await writeFile(pdfPath, pdfBuffer);
      pdfStored = pdfRelPath;
    } catch (pdfErr) {
      console.warn(
        "[cartaPorte] Timbrado OK pero falló generación de PDF:",
        pdfErr instanceof Error ? pdfErr.message : pdfErr,
      );
    }
    const serie = result.serie || tenant.cfdi_serie || "CP";
    const folioCfdi = result.folio || cp.folio_cfdi;
    await cp.update({
      estatus: "timbrada",
      uuid: result.uuid,
      xml_timbrado: result.xmlTimbrado,
      pdf_path: pdfStored,
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
    if (tipo === "ingreso") {
      try {
        const { upsertFromTrip } = await import("./accountDocumentService");
        await trip.reload();
        await upsertFromTrip(trip);
      } catch (syncErr) {
        // Timbrado ya persistió; no marcar CartaPorte como error por fallo de CXC
        console.warn(
          "[cartaPorte] Timbrado OK pero falló sync de documento CXC:",
          syncErr instanceof Error ? syncErr.message : syncErr,
        );
      }
    }
    return cp;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al timbrar";
    await cp.update({ estatus: "error", error_mensaje: msg } as never);
    throw err(msg, 502);
  }
}

function safeFilenamePart(s: string): string {
  return s.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 80);
}

/** Ruta relativa al upload root, siempre con `/` (portable entre OS). */
function cartaPortePdfRelPath(tenantId: string, tripId: string): string {
  return `${tenantId}/cartas-porte/${tripId}.pdf`;
}

function normalizeUploadRelPath(rel: string): string {
  return rel.replace(/\\/g, "/");
}

function uploadAbsFromRel(rel: string): string {
  const normalized = normalizeUploadRelPath(rel);
  return path.join(uploadRootDir(), ...normalized.split("/"));
}

function cartaPorteXmlFilename(cp: CartaPorte, trip: Trip): string {
  if (cp.serie && cp.folio_cfdi) {
    return `${safeFilenamePart(cp.serie)}-${safeFilenamePart(String(cp.folio_cfdi))}.xml`;
  }
  if (trip.folio?.trim()) {
    return `${safeFilenamePart(trip.folio)}-carta-porte.xml`;
  }
  if (cp.uuid) {
    return `${safeFilenamePart(cp.uuid)}.xml`;
  }
  return `carta-porte-${trip.id}.xml`;
}

function cartaPortePdfFilename(cp: CartaPorte, trip: Trip): string {
  if (cp.serie && cp.folio_cfdi) {
    return `${safeFilenamePart(cp.serie)}-${safeFilenamePart(String(cp.folio_cfdi))}.pdf`;
  }
  if (trip.folio?.trim()) {
    return `${safeFilenamePart(trip.folio)}-carta-porte.pdf`;
  }
  if (cp.uuid) {
    return `${safeFilenamePart(cp.uuid)}.pdf`;
  }
  return `carta-porte-${trip.id}.pdf`;
}

export async function getCartaPortePdf(
  tenantId: string,
  tripId: string,
): Promise<{ pdf: Buffer; filename: string }> {
  await getTripOrThrow(tenantId, tripId, false);
  const cp = await CartaPorte.findOne({ where: { tenant_id: tenantId, trip_id: tripId } });
  if (!cp) throw err("Carta porte no encontrada", 404);
  if (cp.estatus !== "timbrada" && cp.estatus !== "cancelada") {
    throw err("El PDF solo está disponible para cartas timbradas o canceladas", 404);
  }
  const trip = await Trip.findOne({ where: { id: tripId, tenant_id: tenantId } });
  if (!trip) throw err("Viaje no encontrado", 404);

  const defaultRel = cartaPortePdfRelPath(tenantId, tripId);
  const relPath = normalizeUploadRelPath(cp.pdf_path || defaultRel);
  const absPath = uploadAbsFromRel(relPath);

  const { xml } = await getCartaPorteXml(tenantId, tripId);
  const tenant = await Tenant.findByPk(tenantId);
  const pdfBuffer = await renderCfdiPdfFromXml(xml, tenant);
  const dir = path.dirname(absPath);
  await mkdir(dir, { recursive: true });
  await writeFile(absPath, pdfBuffer);
  if (!cp.pdf_path || cp.pdf_path !== relPath) {
    await cp.update({ pdf_path: relPath } as never);
  }
  return { pdf: pdfBuffer, filename: cartaPortePdfFilename(cp, trip) };
}

export async function getCartaPorteXml(
  tenantId: string,
  tripId: string,
): Promise<{ xml: string; filename: string }> {
  await getTripOrThrow(tenantId, tripId, false);
  const cp = await CartaPorte.findOne({ where: { tenant_id: tenantId, trip_id: tripId } });
  if (!cp) throw err("Carta porte no encontrada", 404);
  if (cp.estatus !== "timbrada" && cp.estatus !== "cancelada") {
    throw err("El XML solo está disponible para cartas timbradas o canceladas", 404);
  }
  const trip = await Trip.findOne({ where: { id: tripId, tenant_id: tenantId } });
  if (!trip) throw err("Viaje no encontrado", 404);

  const xmlPath = path.join(uploadRootDir(), tenantId, "cartas-porte", `${tripId}.xml`);
  let xml: string | null = null;
  if (existsSync(xmlPath)) {
    xml = await readFile(xmlPath, "utf8");
  } else if (cp.xml_timbrado?.trim()) {
    xml = cp.xml_timbrado;
  }
  if (!xml?.trim()) throw err("XML timbrado no encontrado", 404);

  return { xml, filename: cartaPorteXmlFilename(cp, trip) };
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
