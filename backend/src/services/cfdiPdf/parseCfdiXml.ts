import { XMLParser } from "fast-xml-parser";

export interface CfdiConcepto {
  cantidad: string;
  claveUnidad: string;
  unidad?: string;
  descripcion: string;
  valorUnitario: string;
  importe: string;
  claveProdServ?: string;
  noIdentificacion?: string;
}

export interface CfdiImpuesto {
  impuesto: string;
  tipo: "traslado" | "retencion";
  tasaOCuota?: string;
  importe: string;
}

export interface CfdiDomicilio {
  calle?: string;
  numeroExterior?: string;
  numeroInterior?: string;
  colonia?: string;
  localidad?: string;
  municipio?: string;
  estado?: string;
  pais?: string;
  codigoPostal?: string;
  referencia?: string;
}

export interface CfdiUbicacion {
  tipoUbicacion: string;
  idUbicacion?: string;
  rfcRemitenteDestinatario?: string;
  nombreRemitenteDestinatario?: string;
  numRegIdTrib?: string;
  residenciaFiscal?: string;
  numEstacion?: string;
  nombreEstacion?: string;
  tipoEstacion?: string;
  navegacionTrafico?: string;
  fechaHoraSalidaLlegada?: string;
  distanciaRecorrida?: string;
  domicilio?: CfdiDomicilio;
}

export interface CfdiMercancia {
  bienesTransp?: string;
  claveSTCC?: string;
  descripcion?: string;
  cantidad?: string;
  claveUnidad?: string;
  unidad?: string;
  pesoEnKg?: string;
  materialPeligroso?: string;
  cantidadTransporta?: { cantidad: string; idOrigen: string; idDestino: string }[];
}

export interface CfdiFigura {
  tipoFigura?: string;
  rfcFigura?: string;
  numLicencia?: string;
  nombreFigura?: string;
  numRegIdTribFigura?: string;
  residenciaFiscalFigura?: string;
  partesTransporte?: string;
  domicilio?: CfdiDomicilio;
}

export interface CfdiAutotransporte {
  permSCT?: string;
  numPermisoSCT?: string;
  configVehicular?: string;
  placaVM?: string;
  anioModeloVM?: string;
  pesoBrutoVehicular?: string;
  aseguraRespCivil?: string;
  polizaRespCivil?: string;
  aseguraMedAmbiente?: string;
  polizaMedAmbiente?: string;
  aseguraCarga?: string;
  polizaCarga?: string;
  primaSeguro?: string;
}

export interface CfdiCartaPorte {
  version: string;
  idCCP?: string;
  entradaSalidaMerc?: string;
  paisOrigenDestino?: string;
  registroISTMO?: string;
  viaEntradaSalida?: string;
  ubicacionPoloOrigen?: string;
  ubicacionPoloDestino?: string;
  transpInternac?: string;
  totalDistRec?: string;
  regimenesAduaneros: string[];
  ubicaciones: CfdiUbicacion[];
  pesoBrutoTotal?: string;
  pesoNetoTotal?: string;
  unidadPeso?: string;
  numTotalMercancias?: string;
  cargoPorTasacion?: string;
  logisticaInversaRecoleccionDevolucion?: string;
  mercancias: CfdiMercancia[];
  autotransporte?: CfdiAutotransporte;
  figuras: CfdiFigura[];
}

export interface ParsedCfdi {
  version: string;
  serie?: string;
  folio?: string;
  fecha: string;
  subTotal: string;
  total: string;
  moneda: string;
  tipoDeComprobante: string;
  lugarExpedicion: string;
  metodoPago?: string;
  formaPago?: string;
  condicionesDePago?: string;
  exportacion?: string;
  noCertificado?: string;
  sello?: string;
  emisor: { rfc: string; nombre: string; regimenFiscal: string };
  receptor: {
    rfc: string;
    nombre: string;
    regimenFiscal?: string;
    domicilioFiscal?: string;
    usoCFDI?: string;
  };
  conceptos: CfdiConcepto[];
  impuestos: CfdiImpuesto[];
  timbre: {
    uuid: string;
    fechaTimbrado: string;
    noCertificadoSAT?: string;
    selloSAT?: string;
    selloCFD?: string;
    rfcProvCertif?: string;
  };
  cartaPorte?: CfdiCartaPorte;
}

