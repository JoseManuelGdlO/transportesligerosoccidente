import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseCfdiXml, formatDomicilioCartaPorte } from "./parseCfdiXml";
import { numeroEnLetra } from "./numeroEnLetra";
import { buildSatQrUrl } from "./buildQrUrl";
import { renderCfdiPdfFromXml } from "./renderCfdiPdf";

const SAMPLE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" xmlns:cartaporte31="http://www.sat.gob.mx/CartaPorte31" xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" Version="4.0" Serie="CP" Folio="100" Fecha="2026-06-24T19:37:09" SubTotal="8000" Moneda="MXN" Total="8960" TipoDeComprobante="I" LugarExpedicion="45655" MetodoPago="PPD" FormaPago="99" CondicionesDePago="CONTADO" NoCertificado="00001000000708362375" Sello="SELLOEMISOR12345678">
  <cfdi:Emisor Rfc="TNU150126V30" Nombre="TRANSPORTES LIGEROS DE OCCIDENTE" RegimenFiscal="624"/>
  <cfdi:Receptor Rfc="BAC220329C96" Nombre="BASE ACEROS" DomicilioFiscalReceptor="45037" RegimenFiscalReceptor="601" UsoCFDI="G03"/>
  <cfdi:Conceptos>
    <cfdi:Concepto ClaveProdServ="78101802" NoIdentificacion="SF0214076" Cantidad="1" ClaveUnidad="E54" Unidad="Viaje" Descripcion="FLETE LOCAL" ValorUnitario="8000" Importe="8000"/>
  </cfdi:Conceptos>
  <cfdi:Impuestos TotalImpuestosTrasladados="1280" TotalImpuestosRetenidos="320">
    <cfdi:Traslados><cfdi:Traslado Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="1280"/></cfdi:Traslados>
    <cfdi:Retenciones><cfdi:Retencion Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.040000" Importe="320"/></cfdi:Retenciones>
  </cfdi:Impuestos>
  <cfdi:Complemento>
    <tfd:TimbreFiscalDigital UUID="6A1B5F65-9CCB-4DA6-9A52-CDC5A4ADD795" FechaTimbrado="2026-06-24T19:37:10" NoCertificadoSAT="00001000000708361114" SelloCFD="SELLOEMISOR12345678" SelloSAT="SELLOSAT" RfcProvCertif="SAT970701NN3"/>
    <cartaporte31:CartaPorte Version="3.1" IdCCP="CCC55702-1070-40C1-AF02-7753568" EntradaSalidaMerc="Entrada" TranspInternac="No" TotalDistRec="60">
      <cartaporte31:Ubicaciones>
        <cartaporte31:Ubicacion TipoUbicacion="Origen" IDUbicacion="OR123456" RFCRemitenteDestinatario="BAC220329C96" NombreRemitenteDestinatario="BASE ACEROS" FechaHoraSalidaLlegada="2026-05-28T08:00:00">
          <cartaporte31:Domicilio Calle="PERIFERICO SUR" NumeroExterior="7755" Estado="JALISCO" Pais="MEX" CodigoPostal="45037"/>
        </cartaporte31:Ubicacion>
        <cartaporte31:Ubicacion TipoUbicacion="Destino" IDUbicacion="DE123456" RFCRemitenteDestinatario="BAC220329C96" NombreRemitenteDestinatario="BASE ACEROS" FechaHoraSalidaLlegada="2026-05-28T22:00:00" DistanciaRecorrida="60">
          <cartaporte31:Domicilio Calle="ASUNCION" NumeroExterior="1930" Estado="JALISCO" Pais="MEX" CodigoPostal="45037"/>
        </cartaporte31:Ubicacion>
      </cartaporte31:Ubicaciones>
      <cartaporte31:Mercancias PesoBrutoTotal="17117" PesoNetoTotal="17000" UnidadPeso="KGM" NumTotalMercancias="1" CargoPorTasacion="100" LogisticaInversaRecoleccionDevolucion="Recolección - Devolución">
        <cartaporte31:Mercancia BienesTransp="11171500" ClaveSTCC="12345" Descripcion="LOTE DE ACERO" Cantidad="1" ClaveUnidad="XTL" Unidad="Lote" PesoEnKg="17117">
          <cartaporte31:CantidadTransporta Cantidad="1" IDOrigen="OR123456" IDDestino="DE123456"/>
        </cartaporte31:Mercancia>
      </cartaporte31:Mercancias>
      <cartaporte31:AutotransporteFederal PermSCT="TPAF01" NumPermisoSCT="1431TNU19022016230906006">
        <cartaporte31:IdentificacionVehicular ConfigVehicular="C3" PlacaVM="84BK8P" AnioModeloVM="1997" PesoBrutoVehicular="7000"/>
        <cartaporte31:Seguros AseguraRespCivil="HDI SEGUROS" PolizaRespCivil="12-222811-16"/>
      </cartaporte31:AutotransporteFederal>
      <cartaporte31:FiguraTransporte>
        <cartaporte31:TiposFigura TipoFigura="01" RFCFigura="VAAJ780722U22" NumLicencia="JAL123" NombreFigura="JESUS TEODORO VALDEZ ARGUELLES"/>
      </cartaporte31:FiguraTransporte>
    </cartaporte31:CartaPorte>
  </cfdi:Complemento>
