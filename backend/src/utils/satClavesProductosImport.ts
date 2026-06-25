import type { SatMaterialPeligroso } from "./cartaPorteSat";

export const SAT_CLAVES_SHEET = "c_ClaveProdServCP";
export const CLAVE_PROD_SERV_HEADER = "c_ClaveProdServ";

export type SatClaveProductoRow = {
  clave: string;
  descripcion: string;
  palabras_similares: string | null;
  material_peligroso: SatMaterialPeligroso;
  fecha_inicio_vigencia: string | null;
  fecha_fin_vigencia: string | null;
};

/** Convierte serial de fecha Excel a `YYYY-MM-DD`. */
export function excelSerialToIsoDate(serial: unknown): string | null {
  if (serial == null || serial === "") return null;
  const n = typeof serial === "number" ? serial : Number(String(serial).trim());
  if (!Number.isFinite(n) || n <= 0) return null;
  const utc = new Date(Math.round((n - 25569) * 86400 * 1000));
  if (Number.isNaN(utc.getTime())) return null;
  return utc.toISOString().slice(0, 10);
}

export function normalizeMaterialPeligroso(raw: unknown): SatMaterialPeligroso | null {
  const v = String(raw ?? "").trim();
  if (v === "0" || v === "1" || v === "0,1") return v;
  return null;
}

export function findHeaderRowIndex(rows: unknown[][]): number {
  return rows.findIndex((r) => String(r[0] ?? "").trim() === CLAVE_PROD_SERV_HEADER);
}

export function parseCatalogVersion(rows: unknown[][]): string | null {
  const versionRow = rows[2];
  if (!Array.isArray(versionRow)) return null;
  const version = String(versionRow[0] ?? "").trim();
  const revision = String(versionRow[1] ?? "").trim();
  if (!version) return null;
  return revision ? `${version}.${revision}` : version;
}

export function parseSatClavesProductosRows(rows: unknown[][]): {
  catalogo_version: string | null;
  items: SatClaveProductoRow[];
  skipped: number;
} {
  const headerIdx = findHeaderRowIndex(rows);
  if (headerIdx < 0) {
    throw new Error(`No se encontró encabezado "${CLAVE_PROD_SERV_HEADER}" en la hoja`);
  }

  const catalogo_version = parseCatalogVersion(rows);
  const items: SatClaveProductoRow[] = [];
  let skipped = 0;

  for (const row of rows.slice(headerIdx + 1)) {
    if (!Array.isArray(row)) continue;
    const clave = String(row[0] ?? "").trim();
    if (!/^\d{8}$/.test(clave)) continue;

    const material_peligroso = normalizeMaterialPeligroso(row[3]);
    if (!material_peligroso) {
      skipped += 1;
      continue;
    }

    const descripcion = String(row[1] ?? "").trim();
    if (!descripcion) {
      skipped += 1;
      continue;
    }

    const palabras = String(row[2] ?? "").trim();
    items.push({
      clave,
      descripcion: descripcion.slice(0, 512),
      palabras_similares: palabras || null,
      material_peligroso,
      fecha_inicio_vigencia: excelSerialToIsoDate(row[4]),
      fecha_fin_vigencia: excelSerialToIsoDate(row[5]),
    });
  }

  return { catalogo_version, items, skipped };
}
