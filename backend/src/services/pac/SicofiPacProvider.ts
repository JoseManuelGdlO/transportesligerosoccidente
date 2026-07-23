import { decryptSecret } from "../../utils/fiscalCrypto";
import type { Tenant } from "../../models";
import { buildFactura40Payload } from "./sicofi/buildFactura40Payload";
import {
  resolveSicofiBaseUrl,
  resolveSicofiCancelaUrl,
  resolveSicofiFactura40Url,
} from "./sicofi/config";
import { getSicofiAccessToken, invalidateSicofiAccessToken } from "./sicofi/sicofiAuth";
import {
  isSicofiHttp401,
  sicofiPostCancelaTimbrado,
  sicofiPostFactura40,
} from "./sicofi/sicofiClient";
import type { CancelarOpts, PacProvider, TimbradoContext, TimbradoResult } from "./types";
import type { SicofiCancelaTimbradoRequest, SicofiFactura40Request } from "./sicofi/types";

/**
 * Implementación PAC contra Sicofi Factura40 (CFDI 4.0 + Carta Porte 3.1).
 * Flujo: descifrar credenciales → construir payload → JWT → POST Factura40 → parsear XML.
 */
export class SicofiPacProvider implements PacProvider {
  readonly name = "sicofi";

  /**
   * Timbra un comprobante ante Sicofi.
   *
   * 1. Descifra `pac_token_enc` del tenant.
   * 2. Construye el JSON con `buildFactura40Payload`.
   * 3. Obtiene JWT (cacheado) vía `getSicofiAccessToken`.
   * 4. POST a Factura40; si responde 401, invalida cache y reintenta una vez.
   *
   * @param ctx - Contexto completo del viaje.
   * @returns UUID, XML timbrado y metadatos.
   * @throws Si faltan credenciales, falla el descifrado, auth, HTTP o parseo de respuesta.
   */
  async timbrar(ctx: TimbradoContext): Promise<TimbradoResult> {
    const { tenant } = ctx;
    const { usuario, contrasena } = this.resolveCredentials(tenant);

    const payload = buildFactura40Payload(ctx);
    const base = resolveSicofiBaseUrl(tenant);
    const url = resolveSicofiFactura40Url(tenant);
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

  /**
   * Cancela un CFDI ante Sicofi (`CancelaTimbrado/TimbradoR`).
   *
   * @param uuid - Folio fiscal del comprobante.
   * @param motivo - Código SAT de motivo (`01`–`04`).
   * @param tenant - Tenant con credenciales PAC.
   * @param opts - `folioSustitucion` opcional; si falta, se manda `FolioSustitucion: ""`.
   */
  async cancelar(uuid: string, motivo: string, tenant: Tenant, opts?: CancelarOpts): Promise<void> {
    const { usuario, contrasena } = this.resolveCredentials(tenant);
    const base = resolveSicofiBaseUrl(tenant);
    const url = resolveSicofiCancelaUrl(tenant);
    const request: SicofiCancelaTimbradoRequest = {
      Usuario: usuario,
      Contrasena: contrasena,
      UUID: uuid,
      Version: "4.0",
      MotivoCancelacion: motivo,
      FolioSustitucion: opts?.folioSustitucion?.trim() || "",
    };

    let accessToken = await getSicofiAccessToken(base, usuario, contrasena);
    try {
      await sicofiPostCancelaTimbrado(url, request, accessToken);
    } catch (e) {
      if (!isSicofiHttp401(e)) throw e;
      invalidateSicofiAccessToken(base, usuario);
      accessToken = await getSicofiAccessToken(base, usuario, contrasena, { forceRefresh: true });
      await sicofiPostCancelaTimbrado(url, request, accessToken);
    }
  }

  private resolveCredentials(tenant: Tenant): { usuario: string; contrasena: string } {
    if (!tenant.pac_usuario || !tenant.pac_token_enc) {
      throw new Error("Credenciales Sicofi no configuradas en la empresa");
    }
    const contrasena = decryptSecret(tenant.pac_token_enc);
    if (!contrasena) throw new Error("No se pudo descifrar la contraseña Sicofi");
    return { usuario: tenant.pac_usuario, contrasena };
  }
}