function asArray<T>(v: T | T[] | undefined | null): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

function asRecordArray(v: unknown): Record<string, unknown>[] {
  return asArray(v as Record<string, unknown> | Record<string, unknown>[]);
}

function attr(node: Record<string, unknown> | undefined, name: string): string {
  if (!node) return "";
  const v = node[`@_${name}`];
  return v != null ? String(v) : "";
}

function parseDomicilio(node: Record<string, unknown> | undefined): CfdiDomicilio | undefined {
  if (!node) return undefined;
  return {
    calle: attr(node, "Calle") || undefined,
    numeroExterior: attr(node, "NumeroExterior") || undefined,
    numeroInterior: attr(node, "NumeroInterior") || undefined,
    colonia: attr(node, "Colonia") || undefined,
    localidad: attr(node, "Localidad") || undefined,
    municipio: attr(node, "Municipio") || undefined,
    estado: attr(node, "Estado") || undefined,
    pais: attr(node, "Pais") || undefined,
    codigoPostal: attr(node, "CodigoPostal") || undefined,
    referencia: attr(node, "Referencia") || undefined,
  };
}

function formatDomicilio(d: CfdiDomicilio): string {
  const parts = [
    d.calle ? `Calle: ${d.calle}` : "",
    d.numeroExterior ? `No. Ext: ${d.numeroExterior}` : "",
    d.numeroInterior ? `No. Int: ${d.numeroInterior}` : "",
    d.colonia ? `Colonia: ${d.colonia}` : "",
    d.localidad ? `Localidad: ${d.localidad}` : "",
    d.referencia ? `Referencia: ${d.referencia}` : "",
    d.municipio ? `Municipio: ${d.municipio}` : "",
    d.estado ? `Estado: ${d.estado}` : "",
    d.pais ? `Pais: ${d.pais}` : "",
    d.codigoPostal ? `Codigo Postal: ${d.codigoPostal}` : "",
  ].filter(Boolean);
  return parts.join(", ");
}

/** Formato abreviado Sicofi para domicilios en Carta Porte (Col, Loc, Mupio, Edo). */
function formatDomicilioCartaPorte(d: CfdiDomicilio): string {
  const parts = [
    d.calle ? `Calle: ${d.calle}` : "",
    d.numeroExterior !== undefined ? `No. Ext: ${d.numeroExterior || "SN"}` : "",
    d.numeroInterior !== undefined ? `No. Int: ${d.numeroInterior || ""}` : "",
    d.colonia ? `Col: ${d.colonia}` : "",
    d.localidad ? `Loc: ${d.localidad}` : "",
    d.municipio ? `Mupio: ${d.municipio}` : "",
    d.estado ? `Edo: ${d.estado}` : "",
    d.pais ? `Pais: ${d.pais}` : "",
    d.codigoPostal ? `Codigo Postal: ${d.codigoPostal}` : "",
    d.referencia !== undefined ? `Referencia: ${d.referencia || ""}` : "",
  ].filter((p) => p !== "");
  return parts.join(", ");
}

export { formatDomicilio, formatDomicilioCartaPorte };

function parseUbicacion(node: Record<string, unknown>): CfdiUbicacion {
  const domNode = node.Domicilio as Record<string, unknown> | undefined;
  return {
    tipoUbicacion: attr(node, "TipoUbicacion"),
    idUbicacion: attr(node, "IDUbicacion") || attr(node, "IdUbicacion") || undefined,
    rfcRemitenteDestinatario: attr(node, "RFCRemitenteDestinatario") || undefined,
    nombreRemitenteDestinatario: attr(node, "NombreRemitenteDestinatario") || undefined,
    numRegIdTrib: attr(node, "NumRegIdTrib") || undefined,
    residenciaFiscal: attr(node, "ResidenciaFiscal") || undefined,
    numEstacion: attr(node, "NumEstacion") || undefined,
    nombreEstacion: attr(node, "NombreEstacion") || undefined,
    tipoEstacion: attr(node, "TipoEstacion") || undefined,
    navegacionTrafico: attr(node, "NavegacionTrafico") || undefined,
    fechaHoraSalidaLlegada: attr(node, "FechaHoraSalidaLlegada") || undefined,
    distanciaRecorrida: attr(node, "DistanciaRecorrida") || undefined,
    domicilio: parseDomicilio(domNode),
  };
}

