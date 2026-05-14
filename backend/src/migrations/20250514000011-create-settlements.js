"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("settlements", {
      id: { type: Sequelize.CHAR(36), primaryKey: true },
      driver_id: {
        type: Sequelize.CHAR(36),
        allowNull: false,
        references: { model: "drivers", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "RESTRICT",
      },
      fecha_inicio: { type: Sequelize.DATEONLY, allowNull: false },
      fecha_fin: { type: Sequelize.DATEONLY, allowNull: false },
      cerrado: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      cerrado_at: { type: Sequelize.DATE, allowNull: true },
      snapshot: { type: Sequelize.JSON, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex("settlements", ["driver_id", "fecha_inicio", "fecha_fin"], {
      name: "settlements_driver_period_idx",
    });
  },
  async down(queryInterface) {
    await queryInterface.dropTable("settlements");
  },
};
