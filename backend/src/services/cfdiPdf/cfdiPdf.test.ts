import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseCfdiXml } from "./parseCfdiXml";
import { numeroEnLetra } from "./numeroEnLetra";
import { buildSatQrUrl } from "./buildQrUrl";

const SAMPLE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" xmlns:cartaporte31="http://www.sat.gob.mx/CartaPorte31" xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" Version="4.0" Serie="CP" Folio="100" Fecha="2026-06-24T19:37:09" SubTotal="8000" Moneda="MXN" Total="8960" TipoDeComprobante="I" LugarExpedicion="45655" MetodoPago="PPD" FormaPago="99" CondicionesDePago="CONTADO" NoCertificado="00001000000708362375" Sello="SELLOEMISOR12345678">
  <cfdi:Emisor Rfc="TNU150126V30" Nombre="TRANSPORTES LIGEROS DE OCCIDENTE" RegimenFiscal="624"/>
  <cfdi:Receptor Rfc="BAC220329C96" Nombre="BASE ACEROS" DomicilioFiscalReceptor="45037" RegimenFiscalReceptor="601" UsoCFDI="G03"/>
  <cfdi:Conceptos>
    <cfdi:Concepto ClaveProdServ="78101802" Cantidad="1" ClaveUnidad="E54" Descripcion="FLETE LOCAL" ValorUnitario="8000" Importe="8000"/>
  </cfdi:Conceptos>
  <cfdi:Impuestos TotalImpuestosTrasladados="1280" TotalImpuestosRetenidos="320">
    <cfdi:Traslados><cfdi:Traslado Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="1280"/></cfdi:Traslados>
    <cfdi:Retenciones><cfdi:Retencion Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.040000" Importe="320"/></cfdi:Retenciones>
  </cfdi:Impuestos>
  <cfdi:Complemento>
    <tfd:TimbreFiscalDigital UUID="6A1B5F65-9CCB-4DA6-9A52-CDC5A4ADD795" FechaTimbrado="2026-06-24T19:37:10" NoCertificadoSAT="00001000000708361114" SelloCFD="SELLOEMISOR12345678" SelloSAT="SELLOSAT" RfcProvCertif="SAT970701NN3"/>
    <cartaporte31:CartaPorte Version="3.1" IdCCP="CCC55702-1070-40C1-AF02-7753568" TranspInternac="No" TotalDistRec="60">
      <cartaporte31:Ubicaciones>
        <cartaporte31:Ubicacion TipoUbicacion="Origen" IDUbicacion="OR123456" RFCRemitenteDestinatario="BAC220329C96" NombreRemitenteDestinatario="BASE ACEROS" FechaHoraSalidaLlegada="2026-05-28T08:00:00">
          <cartaporte31:Domicilio Calle="PERIFERICO SUR" NumeroExterior="7755" Estado="JALISCO" Pais="MEX" CodigoPostal="45037"/>
        </cartaporte31:Ubicacion>
        <cartaporte31:Ubicacion TipoUbicacion="Destino" IDUbicacion="DE123456" RFCRemitenteDestinatario="BAC220329C96" NombreRemitenteDestinatario="BASE ACEROS" FechaHoraSalidaLlegada="2026-05-28T22:00:00" DistanciaRecorrida="60">
          <cartaporte31:Domicilio Calle="ASUNCION" NumeroExterior="1930" Estado="JALISCO" Pais="MEX" CodigoPostal="45037"/>
        </cartaporte31:Ubicacion>
      </cartaporte31:Ubicaciones>
      <cartaporte31:Mercancias PesoBrutoTotal="17117" UnidadPeso="KGM" NumTotalMercancias="1">
        <cartaporte31:Mercancia BienesTransp="11171500" Descripcion="LOTE DE ACERO" Cantidad="1" ClaveUnidad="XTL" PesoEnKg="17117">
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
    assert.equal(c.conceptos.length, 1);
    assert.ok(c.cartaPorte);
    assert.equal(c.cartaPorte!.ubicaciones.length, 2);
    assert.equal(c.cartaPorte!.mercancias.length, 1);
    assert.equal(c.cartaPorte!.autotransporte?.permSCT, "TPAF01");
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
