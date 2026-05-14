"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("trips", {
      id: { type: Sequelize.CHAR(36), primaryKey: true },
      folio: { type: Sequelize.STRING(32), allowNull: false, unique: true },
      truck_id: {
        type: Sequelize.CHAR(36),
        allowNull: false,
        references: { model: "trucks", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "RESTRICT",
      },
      driver_id: {
        type: Sequelize.CHAR(36),
        allowNull: false,
        references: { model: "drivers", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "RESTRICT",
      },
      client_id: {
        type: Sequelize.CHAR(36),
        allowNull: false,
        references: { model: "clients", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "RESTRICT",
      },
      origen: { type: Sequelize.STRING(255), allowNull: false },
      destino: { type: Sequelize.STRING(255), allowNull: false },
      fecha_salida: { type: Sequelize.DATE, allowNull: false },
      fecha_llegada: { type: Sequelize.DATE, allowNull: true },
      km_inicial: { type: Sequelize.INTEGER, allowNull: false },
      km_final: { type: Sequelize.INTEGER, allowNull: true },
      tarifa: { type: Sequelize.DECIMAL(14, 2), allowNull: false },
      viaticos_entregados: { type: Sequelize.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
      num_factura: { type: Sequelize.STRING(64), allowNull: true },
      comision_override: { type: Sequelize.DECIMAL(14, 2), allowNull: true },
      estatus: { type: Sequelize.ENUM("en_curso", "cerrado"), allowNull: false, defaultValue: "en_curso" },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex("trips", ["fecha_salida"], { name: "trips_fecha_salida_idx" });
    await queryInterface.addIndex("trips", ["driver_id"], { name: "trips_driver_id_idx" });
    await queryInterface.addIndex("trips", ["estatus"], { name: "trips_estatus_idx" });
  },
  async down(queryInterface) {
    await queryInterface.dropTable("trips");
  },
};
