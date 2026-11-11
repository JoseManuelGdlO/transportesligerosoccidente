import { findReusable, widenTipo, type UbicacionIdentityRow, type UbicacionTipo } from "./clientUbicacionIdentity";

function cpIdentityValue(value: string | null | undefined): string {
  const digits = (value ?? "").replace(/\D/g, "");
  if (digits.length === 5) return digits;
  return (value ?? "").trim();
}

/** El CP de 5 dígitos es la identidad. Calle, colonia y localidad no abren otra ubicación. */
export function identityChanged(before: UbicacionIdentityRow, after: UbicacionIdentityRow): boolean {
  return cpIdentityValue(before.cp) !== cpIdentityValue(after.cp);
}

export type { UbicacionTipo };
export { widenTipo };

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
