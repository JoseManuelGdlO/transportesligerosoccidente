import { TripUbicacion } from "../../models";
import { getColonia } from "../satUbicacionCatalogService";
import { listUbicaciones, normalizeFiscalUbicaciones } from "../tripFiscalService";
import {
  isValidEstadoSatCode,
  needsDomicilioEnrichment,
  resolveDomicilioSat,
  satDomicilioReplacePatch,
} from "./domicilioSatResolver";
import { isPostaliaConfigured, PostaliaClient } from "./postaliaClient";
import type { ResolvedDomicilioSat, UbicacionDomicilioInput } from "./types";

function ubicacionLabel(orden: number): string {
  return orden === 1 ? "origen" : "destino final";
}

function toDomicilioInput(u: TripUbicacion): UbicacionDomicilioInput {
  return {
    cp: u.cp ?? "",
    colonia: u.colonia,
    colonia_clave: u.colonia_clave,
    localidad: u.localidad,
    localidad_clave: u.localidad_clave,
    municipio: u.municipio,
    municipio_clave: u.municipio_clave,
    estado: u.estado,
    pais: u.pais,
  };
}

function buildUpdatePatch(
  input: UbicacionDomicilioInput,
  resolved: Awaited<ReturnType<typeof resolveDomicilioSat>>,
): Record<string, string> {
  const patch: Record<string, string> = {};

  if (!input.colonia_clave?.trim() && resolved.colonia_clave) {
    patch.colonia_clave = resolved.colonia_clave;
    if (resolved.colonia) patch.colonia = resolved.colonia;
  }
  if (!input.localidad_clave?.trim() && resolved.localidad_clave) {
    patch.localidad_clave = resolved.localidad_clave;
    if (resolved.localidad) patch.localidad = resolved.localidad;
  }
  if (!input.municipio_clave?.trim() && resolved.municipio_clave) {
    patch.municipio_clave = resolved.municipio_clave;
    if (resolved.municipio) patch.municipio = resolved.municipio;
  }
  if (!input.estado?.trim() && resolved.estado) {
    patch.estado = resolved.estado;
  } else if (!isValidEstadoSatCode(input.estado) && resolved.estado) {
    patch.estado = resolved.estado;
  }
  if (!input.pais?.trim() && resolved.pais) {
    patch.pais = resolved.pais;
  }

  return patch;
}

async function coloniaAjenaAlCp(input: UbicacionDomicilioInput): Promise<boolean> {
  const cp = input.cp.trim();
  const clave = input.colonia_clave?.trim() ?? "";
  if (!/^\d{5}$/.test(cp) || !clave) return false;
  return !(await getColonia(cp, clave));
}

export async function enrichUbicacionesDomicilio(
  tenantId: string,
  tripId: string,
  ubicaciones: TripUbicacion[],
): Promise<{ ubicaciones: TripUbicacion[]; issues: string[] }> {
  const fiscal = normalizeFiscalUbicaciones(ubicaciones);
  const pending: { ubicacion: TripUbicacion; replace: boolean }[] = [];

  for (const u of fiscal) {
    const input = toDomicilioInput(u);
    const replace = await coloniaAjenaAlCp(input);
    if (replace || needsDomicilioEnrichment(input)) {
      pending.push({ ubicacion: u, replace });
    }
  }

  if (pending.length === 0) {
    return { ubicaciones: fiscal, issues: [] };
  }

  if (!isPostaliaConfigured()) {
    return {
      ubicaciones: fiscal,
      issues: pending.map(
        ({ ubicacion: u, replace }) =>
          `Ubicación ${ubicacionLabel(u.orden)}: ${
            replace
              ? "el domicilio SAT no corresponde al código postal"
              : "falta domicilio SAT completo"
          } y POSTALIA_API_TOKEN no está configurado`,
      ),
    };
  }

  const client = new PostaliaClient();
  const issues: string[] = [];
  let changed = false;

  for (const { ubicacion: u, replace } of pending) {
    const label = ubicacionLabel(u.orden);
    const input = toDomicilioInput(u);
    const cp = input.cp.trim();

    let postalia;
    try {
      postalia = await client.fetchCodigoPostal(cp);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      issues.push(`Ubicación ${label}: no se pudo consultar Postalia para CP ${cp} (${msg})`);
      continue;
    }

    const resolved: ResolvedDomicilioSat = await resolveDomicilioSat(
      replace ? { cp } : input,
      postalia,
    );
    issues.push(...resolved.issues.map((i) => `Ubicación ${label}: ${i}`));

    const patch = replace ? satDomicilioReplacePatch(resolved) : buildUpdatePatch(input, resolved);
    if (Object.keys(patch).length > 0 && u.id) {
      await TripUbicacion.update(patch, {
        where: { id: u.id, tenant_id: tenantId, trip_id: tripId },
      });
      changed = true;
    }
  }

  if (!changed) {
    return { ubicaciones: fiscal, issues };
  }

  const reloaded = await listUbicaciones(tenantId, tripId);
  return {
    ubicaciones: normalizeFiscalUbicaciones(reloaded),
    issues,
  };
}