function parseMercancia(node: Record<string, unknown>): CfdiMercancia {
  const cantRaw =
    node.CantidadTransporta ||
    node.CantidadTransportada ||
    node["cartaporte31:CantidadTransporta"] ||
    node["cartaporte31:CantidadTransportada"];
  const cantNodes = asArray(cantRaw as Record<string, unknown> | Record<string, unknown>[]);
  return {
    bienesTransp: attr(node, "BienesTransp") || undefined,
    claveSTCC: attr(node, "ClaveSTCC") || undefined,
    descripcion: attr(node, "Descripcion") || undefined,
    cantidad: attr(node, "Cantidad") || undefined,
    claveUnidad: attr(node, "ClaveUnidad") || undefined,
    unidad: attr(node, "Unidad") || undefined,
    pesoEnKg: attr(node, "PesoEnKg") || undefined,
    materialPeligroso: attr(node, "MaterialPeligroso") || undefined,
    cantidadTransporta: cantNodes.map((c) => ({
      cantidad: attr(c, "Cantidad"),
      idOrigen: attr(c, "IDOrigen"),
      idDestino: attr(c, "IDDestino"),
    })),
  };
}

function parseFigura(node: Record<string, unknown>): CfdiFigura {
  const partesNode = node.PartesTransporte as Record<string, unknown> | undefined;
  const parte = asRecordArray(partesNode?.ParteTransporte)[0];
  const partesTransporte = parte
    ? [attr(parte, "ParteTransporte"), attr(parte, "Descripcion")].filter(Boolean).join(" - ")
    : undefined;

  return {
    tipoFigura: attr(node, "TipoFigura") || undefined,
    rfcFigura: attr(node, "RFCFigura") || undefined,
    numLicencia: attr(node, "NumLicencia") || undefined,
    nombreFigura: attr(node, "NombreFigura") || undefined,
    numRegIdTribFigura: attr(node, "NumRegIdTribFigura") || undefined,
    residenciaFiscalFigura: attr(node, "ResidenciaFiscalFigura") || undefined,
    partesTransporte: partesTransporte || undefined,
    domicilio: parseDomicilio(node.Domicilio as Record<string, unknown> | undefined),
  };
}

