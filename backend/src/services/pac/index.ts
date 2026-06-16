/**
 * Módulo PAC: abstracción de Proveedor Autorizado de Certificación para timbrado CFDI.
 * @module pac
 */
import type { Tenant } from "../../models";
import type { PacProvider } from "./types";
import { StubPacProvider } from "./StubPacProvider";
import { SicofiPacProvider } from "./SicofiPacProvider";

export type { PacProvider, TimbradoResult, TimbradoContext, TimbradoOpts } from "./types";

/**
 * Resuelve la implementación PAC según el tenant o variable de entorno.
 * Prioridad: `tenant.pac_proveedor` → `PAC_PROVIDER` → `stub`.
 *
 * @param tenant - Empresa con configuración fiscal (`pac_proveedor`, credenciales Sicofi).
 * @returns Instancia de `StubPacProvider` o `SicofiPacProvider`.
 */
export function getPacProvider(tenant?: Tenant | null): PacProvider {
  const p = (tenant?.pac_proveedor || process.env.PAC_PROVIDER || "stub").toLowerCase();
  switch (p) {
    case "sicofi":
      return new SicofiPacProvider();
    case "stub":
    default:
      return new StubPacProvider();
  }
}
