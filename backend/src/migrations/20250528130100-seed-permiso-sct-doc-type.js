"use strict";

const { randomUUID } = require("crypto");

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    const dialect = queryInterface.sequelize.getDialect();
    const now = new Date();

    const [tenants] = await queryInterface.sequelize.query(
      "SELECT id FROM tenants",
    );
    const tenantRows = tenants;

    for (const t of tenantRows) {
      const [existing] = await queryInterface.sequelize.query(
        `SELECT id FROM document_types WHERE tenant_id = :tenantId AND slug = 'permiso_sct' LIMIT 1`,
        { replacements: { tenantId: t.id } },
      );
      if (existing.length > 0) continue;

      const row = {
        id: randomUUID(),
        tenant_id: t.id,
        slug: "permiso_sct",
        nombre: "Permiso SCT",
        aplica_a: "unidad",
        dias_aviso: 30,
        requiere_vigencia: true,
        activo: true,
        created_at: now,
        updated_at: now,
      };

      if (dialect === "mysql" || dialect === "mariadb") {
        await queryInterface.bulkInsert("document_types", [row]);
      } else {
        await queryInterface.bulkInsert("document_types", [row], {});
      }
    }
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("document_types", { slug: "permiso_sct" });
  },
};
