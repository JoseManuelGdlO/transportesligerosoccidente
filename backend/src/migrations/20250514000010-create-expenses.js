"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("expenses", {
      id: { type: Sequelize.CHAR(36), primaryKey: true },
      trip_id: {
        type: Sequelize.CHAR(36),
        allowNull: false,
        references: { model: "trips", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      categoria: {
        type: Sequelize.ENUM("casetas", "refacciones", "hospedaje", "comidas", "otros"),
        allowNull: false,
      },
      descripcion: { type: Sequelize.STRING(512), allowNull: false },
      monto: { type: Sequelize.DECIMAL(14, 2), allowNull: false },
      comprobado: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      fecha: { type: Sequelize.DATE, allowNull: false },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex("expenses", ["trip_id"], { name: "expenses_trip_id_idx" });
  },
  async down(queryInterface) {
    await queryInterface.dropTable("expenses");
  },
};
