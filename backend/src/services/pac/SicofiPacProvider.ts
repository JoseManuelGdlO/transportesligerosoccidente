import { decryptSecret } from "../../utils/fiscalCrypto";
import { buildFactura40Payload } from "./sicofi/buildFactura40Payload";
import { resolveSicofiFactura40Url } from "./sicofi/config";
import { sicofiPostFactura40 } from "./sicofi/sicofiClient";
import type { PacProvider, TimbradoContext, TimbradoResult } from "./types";

export class SicofiPacProvider implements PacProvider {
  readonly name = "sicofi";

  async timbrar(ctx: TimbradoContext): Promise<TimbradoResult> {
    const { tenant } = ctx;
    if (!tenant.pac_usuario || !tenant.pac_token_enc) {
      throw new Error("Credenciales Sicofi no configuradas en la empresa");
    }
    const contrasena = decryptSecret(tenant.pac_token_enc);
    if (!contrasena) throw new Error("No se pudo descifrar la contraseña Sicofi");

    const payload = buildFactura40Payload(ctx);
    const url = resolveSicofiFactura40Url(tenant);
    return sicofiPostFactura40(url, {
      Usuario: tenant.pac_usuario,
      Contrasena: contrasena,
      EmisorCFDI40: null,
      ...payload,
    });
  }

  async cancelar(uuid: string, motivo: string, rfc: string): Promise<void> {
    void uuid;
    void motivo;
    void rfc;
    throw new Error("Cancelación Sicofi no implementada en MVP");
  }
}
