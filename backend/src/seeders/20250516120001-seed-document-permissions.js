"use strict";

/** Adds document & notification permissions and assigns them to admin role. Idempotent. */

const NEW_PERMS = [
  { id: "10000000-0000-4000-8000-000000000013", slug: "documentos.ver" },
  { id: "10000000-0000-4000-8000-000000000014", slug: "documentos.editar" },
  { id: "10000000-0000-4000-8000-000000000015", slug: "tipos_documento.gestionar" },
  { id: "10000000-0000-4000-8000-000000000016", slug: "notificaciones.ver" },
];

const ADMIN_ROLE_ID = "20000000-0000-4000-8000-000000000001";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    const now = new Date();
    const dialect = queryInterface.sequelize.getDialect();

    if (dialect === "mysql" || dialect === "mariadb") {
      for (const p of NEW_PERMS) {
        await queryInterface.sequelize.query(
          "INSERT IGNORE INTO `permissions` (`id`, `slug`, `created_at`, `updated_at`) VALUES (:id, :slug, :c, :u)",
          { replacements: { id: p.id, slug: p.slug, c: now, u: now } },
        );
      }
      for (const p of NEW_PERMS) {
        await queryInterface.sequelize.query(
          "INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`, `created_at`, `updated_at`) " +
            "VALUES (:roleId, :permissionId, :c, :u)",
          { replacements: { roleId: ADMIN_ROLE_ID, permissionId: p.id, c: now, u: now } },
        );
      }
    } else {
      await queryInterface.bulkInsert(
        "permissions",
        NEW_PERMS.map((p) => ({ ...p, created_at: now, updated_at: now })),
        { ignoreDuplicates: true },
      );
      const [rows] = await queryInterface.sequelize.query(
        `SELECT id FROM permissions WHERE slug IN ('documentos.ver','documentos.editar','tipos_documento.gestionar','notificaciones.ver')`,
      );
      for (const row of rows) {
        await queryInterface.bulkInsert(
          "role_permissions",
          [{ role_id: ADMIN_ROLE_ID, permission_id: row.id, created_at: now, updated_at: now }],
          { ignoreDuplicates: true },
        );
      }
    }
  },

  async down(queryInterface) {
    const slugs = NEW_PERMS.map((p) => p.slug);
    const [perms] = await queryInterface.sequelize.query(
      "SELECT id FROM permissions WHERE slug IN (:slugs)",
      { replacements: { slugs } },
    );
    const ids = perms.map((p) => p.id);
    if (ids.length > 0) {
      await queryInterface.bulkDelete("role_permissions", { permission_id: ids });
      await queryInterface.bulkDelete("permissions", { id: ids });
    }
  },
};
