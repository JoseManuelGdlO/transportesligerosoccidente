"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("expenses", "tipo", {
      type: Sequelize.ENUM("gasto", "ingreso"),
      allowNull: false,
      defaultValue: "gasto",
    });
    await queryInterface.addColumn("expenses", "visible_en_liquidacion", {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
  },
  async down(queryInterface) {
    await queryInterface.removeColumn("expenses", "visible_en_liquidacion");
    await queryInterface.removeColumn("expenses", "tipo");
    await queryInterface.sequelize.query("DROP TYPE IF EXISTS \"enum_expenses_tipo\";");
  },
};