</cfdi:Comprobante>`;

describe("parseCfdiXml", () => {
  it("extrae CFDI, timbre y carta porte", () => {
    const c = parseCfdiXml(SAMPLE_XML);
    assert.equal(c.serie, "CP");
    assert.equal(c.folio, "100");
    assert.equal(c.timbre.uuid, "6A1B5F65-9CCB-4DA6-9A52-CDC5A4ADD795");
    assert.equal(c.emisor.rfc, "TNU150126V30");
    assert.equal(c.receptor.regimenFiscal, "601");
    assert.equal(c.conceptos.length, 1);
    assert.ok(c.cartaPorte);
    assert.equal(c.cartaPorte!.ubicaciones.length, 2);
    assert.equal(c.cartaPorte!.mercancias.length, 1);
    assert.equal(c.cartaPorte!.autotransporte?.permSCT, "TPAF01");
    assert.equal(c.conceptos[0].noIdentificacion, "SF0214076");
    assert.equal(c.conceptos[0].unidad, "Viaje");
    assert.equal(c.cartaPorte!.entradaSalidaMerc, "Entrada");
    assert.equal(c.cartaPorte!.mercancias[0].claveSTCC, "12345");
    assert.equal(c.cartaPorte!.mercancias[0].unidad, "Lote");
    assert.equal(c.cartaPorte!.mercancias[0].cantidadTransporta?.[0].idOrigen, "OR123456");
    assert.equal(c.cartaPorte!.pesoNetoTotal, "17000");
    assert.equal(c.cartaPorte!.cargoPorTasacion, "100");
    assert.equal(c.cartaPorte!.logisticaInversaRecoleccionDevolucion, "Recolección - Devolución");
  });

  it("formatea domicilio Carta Porte con abreviaturas Sicofi", () => {
    const text = formatDomicilioCartaPorte({
      calle: "PERIFERICO SUR",
      numeroExterior: "7755",
      colonia: "1404",
      localidad: "46",
      municipio: "030",
      estado: "JAL",
      pais: "MEX",
      codigoPostal: "45900",
    });
    assert.match(text, /Col: 1404/);
    assert.match(text, /Mupio: 030/);
    assert.match(text, /Edo: JAL/);
  });

  it("omite etiquetas de domicilio Carta Porte sin valor", () => {
    const text = formatDomicilioCartaPorte({
      calle: "PERIFERICO SUR",
      numeroExterior: "7755",
      estado: "JAL",
      pais: "MEX",
      codigoPostal: "45900",
    });
    assert.doesNotMatch(text, /No\. Int:/);
    assert.doesNotMatch(text, /Referencia:/);
  });

  it("lee Autotransporte anidado dentro de Mercancias (XML timbrado SAT)", () => {
    const xml = SAMPLE_XML.replace(
      `      </cartaporte31:Mercancias>
      <cartaporte31:AutotransporteFederal PermSCT="TPAF01" NumPermisoSCT="1431TNU19022016230906006">
        <cartaporte31:IdentificacionVehicular ConfigVehicular="C3" PlacaVM="84BK8P" AnioModeloVM="1997" PesoBrutoVehicular="7000"/>
        <cartaporte31:Seguros AseguraRespCivil="HDI SEGUROS" PolizaRespCivil="12-222811-16"/>
      </cartaporte31:AutotransporteFederal>`,
      `        <cartaporte31:Autotransporte PermSCT="TPAF02" NumPermisoSCT="PERMISO-NESTED">
          <cartaporte31:IdentificacionVehicular ConfigVehicular="T3S2" PlacaVM="99ZZ99" AnioModeloVM="2020" PesoBrutoVehicular="8000"/>
          <cartaporte31:Seguros AseguraRespCivil="GNP" PolizaRespCivil="POL-99"/>
        </cartaporte31:Autotransporte>
      </cartaporte31:Mercancias>`,
    );
    const c = parseCfdiXml(xml);
    assert.equal(c.cartaPorte!.autotransporte?.permSCT, "TPAF02");
    assert.equal(c.cartaPorte!.autotransporte?.placaVM, "99ZZ99");
  });
});

describe("renderCfdiPdfFromXml", () => {
  it("genera un PDF válido a partir del XML timbrado", async () => {
    const pdf = await renderCfdiPdfFromXml(SAMPLE_XML, {
      razon_social: "TRANSPORTES LIGEROS DE OCCIDENTE",
      rfc: "TNU150126V30",
      regimen_fiscal: "624",
      cp_fiscal: "45655",
    } as never);
    assert.ok(Buffer.isBuffer(pdf));
    assert.ok(pdf.length > 1000);
    assert.equal(pdf.subarray(0, 4).toString(), "%PDF");
  });

  it("genera varias páginas de Carta Porte sin estimar total fijo", async () => {
    const ubi = Array.from({ length: 10 }, (_, i) => `
        <cartaporte31:Ubicacion TipoUbicacion="${i % 2 ? "Origen" : "Destino"}" IDUbicacion="OR${i}" RFCRemitenteDestinatario="XAXX010101000" NombreRemitenteDestinatario="CLIENTE ${i}" FechaHoraSalidaLlegada="2026-07-01T12:00:00">
          <cartaporte31:Domicilio Calle="CALLE LARGA ${i}" NumeroExterior="${i}" Colonia="COL ${i}" Estado="JAL" Pais="MEX" CodigoPostal="45640"/>
        </cartaporte31:Ubicacion>`).join("");
    const xml = SAMPLE_XML.replace(
      /<cartaporte31:Ubicaciones>[\s\S]*?<\/cartaporte31:Ubicaciones>/,
      `<cartaporte31:Ubicaciones>${ubi}</cartaporte31:Ubicaciones>`,
    );
    const pdf = await renderCfdiPdfFromXml(xml, {
      razon_social: "TRANSPORTES LIGEROS DE OCCIDENTE",
      rfc: "TNU150126V30",
      regimen_fiscal: "624",
      cp_fiscal: "45655",
    } as never);
    const pageCount = (pdf.toString("latin1").match(/\/Type\s*\/Page\b/g) || []).length;
    assert.ok(pageCount >= 3, `se esperaban >=3 páginas, se obtuvo ${pageCount}`);
  });
});

describe("parseCfdiXml pagos", () => {
  it("lee el complemento de pagos 2.0 y no lo confunde con carta porte", () => {
    const xml = `<?xml version="1.0"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" xmlns:pago20="http://www.sat.gob.mx/Pagos20" Version="4.0" Serie="P" Folio="1" Fecha="2026-10-16T12:44:00" SubTotal="0" Total="0" Moneda="XXX" TipoDeComprobante="P" LugarExpedicion="45640">
  <cfdi:Emisor Rfc="TNU150126V30" Nombre="TRANSPORTES LIGEROS DE OCCIDENTE" RegimenFiscal="624"/>
  <cfdi:Receptor Rfc="AHH211109FL2" Nombre="ACEROS HH" DomicilioFiscalReceptor="45645" RegimenFiscalReceptor="601" UsoCFDI="CP01"/>
  <cfdi:Conceptos><cfdi:Concepto ClaveProdServ="84111506" Cantidad="1" ClaveUnidad="ACT" Descripcion="Pago" ValorUnitario="0" Importe="0"/></cfdi:Conceptos>
  <cfdi:Complemento>
    <pago20:Pagos Version="2.0">
      <pago20:Totales TotalRetencionesIVA="71.43" MontoTotalPagos="2000.00"/>
      <pago20:Pago FechaPago="2026-10-16T12:00:00" FormaDePagoP="03" MonedaP="MXN" TipoCambioP="1" Monto="2000.00">
        <pago20:DoctoRelacionado IdDocumento="02c28acb-4bba-4fa1-ac5d-5df4420e386c" Folio="4497" MonedaDR="MXN" EquivalenciaDR="1" NumParcialidad="1" ImpSaldoAnt="4704.00" ImpPagado="2000.00" ImpSaldoInsoluto="2704.00" ObjetoImpDR="02">
          <pago20:ImpuestosDR>
            <pago20:TrasladosDR><pago20:TrasladoDR BaseDR="1785.71" ImpuestoDR="002" TipoFactorDR="Tasa" TasaOCuotaDR="0.160000" ImporteDR="285.71"/></pago20:TrasladosDR>
            <pago20:RetencionesDR><pago20:RetencionDR BaseDR="1785.71" ImpuestoDR="002" TipoFactorDR="Tasa" TasaOCuotaDR="0.040000" ImporteDR="71.43"/></pago20:RetencionesDR>
          </pago20:ImpuestosDR>
        </pago20:DoctoRelacionado>
        <pago20:ImpuestosP>
          <pago20:TrasladosP><pago20:TrasladoP BaseP="1785.71" ImpuestoP="002" TipoFactorP="Tasa" TasaOCuotaP="0.160000" ImporteP="285.71"/></pago20:TrasladosP>
          <pago20:RetencionesP><pago20:RetencionP ImpuestoP="002" ImporteP="71.43"/></pago20:RetencionesP>
        </pago20:ImpuestosP>
      </pago20:Pago>
    </pago20:Pagos>
    <tfd:TimbreFiscalDigital xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" UUID="0ca71ac8-61a8-4d50-8136-fc447522c588" FechaTimbrado="2026-10-16T12:44:00"/>
  </cfdi:Complemento>
