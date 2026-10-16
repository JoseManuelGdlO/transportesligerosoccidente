import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderPagoPdf } from "./renderPagoPdf";

const SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante Version="4.0" Serie="P" Folio="1" Fecha="2026-10-16T12:44:00" SubTotal="0" Total="0" TipoDeComprobante="P" LugarExpedicion="45640" Moneda="XXX" xmlns:cfdi="http://www.sat.gob.mx/cfd/4" xmlns:pago20="http://www.sat.gob.mx/Pagos20">
  <cfdi:Emisor Rfc="TNU150126V30" Nombre="TRANSPORTES LIGEROS DE OCCIDENTE" RegimenFiscal="624"/>
  <cfdi:Receptor Rfc="AHH211109FL2" Nombre="ACEROS HH" DomicilioFiscalReceptor="45645" RegimenFiscalReceptor="601" UsoCFDI="CP01"/>
  <cfdi:Conceptos>
    <cfdi:Concepto ClaveProdServ="84111506" Cantidad="1" ClaveUnidad="ACT" Descripcion="Pago" ValorUnitario="0" Importe="0" ObjetoImp="01"/>
  </cfdi:Conceptos>
  <cfdi:Complemento>
    <pago20:Pagos Version="2.0">
      <pago20:Totales TotalRetencionesIVA="71.43" TotalTrasladosBaseIVA16="1785.71" TotalTrasladosImpuestoIVA16="285.71" MontoTotalPagos="2000.00"/>
      <pago20:Pago FechaPago="2026-10-16T12:00:00" FormaDePagoP="03" MonedaP="MXN" TipoCambioP="1" Monto="2000.00">
        <pago20:DoctoRelacionado IdDocumento="02c28acb-4bba-4fa1-ac5d-5df4420e386c" Folio="4497" MonedaDR="MXN" EquivalenciaDR="1" NumParcialidad="1" ImpSaldoAnt="4704.00" ImpPagado="2000.00" ImpSaldoInsoluto="2704.00" ObjetoImpDR="02">
          <pago20:ImpuestosDR>
            <pago20:RetencionesDR>
              <pago20:RetencionDR BaseDR="1785.71" ImpuestoDR="002" TipoFactorDR="Tasa" TasaOCuotaDR="0.040000" ImporteDR="71.43"/>
            </pago20:RetencionesDR>
            <pago20:TrasladosDR>
              <pago20:TrasladoDR BaseDR="1785.71" ImpuestoDR="002" TipoFactorDR="Tasa" TasaOCuotaDR="0.160000" ImporteDR="285.71"/>
            </pago20:TrasladosDR>
          </pago20:ImpuestosDR>
        </pago20:DoctoRelacionado>
        <pago20:ImpuestosP>
          <pago20:RetencionesP><pago20:RetencionP ImpuestoP="002" ImporteP="71.43"/></pago20:RetencionesP>
          <pago20:TrasladosP><pago20:TrasladoP BaseP="1785.71" ImpuestoP="002" TipoFactorP="Tasa" TasaOCuotaP="0.160000" ImporteP="285.71"/></pago20:TrasladosP>
        </pago20:ImpuestosP>
      </pago20:Pago>
    </pago20:Pagos>
    <tfd:TimbreFiscalDigital xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" FechaTimbrado="2026-10-16T12:44:00" UUID="0ca71ac8-61a8-4d50-8136-fc447522c588" NoCertificadoSAT="00001000000718099104" SelloSAT="SELLOSAT" SelloCFD="SELLOCFD12345678" RfcProvCertif="ICA050422AA6" Version="1.1"/>
  </cfdi:Complemento>
</cfdi:Comprobante>`;

describe("renderPagoPdf", () => {
  it("genera la representación de dos páginas a partir del XML", async () => {
    const buffer = await renderPagoPdf(SAMPLE, {
      razon_social: "TRANSPORTES LIGEROS DE OCCIDENTE",
      rfc: "TNU150126V30",
      regimen_fiscal: "624",
      cp_fiscal: "45640",
    } as never);

    assert.equal(buffer.subarray(0, 4).toString(), "%PDF");
    const pageCount = (buffer.toString("latin1").match(/\/Type\s*\/Page\b/g) || []).length;
    assert.equal(pageCount, 2);
  });
});
