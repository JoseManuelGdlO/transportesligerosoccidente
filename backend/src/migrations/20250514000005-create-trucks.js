"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("trucks", {
      id: { type: Sequelize.CHAR(36), primaryKey: true },
      numero_economico: { type: Sequelize.STRING(64), allowNull: false },
      placas: { type: Sequelize.STRING(32), allowNull: false },
      marca: { type: Sequelize.STRING(128), allowNull: false },
      modelo: { type: Sequelize.STRING(128), allowNull: false },
      anio: { type: Sequelize.INTEGER, allowNull: false },
      rendimiento_esperado: { type: Sequelize.DECIMAL(10, 2), allowNull: false },
      costo_km_ref: { type: Sequelize.DECIMAL(12, 2), allowNull: false },
      estatus: { type: Sequelize.ENUM("activo", "taller", "baja"), allowNull: false, defaultValue: "activo" },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex("trucks", ["numero_economico"], { name: "trucks_numero_economico_idx" });
  },
  async down(queryInterface) {
    await queryInterface.dropTable("trucks");
  },
};
