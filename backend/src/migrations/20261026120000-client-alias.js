"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("clients", "alias", {
      type: Sequelize.STRING(255),
      allowNull: true,
    });
  },
  async down(queryInterface) {
    await queryInterface.removeColumn("clients", "alias");
  },
};
