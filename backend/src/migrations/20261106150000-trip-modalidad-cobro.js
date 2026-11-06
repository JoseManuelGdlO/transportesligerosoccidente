"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("trips", "modalidad_cobro", {
      type: Sequelize.ENUM("factura", "efectivo", "sin_comision", "sin_cobro"),
      allowNull: false,
      defaultValue: "factura",
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("trips", "modalidad_cobro");
  },
};
