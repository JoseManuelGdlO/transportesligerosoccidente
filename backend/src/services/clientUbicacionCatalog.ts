import { findReusable, type UbicacionIdentityRow } from "./clientUbicacionIdentity";

const IDENTITY_FIELDS = [
  "calle",
  "numero_exterior",
  "numero_interior",
  "colonia",
  "colonia_clave",
  "localidad",
  "localidad_clave",
  "cp",
] as const;

function identityValue(value: string | null | undefined): string {
  return (value ?? "").trim();
}

/** `calle` se guarda con trim + mayúsculas (ver el controller); se compara igual. */
function identityComparable(field: (typeof IDENTITY_FIELDS)[number], row: UbicacionIdentityRow): string {
  const value = identityValue(row[field]);
  return field === "calle" ? value.toUpperCase() : value;
}

/**
 * True when a domicilio field differs after trim. Null and "" are the same.
 * `calle` ignora mayúsculas/minúsculas; el resto de campos solo recorta.
 */
export function identityChanged(before: UbicacionIdentityRow, after: UbicacionIdentityRow): boolean {
  return IDENTITY_FIELDS.some((field) => identityComparable(field, before) !== identityComparable(field, after));
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

export async function matchActiveUbicacion(
  tenantId: string,
  clientId: string,
  incoming: UbicacionIdentityRow,
  exceptId?: string,
) {
  const { ClientUbicacion } = await import("../models");
  const rows = await ClientUbicacion.findAll({
    where: { tenant_id: tenantId, client_id: clientId, estatus: "activo" },
  });
  const existing = rows
    .filter((row) => row.id !== exceptId)
    .map((row) => ({ ...row.get({ plain: true }), createdAt: row.createdAt }));
  return findReusable(existing, { ...incoming, client_id: clientId });
}
