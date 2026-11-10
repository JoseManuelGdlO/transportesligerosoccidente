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

/** True when a domicilio field differs after trim. Null and "" are the same; no case-fold. */
export function identityChanged(before: UbicacionIdentityRow, after: UbicacionIdentityRow): boolean {
  return IDENTITY_FIELDS.some((field) => identityValue(before[field]) !== identityValue(after[field]));
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
