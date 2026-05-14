"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("users", {
      id: { type: Sequelize.CHAR(36), primaryKey: true },
      role_id: {
        type: Sequelize.CHAR(36),
        allowNull: false,
        references: { model: "roles", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "RESTRICT",
      },
      email: { type: Sequelize.STRING(255), allowNull: false, unique: true },
      password_hash: { type: Sequelize.STRING(255), allowNull: false },
      nombre: { type: Sequelize.STRING(255), allowNull: false },
      estatus: { type: Sequelize.ENUM("activo", "inactivo"), allowNull: false, defaultValue: "activo" },
      ultimo_acceso: { type: Sequelize.DATE, allowNull: true },
      creado_en: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex("users", ["email"], { name: "users_email_idx" });
  },
  async down(queryInterface) {
    await queryInterface.dropTable("users");
  },
};
