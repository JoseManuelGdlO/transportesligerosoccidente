import {
  findMunicipioByDescripcion,
  getColonia,
  getLocalidad,
  getMunicipio,
  listColoniasByCp,
  searchColonias,
  searchLocalidades,
  searchMunicipios,
} from "../satUbicacionCatalogService";
import { MEXICAN_STATE_NAME_TO_CODE } from "./mexicanStateNames";
import type {
  PostaliaCodigoPostalResponse,
  ResolvedDomicilioSat,
  UbicacionDomicilioInput,
} from "./types";

export function normalizeDesc(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

export function pickByDescription<T extends { descripcion: string }>(
  items: T[],
  hint: string,
): T | null {
  if (!items.length) return null;
  const norm = normalizeDesc(hint);
  return (
    items.find((item) => normalizeDesc(item.descripcion) === norm) ??
    items.find((item) => normalizeDesc(item.descripcion).includes(norm)) ??
    items[0]
  );
}

export function pickColoniaByNombre<T extends { nombre: string }>(
  items: T[],
  hint: string,
): T | null {
  if (!items.length) return null;
  const norm = normalizeDesc(hint);
  return (
    items.find((item) => normalizeDesc(item.nombre) === norm) ??
    items.find((item) => normalizeDesc(item.nombre).includes(norm)) ??
    null
  );
}

/** Asigna colonia solo si el catálogo del CP tiene una clave. Varias opciones las elige el usuario. */
export function pickAutoColonia<T extends { clave: string }>(items: T[]): T | null {
  const unique = new Map<string, T>();
  for (const item of items) {
    const clave = item.clave.trim();
    if (!clave || unique.has(clave)) continue;
    unique.set(clave, item);
  }
  if (unique.size !== 1) return null;
  return [...unique.values()][0] ?? null;
}

export function isValidEstadoSatCode(estado: string | null | undefined): boolean {
  const code = estado?.trim().toUpperCase() ?? "";
  return /^[A-Z]{2,3}$/.test(code);
}

export function needsDomicilioEnrichment(input: UbicacionDomicilioInput): boolean {
  const cp = input.cp?.trim() ?? "";
  if (!/^\d{5}$/.test(cp)) return false;

  return (
    !input.colonia_clave?.trim() ||
    !input.municipio_clave?.trim() ||
    !isValidEstadoSatCode(input.estado)
  );
}

function resolveEstadoCodeFromName(name: string): string | null {
  const norm = normalizeDesc(name);
  if (!norm) return null;
  if (MEXICAN_STATE_NAME_TO_CODE[norm]) return MEXICAN_STATE_NAME_TO_CODE[norm];
  const partial = Object.entries(MEXICAN_STATE_NAME_TO_CODE).find(
    ([key]) => norm.includes(key) || key.includes(norm),
  );
  return partial?.[1] ?? null;
}

async function resolveEstado(
  input: UbicacionDomicilioInput,
  postalia: PostaliaCodigoPostalResponse,
  issues: string[],
): Promise<string | null> {
  if (isValidEstadoSatCode(input.estado)) {
    return input.estado!.trim().toUpperCase();
  }

  const estadoHint = input.estado?.trim() || postalia.estado;
  const fromName = resolveEstadoCodeFromName(estadoHint);
  if (fromName) return fromName;

  const municipioHint = input.municipio?.trim() || postalia.municipio;
  if (municipioHint) {
    const municipio = await findMunicipioByDescripcion(municipioHint);
    if (municipio) return municipio.estado;
  }

  issues.push(`No se pudo resolver el estado SAT para "${estadoHint}"`);
  return null;
}

async function resolveMunicipio(
  input: UbicacionDomicilioInput,
  postalia: PostaliaCodigoPostalResponse,
  estado: string,
  issues: string[],
): Promise<{ clave: string; descripcion: string } | null> {
  if (input.municipio_clave?.trim()) {
    const row = await getMunicipio(estado, input.municipio_clave);
    if (row) return { clave: row.clave, descripcion: row.descripcion };
  }

  const municipioHint = input.municipio?.trim() || postalia.municipio;
  if (!municipioHint) {
    issues.push("No se pudo resolver el municipio SAT (sin dato de municipio)");
    return null;
  }

  if (/^\d+$/.test(municipioHint)) {
    const row = await getMunicipio(estado, municipioHint);
    if (row) return { clave: row.clave, descripcion: row.descripcion };
  }

  const results = await searchMunicipios(municipioHint, estado, 20);
  const picked = pickByDescription(results, municipioHint);
  if (picked) return { clave: picked.clave, descripcion: picked.descripcion };

  const cross = await findMunicipioByDescripcion(municipioHint, estado);
  if (cross) return { clave: cross.clave, descripcion: cross.descripcion };

  issues.push(`No se pudo resolver el municipio SAT para "${municipioHint}" en ${estado}`);
  return null;
}

/**
 * Pistas para c_Localidad. No se usa municipio ni ciudad de Postalia:
 * el SAT cruza localidad contra c_CodigoPostal, y el municipio suele ser
 * otra clave (p. ej. Jocotepec 44 con CP 45820 de San Juan Cosalá).
 */
export function localidadSearchHints(
  input: Pick<UbicacionDomicilioInput, "localidad">,
  _postalia?: Pick<PostaliaCodigoPostalResponse, "ciudad" | "municipio">,
): string[] {
  const hint = input.localidad?.trim() ?? "";
  return hint ? [hint] : [];
}

async function matchLocalidadHint(
  estado: string,
  localidadHint: string,
): Promise<{ clave: string; descripcion: string } | null> {
  if (/^\d+$/.test(localidadHint)) {
    const row = await getLocalidad(estado, localidadHint);
    return row ? { clave: row.clave, descripcion: row.descripcion } : null;
  }

  const results = await searchLocalidades(localidadHint, estado, 20);
  const picked = pickByDescription(results, localidadHint);
  if (!picked) return null;
  const normHint = normalizeDesc(localidadHint);
  const normDesc = normalizeDesc(picked.descripcion);
  if (normDesc !== normHint && !normDesc.includes(normHint)) return null;
  return { clave: picked.clave, descripcion: picked.descripcion };
}

/**
 * c_Localidad no aplica a todos los CP. Sin pista explícita del usuario
 * el atributo se omite: en Carta Porte es condicional y c_CodigoPostal
 * a menudo lo trae vacío.
 */
async function resolveLocalidad(
  input: UbicacionDomicilioInput,
  postalia: PostaliaCodigoPostalResponse,
  estado: string,
): Promise<{ clave: string; descripcion: string } | null> {
  if (input.localidad_clave?.trim()) {
    const row = await getLocalidad(estado, input.localidad_clave);
    if (row) return { clave: row.clave, descripcion: row.descripcion };
  }

  for (const hint of localidadSearchHints(input, postalia)) {
    const match = await matchLocalidadHint(estado, hint);
    if (match) return match;
  }

  return null;
}

async function resolveColonia(
  input: UbicacionDomicilioInput,
  postalia: PostaliaCodigoPostalResponse,
  cp: string,
  issues: string[],
): Promise<{ clave: string; nombre: string } | null> {
  if (input.colonia_clave?.trim()) {
    const row = await getColonia(cp, input.colonia_clave);
    if (row) return { clave: row.clave, nombre: row.nombre };
  }

  if (input.colonia?.trim()) {
    const results = await searchColonias(input.colonia, cp, 20);
    const picked = pickColoniaByNombre(results, input.colonia);
    if (picked) return { clave: picked.clave, nombre: picked.nombre };
  }

  const satColonias = await listColoniasByCp(cp, 200);
  const only = pickAutoColonia(satColonias);
  if (only) return only;
  if (satColonias.length > 1) {
    issues.push(`CP ${cp}: hay varias colonias en el catálogo SAT; elige una`);
    return null;
  }

  const matches: { clave: string; nombre: string }[] = [];
  for (const colonia of postalia.colonias ?? []) {
    const nombre = colonia.nombre?.trim();
    if (!nombre) continue;
    const results = await searchColonias(nombre, cp, 20);
    const picked = pickColoniaByNombre(results, nombre);
    if (picked) matches.push({ clave: picked.clave, nombre: picked.nombre });
  }
  const fromNames = pickAutoColonia(matches);
  if (fromNames) return fromNames;
  if (matches.length > 1) {
    issues.push(`CP ${cp}: hay varias colonias en el catálogo SAT; elige una`);
    return null;
  }

  issues.push(`No se pudo resolver la colonia SAT para CP ${cp}`);
  return null;
}

/** Sustituye el domicilio SAT completo con lo resuelto para el CP nuevo. */
export function satDomicilioReplacePatch(
  resolved: ResolvedDomicilioSat,
): Record<string, string> {
  const patch: Record<string, string> = {};
  if (resolved.estado) patch.estado = resolved.estado;
  if (resolved.municipio_clave) {
    patch.municipio_clave = resolved.municipio_clave;
    patch.municipio = resolved.municipio ?? "";
  }
  patch.localidad_clave = resolved.localidad_clave ?? "";
  patch.localidad = resolved.localidad ?? "";
  if (resolved.colonia_clave) {
    patch.colonia_clave = resolved.colonia_clave;
    patch.colonia = resolved.colonia ?? "";
  }
  if (resolved.pais) patch.pais = resolved.pais;
  return patch;
}

/**
 * Mapea datos de Postalia + hints del usuario a claves SAT del catálogo local.
 * Solo devuelve campos que faltaban en el input original.
 * Para recalcular todo a partir del CP, pasa un input que solo traiga `cp`.
 */
export async function resolveDomicilioSat(
  input: UbicacionDomicilioInput,
  postalia: PostaliaCodigoPostalResponse,
): Promise<ResolvedDomicilioSat> {
  const issues: string[] = [];
  const cp = input.cp.trim();
  const result: ResolvedDomicilioSat = { issues };

  const estado = await resolveEstado(input, postalia, issues);
  if (estado && !isValidEstadoSatCode(input.estado)) {
    result.estado = estado;
  }

  if (!estado) return result;

  if (!input.municipio_clave?.trim()) {
    const municipio = await resolveMunicipio(input, postalia, estado, issues);
    if (municipio) {
      result.municipio_clave = municipio.clave;
      if (!input.municipio?.trim()) result.municipio = municipio.descripcion;
    }
  }

  if (!input.localidad_clave?.trim()) {
    const localidad = await resolveLocalidad(input, postalia, estado);
    if (localidad) {
      result.localidad_clave = localidad.clave;
      if (!input.localidad?.trim()) result.localidad = localidad.descripcion;
    }
  }

  if (!input.colonia_clave?.trim()) {
    const colonia = await resolveColonia(input, postalia, cp, issues);
    if (colonia) {
      result.colonia_clave = colonia.clave;
      if (!input.colonia?.trim()) result.colonia = colonia.nombre;
    }
  }

  if (!input.pais?.trim()) {
    result.pais = "MEX";
  }

  result.issues = issues;
  return result;
}
