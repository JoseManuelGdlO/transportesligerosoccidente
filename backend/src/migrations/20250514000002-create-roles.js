"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("roles", {
      id: { type: Sequelize.CHAR(36), primaryKey: true },
      slug: { type: Sequelize.STRING(32), allowNull: false, unique: true },
      nombre: { type: Sequelize.STRING(128), allowNull: false },
      descripcion: { type: Sequelize.TEXT, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false },
    });
  },
  async down(queryInterface) {
    await queryInterface.dropTable("roles");
  },
};
