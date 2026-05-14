"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("drivers", {
      id: { type: Sequelize.CHAR(36), primaryKey: true },
      nombre: { type: Sequelize.STRING(255), allowNull: false },
      telefono: { type: Sequelize.STRING(64), allowNull: false },
      licencia: { type: Sequelize.STRING(64), allowNull: false },
      fecha_ingreso: { type: Sequelize.DATEONLY, allowNull: false },
      comision_tipo: { type: Sequelize.ENUM("porcentaje", "fijo"), allowNull: false },
      comision_valor: { type: Sequelize.DECIMAL(12, 2), allowNull: false },
      estatus: { type: Sequelize.ENUM("activo", "inactivo"), allowNull: false, defaultValue: "activo" },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false },
    });
  },
  async down(queryInterface) {
    await queryInterface.dropTable("drivers");
  },
};
