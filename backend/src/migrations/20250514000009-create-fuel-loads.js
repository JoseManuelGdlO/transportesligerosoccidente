"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("fuel_loads", {
      id: { type: Sequelize.CHAR(36), primaryKey: true },
      trip_id: {
        type: Sequelize.CHAR(36),
        allowNull: false,
        references: { model: "trips", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      litros: { type: Sequelize.DECIMAL(12, 2), allowNull: false },
      precio_litro: { type: Sequelize.DECIMAL(12, 4), allowNull: false },
      ubicacion: { type: Sequelize.STRING(255), allowNull: false },
      fecha: { type: Sequelize.DATE, allowNull: false },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex("fuel_loads", ["trip_id"], { name: "fuel_loads_trip_id_idx" });
  },
  async down(queryInterface) {
    await queryInterface.dropTable("fuel_loads");
  },
};
