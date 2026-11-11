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

function catalogLabel(row: ClientUbicacion): string {
  const digits = (row.cp ?? "").replace(/\D/g, "");
  const cp = digits.length === 5 ? digits : (row.cp ?? "").trim() || "SIN CP";
  const client = (row.client_razon_social || row.razon_social || "SIN CLIENTE").trim().toUpperCase();
  const calle = calleBase(row.calle, row.numero_exterior);
  return calle ? `${calle.toUpperCase()} ${cp} - ${client}` : `${cp} - ${client}`;
}

/** Una opción por ubicación. El mismo CP de otro cliente sigue siendo otra opción. */
export function catalogUbicacionOptions(rows: ClientUbicacion[]) {
  return rows
    .map((row) => ({ id: row.id, label: catalogLabel(row) }))
    .sort((a, b) => a.label.localeCompare(b.label, "es") || a.id.localeCompare(b.id));
}
