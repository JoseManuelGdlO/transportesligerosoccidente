import { randomUUID } from "node:crypto";
import type { PacProvider, TimbradoResult } from "./types";

/** PAC de prueba: simula timbrado sin llamar a proveedor externo. */
export class StubPacProvider implements PacProvider {
  readonly name = "stub";

  async timbrarCartaPorte(xml: string): Promise<TimbradoResult> {
    const uuid = randomUUID().toUpperCase();
    const fecha = new Date().toISOString();
    const xmlTimbrado = xml.replace(
      "</cfdi:Comprobante>",
      `<tfd:TimbreFiscalDigital UUID="${uuid}" FechaTimbrado="${fecha}" /></cfdi:Comprobante>`,
    );
    return {
      uuid,
      xmlTimbrado,
      fechaTimbrado: fecha,
      pacResponse: JSON.stringify({ mode: "stub", ok: true }),
    };
  }

  async cancelar(uuid: string, motivo: string, rfc: string): Promise<void> {
    void uuid;
    void motivo;
    void rfc;
  }
}
