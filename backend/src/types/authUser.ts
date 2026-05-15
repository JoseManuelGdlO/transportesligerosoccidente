import type { PermissionSlug } from "../constants/permissions";

export interface AuthedUser {
  id: string;
  email: string;
  nombre: string;
  roleSlug: string;
  permissions: PermissionSlug[];
  tenantId: string;
  tenantSlug: string;
}
