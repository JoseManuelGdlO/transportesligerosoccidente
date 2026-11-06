"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("expenses", "pagado", {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
    await queryInterface.addColumn("expenses", "forma_pago", {
      type: Sequelize.STRING(2),
      allowNull: true,
    });
  },
  async down(queryInterface) {
    await queryInterface.removeColumn("expenses", "forma_pago");
    await queryInterface.removeColumn("expenses", "pagado");
  },
};
