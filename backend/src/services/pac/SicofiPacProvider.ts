import { decryptSecret } from "../../utils/fiscalCrypto";
import { buildFactura40Payload } from "./sicofi/buildFactura40Payload";
import { resolveSicofiBaseUrl, resolveSicofiFactura40Url } from "./sicofi/config";
import { getSicofiAccessToken, invalidateSicofiAccessToken } from "./sicofi/sicofiAuth";
import { isSicofiHttp401, sicofiPostFactura40 } from "./sicofi/sicofiClient";
import type { PacProvider, TimbradoContext, TimbradoResult } from "./types";
import type { SicofiFactura40Request } from "./sicofi/types";

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
    const base = resolveSicofiBaseUrl(tenant);
    const url = resolveSicofiFactura40Url(tenant);
    const usuario = tenant.pac_usuario;
    const request: SicofiFactura40Request = {
      Usuario: usuario,
      Contrasena: contrasena,
      EmisorCFDI40: null,
      ...payload,
    };

    let accessToken = await getSicofiAccessToken(base, usuario, contrasena);
    try {
      return await sicofiPostFactura40(url, request, accessToken);
    } catch (e) {
      if (!isSicofiHttp401(e)) throw e;
      invalidateSicofiAccessToken(base, usuario);
      accessToken = await getSicofiAccessToken(base, usuario, contrasena, { forceRefresh: true });
      return sicofiPostFactura40(url, request, accessToken);
    }
  }

  async cancelar(uuid: string, motivo: string, rfc: string): Promise<void> {
    void uuid;
    void motivo;
    void rfc;
    throw new Error("Cancelación Sicofi no implementada en MVP");
  }
}
