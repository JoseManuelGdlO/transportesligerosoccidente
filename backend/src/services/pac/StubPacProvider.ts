import { randomUUID } from "node:crypto";
import type { Tenant } from "../../models";
import type { CancelarOpts, PacProvider, TimbradoContext, TimbradoResult } from "./types";

/**
 * PAC de prueba: simula timbrado sin llamar a proveedor externo.
 * Útil para desarrollo local cuando `PAC_PROVIDER=stub` o el tenant no tiene Sicofi.
 */
export class StubPacProvider implements PacProvider {
  readonly name = "stub";

  /**
   * Genera un XML mínimo con UUID aleatorio y metadatos de serie/folio.
   * No valida datos fiscales; asume que el preview ya pasó en `cartaPorteService`.
   *
   * @param ctx - Contexto del viaje y tipo de comprobante.
   * @returns Resultado simulado compatible con `TimbradoResult`.
   */
  async timbrar(ctx: TimbradoContext): Promise<TimbradoResult> {
    const serie = ctx.tenant.cfdi_serie || "CP";
    const folio =
      ctx.cartaPorte.folio_cfdi ||
      ctx.trip.folio.replace(/[^0-9]/g, "").slice(-8) ||
      "1";
    const uuid = randomUUID().toUpperCase();
    const fecha = new Date().toISOString();
    const tipo = ctx.tipo === "traslado" ? "T" : "I";
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" Version="4.0" Serie="${serie}" Folio="${folio}" Fecha="${fecha}" SubTotal="0" Moneda="XXX" Total="0" TipoDeComprobante="${tipo}">
<tfd:TimbreFiscalDigital UUID="${uuid}" FechaTimbrado="${fecha}" />
</cfdi:Comprobante>`;
    return {
      uuid,
      xmlTimbrado: xml,
      fechaTimbrado: fecha,
      serie,
      folio,
      pacResponse: JSON.stringify({ mode: "stub", ok: true, tipo: ctx.tipo }),
    };
  }

  /**
   * No-op en stub: la cancelación no contacta ningún servicio externo.
   */
  async cancelar(uuid: string, motivo: string, tenant: Tenant, opts?: CancelarOpts): Promise<void> {
    void uuid;
    void motivo;
    void tenant;
    void opts;
  }
}
