"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("driver_compensations", {
      id: { type: Sequelize.CHAR(36), primaryKey: true },
      tenant_id: { type: Sequelize.CHAR(36), allowNull: false },
      driver_id: { type: Sequelize.CHAR(36), allowNull: false },
      tipo: {
        type: Sequelize.ENUM("bono", "espera", "incentivo", "otro"),
        allowNull: false,
        defaultValue: "otro",
      },
      monto: { type: Sequelize.DECIMAL(14, 2), allowNull: false },
      fecha: { type: Sequelize.DATEONLY, allowNull: false },
      descripcion: { type: Sequelize.STRING(512), allowNull: false },
      settlement_id: { type: Sequelize.CHAR(36), allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex("driver_compensations", ["tenant_id", "driver_id"]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("driver_compensations");
  },
};
