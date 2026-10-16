import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseInvoiceTaxSnapshot } from "./invoiceTaxSnapshot";

const XML = `<?xml version="1.0"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" Version="4.0" Serie="I" Folio="15" Fecha="2026-05-01T10:00:00" SubTotal="10000" Total="11200" Moneda="MXN" TipoDeComprobante="I" MetodoPago="PPD" FormaPago="99" LugarExpedicion="44100">
  <cfdi:Receptor Rfc="EKU9003173C9" Nombre="ESCUELA" UsoCFDI="G03" DomicilioFiscalReceptor="55060" RegimenFiscalReceptor="601"/>
  <cfdi:Conceptos>
    <cfdi:Concepto ClaveProdServ="78101802" Cantidad="1" ClaveUnidad="E48" Descripcion="Flete" ValorUnitario="10000" Importe="10000" ObjetoImp="02">
      <cfdi:Impuestos>
        <cfdi:Traslados>
          <cfdi:Traslado Base="10000" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="1600"/>
        </cfdi:Traslados>
        <cfdi:Retenciones>
          <cfdi:Retencion Base="10000" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.040000" Importe="400"/>
        </cfdi:Retenciones>
      </cfdi:Impuestos>
    </cfdi:Concepto>
  </cfdi:Conceptos>
  <cfdi:Complemento>
    <tfd:TimbreFiscalDigital xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" UUID="D9BE138A-9449-11EE-9430-00155D012007" FechaTimbrado="2026-05-01T10:05:00"/>
  </cfdi:Complemento>
</cfdi:Comprobante>`;

describe("parseInvoiceTaxSnapshot", () => {
  it("lee total, PPD y base de IVA y retención del concepto", () => {
    const snap = parseInvoiceTaxSnapshot(XML);
    assert.equal(snap.uuid, "D9BE138A-9449-11EE-9430-00155D012007");
    assert.equal(snap.serie, "I");
    assert.equal(snap.folio, "15");
    assert.equal(snap.fecha, "2026-05-01");
    assert.equal(snap.total, 11200);
    assert.equal(snap.moneda, "MXN");
    assert.equal(snap.metodoPago, "PPD");
    assert.equal(snap.taxes.length, 2);
    const iva = snap.taxes.find((t) => t.tipo === "traslado");
    const ret = snap.taxes.find((t) => t.tipo === "retencion");
    assert.equal(iva?.base, 10000);
    assert.equal(iva?.importe, 1600);
    assert.equal(iva?.tasaOCuota, 0.16);
    assert.equal(ret?.importe, 400);
    assert.equal(ret?.tasaOCuota, 0.04);
  });
});
