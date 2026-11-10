import type { ClientUbicacion } from "@/types/tlo";

function fold(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[.,#]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const ALIASES: Record<string, string> = {
  av: "avenida",
  avda: "avenida",
  blvd: "boulevard",
  blv: "boulevard",
  bulevar: "boulevard",
  prol: "prolongacion",
  prolg: "prolongacion",
};

function calleBase(calle: string | undefined, numero: string | undefined): string {
  const normalized = fold(calle ?? "")
    .split(" ")
    .filter(Boolean)
    .map((word) => ALIASES[word] ?? word)
    .join(" ");
  if (numero?.trim()) return normalized;
  return normalized.replace(/\s+\d+(?:-\d+)?[a-z]?$/, "");
}

export function sublocationLabel(
  u: Pick<ClientUbicacion, "colonia" | "calle" | "numero_exterior" | "localidad" | "nombre">,
): string {
  const colonia = u.colonia?.trim() || "Sin colonia";
  const puerta = [u.calle?.trim(), u.numero_exterior?.trim()].filter(Boolean).join(" ") || u.nombre.trim();
  const localidad = u.localidad?.trim();
  return `colonia ${colonia}, ${puerta}${localidad ? `, ${localidad}` : ""}`;
}

export function groupCatalogUbicaciones(rows: ClientUbicacion[]) {
  const buckets = new Map<string, ClientUbicacion[]>();
  for (const row of rows) {
    const digits = (row.cp ?? "").replace(/\D/g, "");
    const cp = digits.length === 5 ? digits : "";
    const key = `${row.client_id}:${cp || "sin-cp"}`;
    const list = buckets.get(key) ?? [];
    list.push(row);
    buckets.set(key, list);
  }

  return [...buckets.entries()]
    .map(([key, list]) => {
      const cp = (list[0].cp ?? "").trim() || "SIN CP";
      const client = (list[0].client_razon_social || list[0].razon_social || "SIN CLIENTE").trim().toUpperCase();
      const bases = list.map((row) => calleBase(row.calle, row.numero_exterior));
      const shared = bases.every((base) => base && base === bases[0]) ? bases[0] : "";
      const header = shared ? `${shared.toUpperCase()} ${cp} - ${client}` : `${cp} - ${client}`;
      const items = list
        .map((row) => ({ id: row.id, label: sublocationLabel(row) }))
        .sort((a, b) => a.label.localeCompare(b.label, "es"));
      return { key, header, items };
    })
    .sort((a, b) => a.header.localeCompare(b.header, "es"));
}
