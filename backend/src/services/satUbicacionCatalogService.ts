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
  const where = term
    ? /^\d+$/.test(term)
      ? { estado: estadoNorm, clave: { [Op.like]: `${term}%` } }
      : term.length < 2
        ? null
        : {
            estado: estadoNorm,
            [Op.or]: [
              { descripcion: { [Op.like]: `%${term}%` } },
              { clave: { [Op.like]: `${term}%` } },
            ],
          }
    : { estado: estadoNorm };

  if (!where) return [];

  const rows = await SatMunicipio.findAll({
    where,
    order: [["descripcion", "ASC"]],
    limit: capped,
  });
  return rows.map(toMunicipioDto);
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
  const where = term
    ? /^\d+$/.test(term)
      ? { estado: estadoNorm, clave: { [Op.like]: `${term}%` } }
      : term.length < 2
        ? null
        : {
            estado: estadoNorm,
            [Op.or]: [
              { descripcion: { [Op.like]: `%${term}%` } },
              { clave: { [Op.like]: `${term}%` } },
            ],
          }
    : { estado: estadoNorm };

  if (!where) return [];

  const rows = await SatLocalidad.findAll({
    where,
    order: [["descripcion", "ASC"]],
    limit: capped,
  });
  return rows.map(toLocalidadDto);
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
  const where = term
    ? /^\d+$/.test(term)
      ? { codigo_postal: cpNorm, clave: { [Op.like]: `${term}%` } }
      : term.length < 2
        ? null
        : {
            codigo_postal: cpNorm,
            [Op.or]: [
              { nombre: { [Op.like]: `%${term}%` } },
              { clave: { [Op.like]: `${term}%` } },
            ],
          }
    : { codigo_postal: cpNorm };

  if (!where) return [];

  const rows = await SatColonia.findAll({
    where,
    order: [["nombre", "ASC"]],
    limit: capped,
  });
  return rows.map(toColoniaDto);
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
  const where =
    term.length >= 2
      ? {
          [Op.or]: [
            { estado: { [Op.like]: `${termUpper}%` } },
            { descripcion: { [Op.like]: `%${term}%` } },
          ],
        }
      : { estado: { [Op.like]: `${termUpper}%` } };

  const rows = await SatMunicipio.findAll({
    where,
    order: [
      ["estado", "ASC"],
      ["descripcion", "ASC"],
    ],
    limit: capped,
  });

  return rows.map(toEstadoDto);
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
