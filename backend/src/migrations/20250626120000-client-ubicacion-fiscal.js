"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("client_ubicaciones", "rfc", {
      type: Sequelize.STRING(13),
      allowNull: true,
    });
    await queryInterface.addColumn("client_ubicaciones", "razon_social", {
      type: Sequelize.STRING(255),
      allowNull: true,
    });

    // Backfill desde el cliente padre para ubicaciones existentes sin datos fiscales propios.
    await queryInterface.sequelize.query(`
      UPDATE client_ubicaciones cu
      INNER JOIN clients c ON c.id = cu.client_id
      SET
        cu.rfc = COALESCE(NULLIF(TRIM(cu.rfc), ''), c.rfc),
        cu.razon_social = COALESCE(NULLIF(TRIM(cu.razon_social), ''), c.razon_social)
      WHERE cu.rfc IS NULL OR cu.razon_social IS NULL
    `);
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("client_ubicaciones", "razon_social");
    await queryInterface.removeColumn("client_ubicaciones", "rfc");
  },
};