function parseCartaPorte(node: Record<string, unknown>): CfdiCartaPorte {
  const ubicacionesNode = (node.Ubicaciones as Record<string, unknown> | undefined)?.Ubicacion;
  const mercanciasNode = (node.Mercancias as Record<string, unknown> | undefined)?.Mercancia;
  const mercanciasWrapper = node.Mercancias as Record<string, unknown> | undefined;
  const autoNode =
    (mercanciasWrapper?.Autotransporte as Record<string, unknown> | undefined) ||
    (mercanciasWrapper?.AutotransporteFederal as Record<string, unknown> | undefined) ||
    (node.Autotransporte as Record<string, unknown> | undefined) ||
    (node.AutotransporteFederal as Record<string, unknown> | undefined);
  const figuraNode = (node.FiguraTransporte as Record<string, unknown> | undefined)?.TiposFigura;

  let autotransporte: CfdiAutotransporte | undefined;
  if (autoNode) {
    const idVeh = autoNode.IdentificacionVehicular as Record<string, unknown> | undefined;
    const seguros = autoNode.Seguros as Record<string, unknown> | undefined;
    autotransporte = {
      permSCT: attr(autoNode, "PermSCT") || undefined,
      numPermisoSCT: attr(autoNode, "NumPermisoSCT") || undefined,
      configVehicular: idVeh ? attr(idVeh, "ConfigVehicular") || undefined : undefined,
      placaVM: idVeh ? attr(idVeh, "PlacaVM") || undefined : undefined,
      anioModeloVM: idVeh ? attr(idVeh, "AnioModeloVM") || undefined : undefined,
      pesoBrutoVehicular: idVeh ? attr(idVeh, "PesoBrutoVehicular") || undefined : undefined,
      aseguraRespCivil: seguros ? attr(seguros, "AseguraRespCivil") || undefined : undefined,
      polizaRespCivil: seguros ? attr(seguros, "PolizaRespCivil") || undefined : undefined,
      aseguraMedAmbiente: seguros ? attr(seguros, "AseguraMedAmbiente") || undefined : undefined,
      polizaMedAmbiente: seguros ? attr(seguros, "PolizaMedAmbiente") || undefined : undefined,
      aseguraCarga: seguros ? attr(seguros, "AseguraCarga") || undefined : undefined,
      polizaCarga: seguros ? attr(seguros, "PolizaCarga") || undefined : undefined,
      primaSeguro: seguros ? attr(seguros, "PrimaSeguro") || undefined : undefined,
    };
  }

  const regimenesNode = node.RegimenesAduaneros as Record<string, unknown> | undefined;
  const regimenesAduaneros = asRecordArray(regimenesNode?.RegimenAduanero).map((r) => attr(r, "RegimenAduanero"));

  return {
    version: attr(node, "Version") || "3.1",
    idCCP: attr(node, "IdCCP") || undefined,
    entradaSalidaMerc: attr(node, "EntradaSalidaMerc") || undefined,
    paisOrigenDestino: attr(node, "PaisOrigenDestino") || undefined,
    registroISTMO: attr(node, "RegistroISTMO") || undefined,
    viaEntradaSalida: attr(node, "ViaEntradaSalida") || undefined,
    ubicacionPoloOrigen: attr(node, "UbicacionPoloOrigen") || undefined,
    ubicacionPoloDestino: attr(node, "UbicacionPoloDestino") || undefined,
    transpInternac: attr(node, "TranspInternac") || undefined,
    totalDistRec: attr(node, "TotalDistRec") || undefined,
    regimenesAduaneros,
    ubicaciones: asRecordArray(ubicacionesNode).map(parseUbicacion),
    pesoBrutoTotal: mercanciasWrapper ? attr(mercanciasWrapper, "PesoBrutoTotal") || undefined : undefined,
    pesoNetoTotal: mercanciasWrapper ? attr(mercanciasWrapper, "PesoNetoTotal") || undefined : undefined,
    unidadPeso: mercanciasWrapper ? attr(mercanciasWrapper, "UnidadPeso") || undefined : undefined,
    numTotalMercancias: mercanciasWrapper ? attr(mercanciasWrapper, "NumTotalMercancias") || undefined : undefined,
    cargoPorTasacion: mercanciasWrapper ? attr(mercanciasWrapper, "CargoPorTasacion") || undefined : undefined,
    logisticaInversaRecoleccionDevolucion: mercanciasWrapper
      ? attr(mercanciasWrapper, "LogisticaInversaRecoleccionDevolucion") || undefined
      : undefined,
    mercancias: asRecordArray(mercanciasNode).map(parseMercancia),
    autotransporte,
    figuras: asRecordArray(figuraNode).map(parseFigura),
  };
}

function findCartaPorte(complemento: Record<string, unknown> | undefined): CfdiCartaPorte | undefined {
  if (!complemento) return undefined;
  const cp =
    complemento.CartaPorte ||
    complemento["cartaporte31:CartaPorte"] ||
    Object.values(complemento).find(
      (v) => v && typeof v === "object" && ("@_Version" in (v as object) || "Ubicaciones" in (v as object)),
    );
  if (!cp || typeof cp !== "object") return undefined;
  return parseCartaPorte(cp as Record<string, unknown>);
}

function parseImpuestos(impNode: Record<string, unknown> | undefined): CfdiImpuesto[] {
  if (!impNode) return [];
  const out: CfdiImpuesto[] = [];
  for (const n of asRecordArray(impNode?.Traslados)) {
    for (const t of asRecordArray(n.Traslado)) {
      out.push({
        impuesto: attr(t, "Impuesto"),
        tipo: "traslado",
        tasaOCuota: attr(t, "TasaOCuota") || undefined,
        importe: attr(t, "Importe"),
      });
    }
  }
  for (const n of asRecordArray(impNode?.Retenciones)) {
    for (const r of asRecordArray(n.Retencion)) {
      out.push({
        impuesto: attr(r, "Impuesto"),
        tipo: "retencion",
        tasaOCuota: attr(r, "TasaOCuota") || undefined,
        importe: attr(r, "Importe"),
      });
    }
  }
  return out;
}

