import { excelSerialToIsoDate, parseCatalogVersion } from "./satClavesProductosImport";

export const SAT_MUNICIPIO_SHEET = "c_Municipio";
export const SAT_LOCALIDAD_SHEET = "c_Localidad";
export const SAT_COLONIA_SHEETS = ["c_Colonia_1", "c_Colonia_2", "c_Colonia_3"] as const;

export const MUNICIPIO_HEADER = "c_Municipio";
export const LOCALIDAD_HEADER = "c_Localidad";
export const COLONIA_HEADER = "c_Colonia";

export type SatMunicipioRow = {
  clave: string;
  estado: string;
  descripcion: string;
  fecha_inicio_vigencia: string | null;
  fecha_fin_vigencia: string | null;
};

export type SatLocalidadRow = {
  clave: string;
  estado: string;
  descripcion: string;
  fecha_inicio_vigencia: string | null;
  fecha_fin_vigencia: string | null;
};

export type SatColoniaRow = {
  clave: string;
  codigo_postal: string;
  nombre: string;
  fecha_inicio_vigencia: string | null;
  fecha_fin_vigencia: string | null;
};

function findHeaderRowIndex(rows: unknown[][], header: string): number {
  return rows.findIndex((r) => String(r[0] ?? "").trim() === header);
}

function normalizeEstado(raw: unknown): string | null {
  const v = String(raw ?? "").trim().toUpperCase();
  return v || null;
}

function normalizeCp(raw: unknown): string | null {
  const v = String(raw ?? "").trim();
  return /^\d{5}$/.test(v) ? v : null;
}

export function parseSatMunicipiosRows(rows: unknown[][]): {
  catalogo_version: string | null;
  items: SatMunicipioRow[];
  skipped: number;
} {
  const headerIdx = findHeaderRowIndex(rows, MUNICIPIO_HEADER);
  if (headerIdx < 0) {
    throw new Error(`No se encontró encabezado "${MUNICIPIO_HEADER}" en la hoja`);
  }

  const catalogo_version = parseCatalogVersion(rows);
  const items: SatMunicipioRow[] = [];
  let skipped = 0;

  for (const row of rows.slice(headerIdx + 1)) {
    if (!Array.isArray(row)) continue;
    const clave = String(row[0] ?? "").trim();
    const estado = normalizeEstado(row[1]);
    if (!clave || !estado) continue;

    const descripcion = String(row[2] ?? "").trim();
    if (!descripcion) {
      skipped += 1;
      continue;
    }

    items.push({
      clave: clave.slice(0, 16),
      estado: estado.slice(0, 8),
      descripcion: descripcion.slice(0, 255),
      fecha_inicio_vigencia: excelSerialToIsoDate(row[3]),
      fecha_fin_vigencia: excelSerialToIsoDate(row[4]),
    });
  }

  return { catalogo_version, items, skipped };
}

export function parseSatLocalidadesRows(rows: unknown[][]): {
  catalogo_version: string | null;
  items: SatLocalidadRow[];
  skipped: number;
} {
  const headerIdx = findHeaderRowIndex(rows, LOCALIDAD_HEADER);
  if (headerIdx < 0) {
    throw new Error(`No se encontró encabezado "${LOCALIDAD_HEADER}" en la hoja`);
  }

  const catalogo_version = parseCatalogVersion(rows);
  const items: SatLocalidadRow[] = [];
  let skipped = 0;

  for (const row of rows.slice(headerIdx + 1)) {
    if (!Array.isArray(row)) continue;
    const clave = String(row[0] ?? "").trim();
    const estado = normalizeEstado(row[1]);
    if (!clave || !estado) continue;

    const descripcion = String(row[2] ?? "").trim();
    if (!descripcion) {
      skipped += 1;
      continue;
    }

    items.push({
      clave: clave.slice(0, 16),
      estado: estado.slice(0, 8),
      descripcion: descripcion.slice(0, 255),
      fecha_inicio_vigencia: excelSerialToIsoDate(row[3]),
      fecha_fin_vigencia: excelSerialToIsoDate(row[4]),
    });
  }

  return { catalogo_version, items, skipped };
}

export function parseSatColoniasRows(rows: unknown[][]): {
  catalogo_version: string | null;
  items: SatColoniaRow[];
  skipped: number;
} {
  const headerIdx = findHeaderRowIndex(rows, COLONIA_HEADER);
  if (headerIdx < 0) {
    throw new Error(`No se encontró encabezado "${COLONIA_HEADER}" en la hoja`);
  }

  const catalogo_version = parseCatalogVersion(rows);
  const items: SatColoniaRow[] = [];
  let skipped = 0;

  for (const row of rows.slice(headerIdx + 1)) {
    if (!Array.isArray(row)) continue;
    const clave = String(row[0] ?? "").trim();
    const codigo_postal = normalizeCp(row[1]);
    if (!clave || !codigo_postal) continue;

    const nombre = String(row[2] ?? "").trim();
    if (!nombre) {
      skipped += 1;
      continue;
    }

    items.push({
      clave: clave.slice(0, 16),
      codigo_postal,
      nombre: nombre.slice(0, 255),
      fecha_inicio_vigencia: excelSerialToIsoDate(row[3]),
      fecha_fin_vigencia: excelSerialToIsoDate(row[4]),
    });
  }

  return { catalogo_version, items, skipped };
}
