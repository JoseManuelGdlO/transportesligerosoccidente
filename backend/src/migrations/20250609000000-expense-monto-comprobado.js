"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("expenses", "monto_comprobado", {
      type: Sequelize.DECIMAL(14, 2),
      allowNull: false,
      defaultValue: 0,
    });
    await queryInterface.sequelize.query(
      "UPDATE expenses SET monto_comprobado = monto WHERE comprobado = true",
    );
    await queryInterface.removeColumn("expenses", "comprobado");
  },
  async down(queryInterface, Sequelize) {
    await queryInterface.addColumn("expenses", "comprobado", {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
    await queryInterface.sequelize.query(
      "UPDATE expenses SET comprobado = true WHERE monto_comprobado > 0",
    );
    await queryInterface.removeColumn("expenses", "monto_comprobado");
  },
};
