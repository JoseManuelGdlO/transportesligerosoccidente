import { Permission, Role, User } from "../models";

export async function usersWithPermission(tenantId: string, permissionSlug: string): Promise<User[]> {
  return User.findAll({
    where: { tenant_id: tenantId, estatus: "activo" },
    include: [
      {
        model: Role,
        required: true,
        include: [
          {
            model: Permission,
            required: true,
            attributes: [],
            through: { attributes: [] },
            where: { slug: permissionSlug },
          },
        ],
      },
    ],
  });
}
