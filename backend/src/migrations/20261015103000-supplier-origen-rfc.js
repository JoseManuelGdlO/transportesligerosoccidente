"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("suppliers", "origen", {
      type: Sequelize.ENUM("manual", "auto"),
      allowNull: false,
      defaultValue: "manual",
    });

    // Gasolineras creadas solas: sin datos de contacto y sin uso en mantenimiento o gastos.
    await queryInterface.sequelize.query(`
      UPDATE suppliers s
      SET origen = 'auto'
      WHERE (s.rfc IS NULL OR TRIM(s.rfc) = '')
        AND (s.contacto IS NULL OR TRIM(s.contacto) = '')
        AND (s.telefono IS NULL OR TRIM(s.telefono) = '')
        AND (s.email IS NULL OR TRIM(s.email) = '')
        AND NOT EXISTS (
          SELECT 1 FROM maintenance_records m WHERE m.supplier_id = s.id
        )
        AND NOT EXISTS (
          SELECT 1 FROM expenses e WHERE e.supplier_id = s.id
        )
    `);

    await queryInterface.sequelize.query(`
      UPDATE suppliers
      SET rfc = NULL
      WHERE rfc IS NOT NULL AND TRIM(rfc) = ''
    `);
    await queryInterface.sequelize.query(`
      UPDATE suppliers
      SET rfc = UPPER(TRIM(rfc))
      WHERE rfc IS NOT NULL
    `);

    await queryInterface.addIndex("suppliers", ["tenant_id", "rfc"], {
      unique: true,
      name: "suppliers_tenant_rfc_unique",
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex("suppliers", "suppliers_tenant_rfc_unique");
    await queryInterface.removeColumn("suppliers", "origen");
  },
};
