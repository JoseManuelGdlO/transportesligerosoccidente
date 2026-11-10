import { ClientUbicacion } from "../models";
import { findReusable, type UbicacionIdentityRow } from "./clientUbicacionIdentity";

export async function matchActiveUbicacion(
  tenantId: string,
  clientId: string,
  incoming: UbicacionIdentityRow,
  exceptId?: string,
) {
  const rows = await ClientUbicacion.findAll({
    where: { tenant_id: tenantId, client_id: clientId, estatus: "activo" },
  });
  const existing = rows
    .filter((row) => row.id !== exceptId)
    .map((row) => ({ ...row.get({ plain: true }), createdAt: row.createdAt }));
  return findReusable(existing, { ...incoming, client_id: clientId });
}
