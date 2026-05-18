"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("tenants", "fuel_proveedor_url", {
      type: Sequelize.STRING(512),
      allowNull: true,
    });
    await queryInterface.addColumn("tenants", "fuel_proveedor_usuario", {
      type: Sequelize.STRING(128),
      allowNull: true,
    });
    await queryInterface.addColumn("tenants", "fuel_proveedor_password_enc", {
      type: Sequelize.TEXT,
      allowNull: true,
    });
    await queryInterface.addColumn("tenants", "fuel_sync_habilitado", {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("tenants", "fuel_sync_habilitado");
    await queryInterface.removeColumn("tenants", "fuel_proveedor_password_enc");
    await queryInterface.removeColumn("tenants", "fuel_proveedor_usuario");
    await queryInterface.removeColumn("tenants", "fuel_proveedor_url");
  },
};
