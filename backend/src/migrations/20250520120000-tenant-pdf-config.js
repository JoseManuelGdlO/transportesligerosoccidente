"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("tenants", "pdf_config", {
      type: Sequelize.JSON,
      allowNull: true,
    });
    await queryInterface.addColumn("tenants", "pdf_logo_path", {
      type: Sequelize.TEXT,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("tenants", "pdf_logo_path");
    await queryInterface.removeColumn("tenants", "pdf_config");
  },
};
