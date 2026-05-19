"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("trips", "tipo_viaje", {
      type: Sequelize.ENUM("local", "foraneo"),
      allowNull: false,
      defaultValue: "local",
    });
    await queryInterface.addColumn("trips", "settlement_id", {
      type: Sequelize.CHAR(36),
      allowNull: true,
    });

    await queryInterface.addColumn("drivers", "comision_valor_local", {
      type: Sequelize.DECIMAL(12, 2),
      allowNull: true,
    });
    await queryInterface.addColumn("drivers", "comision_valor_foraneo", {
      type: Sequelize.DECIMAL(12, 2),
      allowNull: true,
    });
    await queryInterface.sequelize.query(
      "UPDATE drivers SET comision_valor_local = comision_valor, comision_valor_foraneo = comision_valor WHERE comision_valor_local IS NULL",
    );
    await queryInterface.changeColumn("drivers", "comision_valor_local", {
      type: Sequelize.DECIMAL(12, 2),
      allowNull: false,
    });
    await queryInterface.changeColumn("drivers", "comision_valor_foraneo", {
      type: Sequelize.DECIMAL(12, 2),
      allowNull: false,
    });

    await queryInterface.addColumn("fuel_loads", "es_foraneo", {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
    await queryInterface.addColumn("fuel_loads", "estacion_nombre", {
      type: Sequelize.STRING(255),
      allowNull: true,
    });
    await queryInterface.addColumn("fuel_loads", "es_estacion_empresa", {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    });
    await queryInterface.addColumn("fuel_loads", "comprobante_url", {
      type: Sequelize.STRING(512),
      allowNull: true,
    });

    await queryInterface.createTable("driver_advances", {
      id: { type: Sequelize.CHAR(36), primaryKey: true },
      tenant_id: { type: Sequelize.CHAR(36), allowNull: false },
      driver_id: { type: Sequelize.CHAR(36), allowNull: false },
      monto: { type: Sequelize.DECIMAL(14, 2), allowNull: false },
      fecha: { type: Sequelize.DATEONLY, allowNull: false },
      descripcion: { type: Sequelize.STRING(512), allowNull: false },
      settlement_id: { type: Sequelize.CHAR(36), allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex("driver_advances", ["tenant_id", "driver_id"]);

    await queryInterface.createTable("driver_discounts", {
      id: { type: Sequelize.CHAR(36), primaryKey: true },
      tenant_id: { type: Sequelize.CHAR(36), allowNull: false },
      driver_id: { type: Sequelize.CHAR(36), allowNull: false },
      tipo: {
        type: Sequelize.ENUM("prestamo", "dano", "multa", "otro"),
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
    await queryInterface.addIndex("driver_discounts", ["tenant_id", "driver_id"]);

    await queryInterface.createTable("maintenance_schedules", {
      id: { type: Sequelize.CHAR(36), primaryKey: true },
      tenant_id: { type: Sequelize.CHAR(36), allowNull: false },
      truck_id: { type: Sequelize.CHAR(36), allowNull: false },
      tipo: {
        type: Sequelize.ENUM("menor", "intermedio", "correctivo"),
        allowNull: false,
      },
      intervalo_km: { type: Sequelize.INTEGER, allowNull: true },
      ultimo_km: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      ultima_fecha: { type: Sequelize.DATEONLY, allowNull: true },
      activo: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex("maintenance_schedules", ["tenant_id", "truck_id", "tipo"], {
      unique: true,
      name: "maintenance_schedules_truck_tipo_unique",
    });

    await queryInterface.createTable("maintenance_records", {
      id: { type: Sequelize.CHAR(36), primaryKey: true },
      tenant_id: { type: Sequelize.CHAR(36), allowNull: false },
      truck_id: { type: Sequelize.CHAR(36), allowNull: false },
      tipo: {
        type: Sequelize.ENUM("menor", "intermedio", "correctivo"),
        allowNull: false,
      },
      km_odometro: { type: Sequelize.INTEGER, allowNull: false },
      fecha: { type: Sequelize.DATEONLY, allowNull: false },
      costo: { type: Sequelize.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
      descripcion: { type: Sequelize.STRING(512), allowNull: false },
      taller: { type: Sequelize.STRING(255), allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex("maintenance_records", ["tenant_id", "truck_id"]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("maintenance_records");
    await queryInterface.dropTable("maintenance_schedules");
    await queryInterface.dropTable("driver_discounts");
    await queryInterface.dropTable("driver_advances");
    await queryInterface.removeColumn("fuel_loads", "comprobante_url");
    await queryInterface.removeColumn("fuel_loads", "es_estacion_empresa");
    await queryInterface.removeColumn("fuel_loads", "estacion_nombre");
    await queryInterface.removeColumn("fuel_loads", "es_foraneo");
    await queryInterface.removeColumn("drivers", "comision_valor_foraneo");
    await queryInterface.removeColumn("drivers", "comision_valor_local");
    await queryInterface.removeColumn("trips", "settlement_id");
    await queryInterface.removeColumn("trips", "tipo_viaje");
  },
};