</cfdi:Comprobante>`;
    const cfdi = parseCfdiXml(xml);
    assert.equal(cfdi.cartaPorte, undefined);
    assert.equal(cfdi.pagos?.version, "2.0");
    assert.equal(cfdi.pagos?.totales.montoTotalPagos, "2000.00");
    assert.equal(cfdi.pagos?.totales.totalRetencionesIVA, "71.43");
    assert.equal(cfdi.pagos?.pagos.length, 1);
    const pago = cfdi.pagos?.pagos[0];
    assert.equal(pago?.formaDePagoP, "03");
    assert.equal(pago?.documentos[0]?.folio, "4497");
    assert.equal(pago?.documentos[0]?.serie, undefined);
    assert.equal(pago?.documentos[0]?.traslados[0]?.importe, "285.71");
    assert.equal(pago?.documentos[0]?.retenciones[0]?.tasaOCuota, "0.040000");
    assert.equal(pago?.trasladosP[0]?.base, "1785.71");
    assert.equal(pago?.retencionesP[0]?.importe, "71.43");
    assert.equal(pago?.numOperacion, undefined);
  });
});

describe("numeroEnLetra", () => {
  it("convierte montos típicos", () => {
    assert.match(numeroEnLetra(8960), /OCHO MIL/);
    assert.match(numeroEnLetra(8000), /OCHO MIL/);
    assert.match(numeroEnLetra(0), /00\/100/);
  });
});

describe("buildSatQrUrl", () => {
  it("incluye parámetros SAT", () => {
    const url = buildSatQrUrl({
      uuid: "ABC",
      rfcEmisor: "AAA",
      rfcReceptor: "BBB",
      total: "100.00",
      selloCfd: "12345678ABCDEFGH",
    });
    assert.match(url, /id=ABC/);
    assert.match(url, /fe=ABCDEFGH/);
  });
});
