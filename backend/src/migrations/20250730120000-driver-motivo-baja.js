"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("drivers", "motivo_baja", {
      type: Sequelize.TEXT,
      allowNull: true,
    });
    await queryInterface.addColumn("drivers", "fecha_baja", {
      type: Sequelize.DATE,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("drivers", "fecha_baja");
    await queryInterface.removeColumn("drivers", "motivo_baja");
  },
};
