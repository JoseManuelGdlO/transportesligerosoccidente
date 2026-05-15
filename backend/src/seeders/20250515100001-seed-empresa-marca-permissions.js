"use strict";

const PERMS = [
  { id: "10000000-0000-4000-8000-000000000011", slug: "empresa.gestionar" },
  { id: "10000000-0000-4000-8000-000000000012", slug: "marca.gestionar" },
];
const ADMIN_ROLE_ID = "20000000-0000-4000-8000-000000000001";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    const now = new Date();
    for (const p of PERMS) {
      const [rows] = await queryInterface.sequelize.query(`SELECT id FROM permissions WHERE slug = :slug LIMIT 1`, {
        replacements: { slug: p.slug },
      });
      if (!rows || !rows.length) {
        await queryInterface.bulkInsert("permissions", [
          { id: p.id, slug: p.slug, created_at: now, updated_at: now },
        ]);
      }
    }
    for (const p of PERMS) {
      const [rows] = await queryInterface.sequelize.query(
        `SELECT 1 FROM role_permissions WHERE role_id = :rid AND permission_id = :pid LIMIT 1`,
        { replacements: { rid: ADMIN_ROLE_ID, pid: p.id } },
      );
      if (!rows || !rows.length) {
        await queryInterface.bulkInsert("role_permissions", [
          { role_id: ADMIN_ROLE_ID, permission_id: p.id, created_at: now, updated_at: now },
        ]);
      }
    }
  },

  async down(queryInterface) {
    for (const p of PERMS) {
      await queryInterface.bulkDelete("role_permissions", { permission_id: p.id });
      await queryInterface.bulkDelete("permissions", { id: p.id });
    }
  },
};
