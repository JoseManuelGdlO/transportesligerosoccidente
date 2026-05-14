"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("clients", {
      id: { type: Sequelize.CHAR(36), primaryKey: true },
      razon_social: { type: Sequelize.STRING(255), allowNull: false },
      rfc: { type: Sequelize.STRING(32), allowNull: false },
      contacto: { type: Sequelize.STRING(255), allowNull: false },
      telefono: { type: Sequelize.STRING(64), allowNull: false },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false },
    });
  },
  async down(queryInterface) {
    await queryInterface.dropTable("clients");
  },
};
