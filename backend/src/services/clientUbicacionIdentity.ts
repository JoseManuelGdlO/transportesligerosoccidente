import { foldCatalogText } from "./satUbicacionCatalogService";

const STREET_ALIASES: Record<string, string> = {
  av: "avenida",
  avda: "avenida",
  blvd: "boulevard",
  blv: "boulevard",
  bulevar: "boulevard",
  prol: "prolongacion",
  prolg: "prolongacion",
};

export type UbicacionIdentityRow = {
  id?: string;
  client_id: string;
  nombre?: string | null;
  rfc?: string | null;
  razon_social?: string | null;
  calle?: string | null;
  numero_exterior?: string | null;
  numero_interior?: string | null;
  colonia?: string | null;
  colonia_clave?: string | null;
  localidad?: string | null;
  localidad_clave?: string | null;
  municipio?: string | null;
  municipio_clave?: string | null;
  estado?: string | null;
  pais?: string | null;
  cp?: string | null;
  createdAt?: Date | string | null;
};

function blank(value: string | null | undefined): string {
  return (value ?? "").trim();
}

export function normalizeToken(value: string | null | undefined): string {
  const folded = foldCatalogText(value ?? "")
    .replace(/[.,#]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!folded) return "";
  return folded
    .split(" ")
    .map((word) => STREET_ALIASES[word] ?? word)
    .join(" ");
}

/** Separa un número final solo cuando el campo de número viene vacío. */
export function splitCalleNumero(
  calle: string | null | undefined,
  numeroExterior: string | null | undefined,
): { calle: string; numero: string } {
  const numero = normalizeToken(numeroExterior);
  const normalized = normalizeToken(calle);
  if (numero) return { calle: normalized, numero };
  const match = normalized.match(/^(.*\S)\s+(\d+(?:-\d+)?[a-z]?)$/);
  if (!match) return { calle: normalized, numero: "" };
  return { calle: match[1].trim(), numero: match[2] };
}

export function calleBase(value: string | null | undefined): string {
  return splitCalleNumero(value, "").calle;
}

function cpKey(value: string | null | undefined): string {
  const digits = blank(value).replace(/\D/g, "");
  if (digits.length !== 5) return "";
  return digits;
}

function coloniaClave(row: UbicacionIdentityRow): string {
  return blank(row.colonia_clave);
}

function coloniaNombre(row: UbicacionIdentityRow): string {
  return normalizeToken(row.colonia);
}

function coloniaVacia(row: UbicacionIdentityRow): boolean {
  return !coloniaClave(row) && !coloniaNombre(row);
}

/**
 * Dos claves distintas son colonias distintas aunque el nombre coincida.
 * Si a un lado le falta la clave, decide el nombre normalizado.
 * Una fila sin clave ni nombre es compatible con cualquiera.
 */
function sameColonia(a: UbicacionIdentityRow, b: UbicacionIdentityRow): boolean {
  if (coloniaVacia(a) || coloniaVacia(b)) return true;
  const claveA = coloniaClave(a);
  const claveB = coloniaClave(b);
  if (claveA && claveB) return claveA === claveB;
  const nombreA = coloniaNombre(a);
  return nombreA !== "" && nombreA === coloniaNombre(b);
}

/**
 * Agrupa por colonia. Las filas con clave forman un grupo por clave; las que solo traen nombre
 * se suman al único grupo con clave que tenga ese nombre, o forman su propio grupo por nombre.
 * Si el nombre cae en varias claves, la fila es ambigua y se queda fuera.
 * Las filas sin colonia se suman solo si hay una única colonia.
 */
function coloniaBucketsOf(rows: UbicacionIdentityRow[]): UbicacionIdentityRow[][] {
  const byClave = new Map<string, UbicacionIdentityRow[]>();
  const nameOnly: UbicacionIdentityRow[] = [];
  const empty: UbicacionIdentityRow[] = [];
  for (const row of rows) {
    const clave = coloniaClave(row);
    if (clave) {
      const list = byClave.get(clave) ?? [];
      list.push(row);
      byClave.set(clave, list);
    } else if (coloniaNombre(row)) {
      nameOnly.push(row);
    } else {
      empty.push(row);
    }
  }
  const claveBuckets = [...byClave.values()];
  const byName = new Map<string, UbicacionIdentityRow[]>();
  for (const row of nameOnly) {
    const nombre = coloniaNombre(row);
    const candidates = claveBuckets.filter((bucket) => bucket.some((other) => coloniaNombre(other) === nombre));
    if (candidates.length === 1) {
      candidates[0].push(row);
    } else if (candidates.length === 0) {
      const list = byName.get(nombre) ?? [];
      list.push(row);
      byName.set(nombre, list);
    }
  }
  const buckets = [...claveBuckets, ...byName.values()];
  if (empty.length === 0) return buckets;
  if (buckets.length === 1) return [[...buckets[0], ...empty]];
  if (buckets.length === 0) return [empty];
  return buckets;
}

function localidadKey(row: UbicacionIdentityRow): string {
  return blank(row.localidad_clave).toUpperCase();
}

type HardKey = {
  client_id: string;
  cp: string;
  calle: string;
  numero: string;
  interior: string;
};

function hardKey(row: UbicacionIdentityRow): HardKey | null {
  const cp = cpKey(row.cp);
  if (!cp) return null;
  const { calle, numero } = splitCalleNumero(row.calle, row.numero_exterior);
  if (!calle && !numero) return null;
  return {
    client_id: row.client_id,
    cp,
    calle,
    numero,
    interior: normalizeToken(row.numero_interior),
  };
}

function hardEquals(a: HardKey, b: HardKey): boolean {
  return (
    a.client_id === b.client_id &&
    a.cp === b.cp &&
    a.calle === b.calle &&
    a.numero === b.numero &&
    a.interior === b.interior
  );
}

export function sameUbicacion(a: UbicacionIdentityRow, b: UbicacionIdentityRow): boolean {
  const ka = hardKey(a);
  const kb = hardKey(b);
  if (!ka || !kb || !hardEquals(ka, kb)) return false;
  if (!sameColonia(a, b)) return false;
  const locA = localidadKey(a);
  const locB = localidadKey(b);
  if (locA && locB && locA !== locB) return false;
  return true;
}

const FILLABLE = [
  "calle",
  "numero_exterior",
  "numero_interior",
  "colonia",
  "colonia_clave",
  "localidad",
  "localidad_clave",
  "municipio",
  "municipio_clave",
  "estado",
  "pais",
  "rfc",
  "razon_social",
] as const satisfies readonly (keyof UbicacionIdentityRow)[];

function richness(row: UbicacionIdentityRow): number {
  return FILLABLE.reduce((score, key) => score + (blank(row[key] as string | null | undefined) ? 1 : 0), 0);
}

function timeOf(row: UbicacionIdentityRow): number {
  if (!row.createdAt) return Number.POSITIVE_INFINITY;
  const ms = new Date(row.createdAt).getTime();
  return Number.isNaN(ms) ? Number.POSITIVE_INFINITY : ms;
}

function fillPatch(survivor: UbicacionIdentityRow, donors: UbicacionIdentityRow[]): Partial<UbicacionIdentityRow> {
  const patch: Partial<UbicacionIdentityRow> = {};
  for (const key of FILLABLE) {
    if (!blank(survivor[key] as string | null | undefined)) {
      const donor = donors.find((row) => blank(row[key] as string | null | undefined));
      if (donor) patch[key] = donor[key] as never;
    }
  }
  return patch;
}

/** Parte por clave. Si hay un solo valor, las filas sin clave se suman a ese grupo. Si hay varios, se quedan fuera. */
function bucketBy(
  rows: UbicacionIdentityRow[],
  keyOf: (row: UbicacionIdentityRow) => string,
): UbicacionIdentityRow[][] {
  const keyed = new Map<string, UbicacionIdentityRow[]>();
  const empty: UbicacionIdentityRow[] = [];
  for (const row of rows) {
    const key = keyOf(row);
    if (!key) {
      empty.push(row);
      continue;
    }
    const list = keyed.get(key) ?? [];
    list.push(row);
    keyed.set(key, list);
  }
  const buckets = [...keyed.values()];
  if (empty.length === 0) return buckets;
  if (buckets.length === 1) return [[...buckets[0], ...empty]];
  if (buckets.length === 0) return [empty];
  return buckets;
}

function hardBucketsOf(rows: UbicacionIdentityRow[]): UbicacionIdentityRow[][] {
  const hardBuckets = new Map<string, UbicacionIdentityRow[]>();
  for (const row of rows) {
    const key = hardKey(row);
    if (!key) continue;
    const id = JSON.stringify(key);
    const list = hardBuckets.get(id) ?? [];
    list.push(row);
    hardBuckets.set(id, list);
  }
  return [...hardBuckets.values()];
}

function rankGroup(members: UbicacionIdentityRow[]) {
  const ranked = [...members].sort((a, b) => {
    const score = richness(b) - richness(a);
    if (score !== 0) return score;
    return timeOf(a) - timeOf(b);
  });
  const survivor = ranked[0];
  const duplicates = ranked.slice(1);
  return { survivor, duplicates, patch: fillPatch(survivor, duplicates) };
}

export function groupDuplicates(rows: UbicacionIdentityRow[]) {
  const groups: ReturnType<typeof rankGroup>[] = [];
  for (const bucket of hardBucketsOf(rows)) {
    for (const coloniaBucket of coloniaBucketsOf(bucket)) {
      for (const localidadBucket of bucketBy(coloniaBucket, localidadKey)) {
        if (localidadBucket.length < 2) continue;
        groups.push(rankGroup(localidadBucket));
      }
    }
  }
  return groups;
}

export function ambiguousRows(rows: UbicacionIdentityRow[]): UbicacionIdentityRow[] {
  const out: UbicacionIdentityRow[] = [];
  for (const bucket of hardBucketsOf(rows)) {
    const withColonia = bucket.filter((row) => !coloniaVacia(row));
    const coloniaBuckets = coloniaBucketsOf(withColonia);
    if (coloniaBuckets.length > 1) out.push(...bucket.filter(coloniaVacia));
    for (const coloniaBucket of coloniaBuckets) {
      const localidades = new Set(coloniaBucket.map(localidadKey).filter(Boolean));
      if (localidades.size > 1) out.push(...coloniaBucket.filter((row) => !localidadKey(row)));
    }
  }
  return out;
}

export function findReusable(
  existing: UbicacionIdentityRow[],
  incoming: UbicacionIdentityRow,
): { match: UbicacionIdentityRow; patch: Partial<UbicacionIdentityRow> } | { ambiguous: true } | null {
  const incomingKey = hardKey(incoming);
  if (!incomingKey) return null;
  const matches = existing.filter((row) => sameUbicacion(row, incoming));
  if (matches.length === 0) return null;
  const conflicts = matches.some((row) => matches.some((other) => other !== row && !sameUbicacion(row, other)));
  if (conflicts) return { ambiguous: true };
  const ranked = [...matches].sort((a, b) => richness(b) - richness(a) || timeOf(a) - timeOf(b));
  return { match: ranked[0], patch: fillPatch(ranked[0], [incoming]) };
}
