"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("maintenance_records", "factura_path", {
      type: Sequelize.STRING(512),
      allowNull: true,
    });
    await queryInterface.addColumn("maintenance_records", "factura_nombre", {
      type: Sequelize.STRING(255),
      allowNull: true,
    });
    await queryInterface.addColumn("maintenance_records", "factura_mime", {
      type: Sequelize.STRING(100),
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("maintenance_records", "factura_mime");
    await queryInterface.removeColumn("maintenance_records", "factura_nombre");
    await queryInterface.removeColumn("maintenance_records", "factura_path");
  },
};