/** Parsea un XML timbrado CFDI 4.0 + Carta Porte 3.1 a estructura plana. */
export function parseCfdiXml(xml: string): ParsedCfdi {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    removeNSPrefix: true,
    isArray: (name) =>
      ["Concepto", "Ubicacion", "Mercancia", "CantidadTransporta", "CantidadTransportada", "TiposFigura", "Traslado", "Retencion", "RegimenAduanero"].includes(
        name,
      ),
  });
  const doc = parser.parse(xml) as Record<string, unknown>;
  const comprobante = (doc.Comprobante || doc["cfdi:Comprobante"]) as Record<string, unknown> | undefined;
  if (!comprobante) throw new Error("XML sin nodo Comprobante");

  const emisorNode = comprobante.Emisor as Record<string, unknown> | undefined;
  const receptorNode = comprobante.Receptor as Record<string, unknown> | undefined;
  const conceptosNode = (comprobante.Conceptos as Record<string, unknown> | undefined)?.Concepto;
  const complemento = comprobante.Complemento as Record<string, unknown> | undefined;

  const tfd =
    (complemento?.TimbreFiscalDigital as Record<string, unknown> | undefined) ||
    (() => {
      const vals = complemento ? Object.values(complemento) : [];
      return vals.find((v) => v && typeof v === "object" && "@_UUID" in (v as object)) as
        | Record<string, unknown>
        | undefined;
    })();

  if (!tfd) throw new Error("XML sin TimbreFiscalDigital");

  const impuestosGlobales = comprobante.Impuestos as Record<string, unknown> | undefined;
  const conceptos = asRecordArray(conceptosNode).map((c) => {
    const impConcepto = c.Impuestos as Record<string, unknown> | undefined;
    return {
      cantidad: attr(c, "Cantidad"),
      claveUnidad: attr(c, "ClaveUnidad"),
      unidad: attr(c, "Unidad") || undefined,
      descripcion: attr(c, "Descripcion"),
      valorUnitario: attr(c, "ValorUnitario"),
      importe: attr(c, "Importe"),
      claveProdServ: attr(c, "ClaveProdServ") || undefined,
      noIdentificacion: attr(c, "NoIdentificacion") || undefined,
      impuestos: parseImpuestos(impConcepto),
    };
  });

  const impuestos = parseImpuestos(impuestosGlobales);

  return {
    version: attr(comprobante, "Version") || "4.0",
    serie: attr(comprobante, "Serie") || undefined,
    folio: attr(comprobante, "Folio") || undefined,
    fecha: attr(comprobante, "Fecha"),
    subTotal: attr(comprobante, "SubTotal") || "0",
    total: attr(comprobante, "Total") || "0",
    moneda: attr(comprobante, "Moneda") || "MXN",
    tipoDeComprobante: attr(comprobante, "TipoDeComprobante"),
    lugarExpedicion: attr(comprobante, "LugarExpedicion"),
    metodoPago: attr(comprobante, "MetodoPago") || undefined,
    formaPago: attr(comprobante, "FormaPago") || undefined,
    condicionesDePago: attr(comprobante, "CondicionesDePago") || undefined,
    exportacion: attr(comprobante, "Exportacion") || undefined,
    noCertificado: attr(comprobante, "NoCertificado") || undefined,
    sello: attr(comprobante, "Sello") || undefined,
    emisor: {
      rfc: attr(emisorNode, "Rfc"),
      nombre: attr(emisorNode, "Nombre"),
      regimenFiscal: attr(emisorNode, "RegimenFiscal"),
    },
    receptor: {
      rfc: attr(receptorNode, "Rfc"),
      nombre: attr(receptorNode, "Nombre"),
      regimenFiscal: attr(receptorNode, "RegimenFiscal") || undefined,
      domicilioFiscal: attr(receptorNode, "DomicilioFiscalReceptor") || undefined,
      usoCFDI: attr(receptorNode, "UsoCFDI") || undefined,
    },
    conceptos: conceptos.map(({ impuestos: _i, ...c }) => c),
    impuestos,
    timbre: {
      uuid: attr(tfd, "UUID"),
      fechaTimbrado: attr(tfd, "FechaTimbrado"),
      noCertificadoSAT: attr(tfd, "NoCertificadoSAT") || undefined,
      selloSAT: attr(tfd, "SelloSAT") || undefined,
      selloCFD: attr(tfd, "SelloCFD") || attr(comprobante, "Sello") || undefined,
      rfcProvCertif: attr(tfd, "RfcProvCertif") || undefined,
    },
    cartaPorte: findCartaPorte(complemento),
  };
}
