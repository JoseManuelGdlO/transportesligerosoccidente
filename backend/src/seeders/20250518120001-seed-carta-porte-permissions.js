"use strict";

const { randomUUID } = require("node:crypto");

const SLUGS = [
  "cartaporte.ver",
  "cartaporte.timbrar",
  "cartaporte.cancelar",
  "fiscal.configurar",
];

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    const now = new Date();
    for (const slug of SLUGS) {
      const id = randomUUID();
      await queryInterface.sequelize.query(
        "INSERT IGNORE INTO `permissions` (`id`, `slug`, `created_at`, `updated_at`) VALUES (:id, :slug, :c, :u)",
        { replacements: { id, slug, c: now, u: now } },
      );
    }
    const [adminRows] = await queryInterface.sequelize.query(
      "SELECT id FROM roles WHERE slug = 'admin' LIMIT 1",
    );
    const adminId = adminRows[0]?.id;
    if (!adminId) return;
    const [permRows] = await queryInterface.sequelize.query(
      `SELECT id FROM permissions WHERE slug IN (${SLUGS.map(() => "?").join(",")})`,
      { replacements: SLUGS },
    );
    for (const row of permRows) {
      await queryInterface.sequelize.query(
        "INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`, `created_at`, `updated_at`) VALUES (:rid, :pid, :c, :u)",
        { replacements: { rid: adminId, pid: row.id, c: now, u: now } },
      );
    }
  },

  async down(queryInterface) {
    const [rows] = await queryInterface.sequelize.query(
      `SELECT id FROM permissions WHERE slug IN (${SLUGS.map(() => "?").join(",")})`,
      { replacements: SLUGS },
    );
    const ids = rows.map((r) => r.id);
    if (ids.length) {
      await queryInterface.bulkDelete("role_permissions", { permission_id: ids });
      await queryInterface.bulkDelete("permissions", { id: ids });
    }
  },
};
