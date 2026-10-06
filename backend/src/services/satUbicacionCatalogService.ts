import { Op } from "sequelize";
import { SatColonia, SatLocalidad, SatMunicipio } from "../models";

export type SatMunicipioDto = {
  clave: string;
  estado: string;
  descripcion: string;
};

export type SatLocalidadDto = {
  clave: string;
  estado: string;
  descripcion: string;
};

export type SatColoniaDto = {
  clave: string;
  codigo_postal: string;
  nombre: string;
};

export type SatEstadoDto = {
  clave: string;
  descripcion: string;
  municipio_clave?: string;
  municipio?: string;
};

function capLimit(limit: number): number {
  return Math.min(Math.max(limit, 1), 50);
}

/** Minúsculas y sin acentos, para comparar nombres del catálogo SAT. */
export function foldCatalogText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

/** true si `haystack` contiene `needle` ignorando mayúsculas y acentos. */
export function catalogTextIncludes(haystack: string, needle: string): boolean {
  const foldedNeedle = foldCatalogText(needle);
  if (!foldedNeedle) return false;
  return foldCatalogText(haystack).includes(foldedNeedle);
}

function matchesClavePrefix(clave: string, term: string): boolean {
  return clave.toLowerCase().startsWith(term.trim().toLowerCase());
}

function toMunicipioDto(row: SatMunicipio): SatMunicipioDto {
  return { clave: row.clave, estado: row.estado, descripcion: row.descripcion };
}

function toLocalidadDto(row: SatLocalidad): SatLocalidadDto {
  return { clave: row.clave, estado: row.estado, descripcion: row.descripcion };
}

function toColoniaDto(row: SatColonia): SatColoniaDto {
  return { clave: row.clave, codigo_postal: row.codigo_postal, nombre: row.nombre };
}

export async function searchMunicipios(
  q: string,
  estado: string,
  limit = 20,
): Promise<SatMunicipioDto[]> {
  const estadoNorm = estado.trim().toUpperCase();
  if (!estadoNorm) return [];

  const term = q.trim();
  const capped = capLimit(limit);
  const textSearch = Boolean(term) && !/^\d+$/.test(term);
  if (textSearch && term.length < 2) return [];

  const where = term && !textSearch
    ? { estado: estadoNorm, clave: { [Op.like]: `${term}%` } }
    : { estado: estadoNorm };

  const rows = await SatMunicipio.findAll({
    where,
    order: [["descripcion", "ASC"]],
    ...(textSearch ? {} : { limit: capped }),
  });
  if (!textSearch) return rows.map(toMunicipioDto);

  return rows
    .filter(
      (row) => catalogTextIncludes(row.descripcion, term) || matchesClavePrefix(row.clave, term),
    )
    .slice(0, capped)
    .map(toMunicipioDto);
}

export async function getMunicipio(estado: string, clave: string): Promise<SatMunicipioDto | null> {
  const estadoNorm = estado.trim().toUpperCase();
  const claveNorm = clave.trim();
  if (!estadoNorm || !claveNorm) return null;
  const row = await SatMunicipio.findOne({
    where: { clave: claveNorm, estado: estadoNorm },
  });
  return row ? toMunicipioDto(row) : null;
}

export async function searchLocalidades(
  q: string,
  estado: string,
  limit = 20,
): Promise<SatLocalidadDto[]> {
  const estadoNorm = estado.trim().toUpperCase();
  if (!estadoNorm) return [];

  const term = q.trim();
  const capped = capLimit(limit);
  const textSearch = Boolean(term) && !/^\d+$/.test(term);
  if (textSearch && term.length < 2) return [];

  const where = term && !textSearch
    ? { estado: estadoNorm, clave: { [Op.like]: `${term}%` } }
    : { estado: estadoNorm };

  const rows = await SatLocalidad.findAll({
    where,
    order: [["descripcion", "ASC"]],
    ...(textSearch ? {} : { limit: capped }),
  });
  if (!textSearch) return rows.map(toLocalidadDto);

  return rows
    .filter(
      (row) => catalogTextIncludes(row.descripcion, term) || matchesClavePrefix(row.clave, term),
    )
    .slice(0, capped)
    .map(toLocalidadDto);
}

export async function getLocalidad(estado: string, clave: string): Promise<SatLocalidadDto | null> {
  const estadoNorm = estado.trim().toUpperCase();
  const claveNorm = clave.trim();
  if (!estadoNorm || !claveNorm) return null;
  const row = await SatLocalidad.findOne({
    where: { clave: claveNorm, estado: estadoNorm },
  });
  return row ? toLocalidadDto(row) : null;
}

