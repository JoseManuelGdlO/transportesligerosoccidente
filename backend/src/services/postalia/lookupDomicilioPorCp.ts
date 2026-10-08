import { resolveDomicilioSat } from "./domicilioSatResolver";
import { PostaliaClient } from "./postaliaClient";
import type { ResolvedDomicilioSat } from "./types";

/** Resuelve estado, municipio, localidad y colonia SAT solo a partir del CP. */
export async function lookupDomicilioPorCp(cp: string): Promise<ResolvedDomicilioSat> {
  const cpNorm = cp.trim();
  if (!/^\d{5}$/.test(cpNorm)) {
    throw new Error(`Código postal inválido: ${cpNorm}`);
  }
  const postalia = await new PostaliaClient().fetchCodigoPostal(cpNorm);
  return resolveDomicilioSat({ cp: cpNorm }, postalia);
}
