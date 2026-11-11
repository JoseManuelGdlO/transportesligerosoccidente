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
  tipo?: string | null;
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

/** Un CP de 5 dígitos identifica el sitio de ese cliente. Otro cliente con el mismo CP no entra. */
function cpIdentity(row: UbicacionIdentityRow): { client_id: string; cp: string } | null {
  const cp = cpKey(row.cp);
  if (!cp || !row.client_id) return null;
  return { client_id: row.client_id, cp };
}

export function sameUbicacion(a: UbicacionIdentityRow, b: UbicacionIdentityRow): boolean {
  const ka = cpIdentity(a);
  const kb = cpIdentity(b);
  if (!ka || !kb) return false;
  return ka.client_id === kb.client_id && ka.cp === kb.cp;
}

export type UbicacionTipo = "Origen" | "Destino" | "Ambos";

/**
 * Al reutilizar una ubicación el tipo solo se ensancha, nunca se estrecha:
 * Origen + Destino (en cualquier orden) → Ambos; si un lado ya es Ambos, queda Ambos.
 */
export function widenTipo(
  existing: string | null | undefined,
  incoming: string | null | undefined,
): UbicacionTipo {
  const a = existing?.trim();
  const b = incoming?.trim();
  if (!a && !b) return "Ambos";
  if (!a) return b as UbicacionTipo;
  if (!b) return a as UbicacionTipo;
  if (a === b) return a as UbicacionTipo;
  return "Ambos";
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
  const tipo = donors.reduce(
    (acc, row) => widenTipo(acc, row.tipo),
    (survivor.tipo ?? undefined) as string | undefined,
  );
  if (tipo !== (survivor.tipo ?? "").trim()) patch.tipo = tipo;
  return patch;
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
  const buckets = new Map<string, UbicacionIdentityRow[]>();
  for (const row of rows) {
    const key = cpIdentity(row);
    if (!key) continue;
    const id = `${key.client_id}\0${key.cp}`;
    const list = buckets.get(id) ?? [];
    list.push(row);
    buckets.set(id, list);
  }
  const groups: ReturnType<typeof rankGroup>[] = [];
  for (const members of buckets.values()) {
    if (members.length < 2) continue;
    groups.push(rankGroup(members));
  }
  return groups;
}

export function findReusable(
  existing: UbicacionIdentityRow[],
  incoming: UbicacionIdentityRow,
): { match: UbicacionIdentityRow; patch: Partial<UbicacionIdentityRow> } | null {
  if (!cpIdentity(incoming)) return null;
  const matches = existing.filter((row) => sameUbicacion(row, incoming));
  if (matches.length === 0) return null;
  const ranked = [...matches].sort((a, b) => richness(b) - richness(a) || timeOf(a) - timeOf(b));
  return { match: ranked[0], patch: fillPatch(ranked[0], [incoming]) };
}