export async function searchColonias(
  q: string,
  cp: string,
  limit = 20,
): Promise<SatColoniaDto[]> {
  const cpNorm = cp.trim();
  if (!/^\d{5}$/.test(cpNorm)) return [];

  const term = q.trim();
  const capped = capLimit(limit);
  const textSearch = Boolean(term) && !/^\d+$/.test(term);
  if (textSearch && term.length < 2) return [];

  const where = term && !textSearch
    ? { codigo_postal: cpNorm, clave: { [Op.like]: `${term}%` } }
    : { codigo_postal: cpNorm };

  const rows = await SatColonia.findAll({
    where,
    order: [["nombre", "ASC"]],
    ...(textSearch ? {} : { limit: capped }),
  });
  if (!textSearch) return rows.map(toColoniaDto);

  return rows
    .filter((row) => catalogTextIncludes(row.nombre, term) || matchesClavePrefix(row.clave, term))
    .slice(0, capped)
    .map(toColoniaDto);
}

export async function getColonia(cp: string, clave: string): Promise<SatColoniaDto | null> {
  const cpNorm = cp.trim();
  const claveNorm = clave.trim();
  if (!/^\d{5}$/.test(cpNorm) || !claveNorm) return null;
  const row = await SatColonia.findOne({
    where: { clave: claveNorm, codigo_postal: cpNorm },
  });
  return row ? toColoniaDto(row) : null;
}

function toEstadoDto(row: SatMunicipio): SatEstadoDto {
  return {
    clave: row.estado,
    descripcion: row.descripcion,
    municipio_clave: row.clave,
    municipio: row.descripcion,
  };
}

export async function searchEstados(q: string, limit = 20): Promise<SatEstadoDto[]> {
  const term = q.trim();
  const capped = capLimit(limit);

  if (!term) {
    const rows = await SatMunicipio.findAll({
      order: [
        ["estado", "ASC"],
        ["descripcion", "ASC"],
      ],
      limit: capped,
    });
    return rows.map(toEstadoDto);
  }

  const termUpper = term.toUpperCase();
  const rows = await SatMunicipio.findAll({
    order: [
      ["estado", "ASC"],
      ["descripcion", "ASC"],
    ],
  });

  return rows
    .filter((row) => {
      if (row.estado.toUpperCase().startsWith(termUpper)) return true;
      return term.length >= 2 && catalogTextIncludes(row.descripcion, term);
    })
    .slice(0, capped)
    .map(toEstadoDto);
}

export async function findMunicipioByDescripcion(
  descripcion: string,
  estado?: string,
): Promise<SatMunicipioDto | null> {
  const term = descripcion.trim();
  if (term.length < 2) return null;

  const estadoNorm = estado?.trim().toUpperCase();
  const rows = await SatMunicipio.findAll({
    where: estadoNorm ? { estado: estadoNorm } : undefined,
    order: [
      ["estado", "ASC"],
      ["descripcion", "ASC"],
    ],
  });
  const match = rows.find(
    (row) => catalogTextIncludes(row.descripcion, term) || matchesClavePrefix(row.clave, term),
  );
  return match ? toMunicipioDto(match) : null;
}

export async function listColoniasByCp(cp: string, limit = 50): Promise<SatColoniaDto[]> {
  const cpNorm = cp.trim();
  if (!/^\d{5}$/.test(cpNorm)) return [];

  const rows = await SatColonia.findAll({
    where: { codigo_postal: cpNorm },
    order: [["nombre", "ASC"]],
    limit: capLimit(limit),
  });
  return rows.map(toColoniaDto);
}

export async function hasLocalidadesForEstado(estado: string): Promise<boolean> {
  const estadoNorm = estado.trim().toUpperCase();
  if (!estadoNorm) return false;
  const count = await SatLocalidad.count({ where: { estado: estadoNorm } });
  return count > 0;
}

export async function getEstado(
  clave: string,
  municipioClave?: string,
): Promise<SatEstadoDto | null> {
  const claveNorm = clave.trim().toUpperCase();
  if (!claveNorm) return null;

  const municipioNorm = municipioClave?.trim();
  if (municipioNorm) {
    const row = await SatMunicipio.findOne({
      where: { estado: claveNorm, clave: municipioNorm },
    });
    return row ? toEstadoDto(row) : null;
  }

  const row = await SatMunicipio.findOne({
    where: { estado: claveNorm },
    order: [["descripcion", "ASC"]],
  });
  return row ? toEstadoDto(row) : null;
}
