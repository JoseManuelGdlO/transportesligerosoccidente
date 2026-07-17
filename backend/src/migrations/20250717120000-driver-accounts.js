"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("driver_accounts", {
      id: { type: Sequelize.CHAR(36), primaryKey: true },
      tenant_id: { type: Sequelize.CHAR(36), allowNull: false },
      driver_id: { type: Sequelize.CHAR(36), allowNull: false },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex("driver_accounts", ["tenant_id", "driver_id"], {
      unique: true,
      name: "driver_accounts_tenant_driver_uidx",
    });
    await queryInterface.addConstraint("driver_accounts", {
      fields: ["driver_id"],
      type: "foreign key",
      name: "driver_accounts_driver_fk",
      references: { table: "drivers", field: "id" },
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });

    await queryInterface.createTable("driver_account_items", {
      id: { type: Sequelize.CHAR(36), primaryKey: true },
      tenant_id: { type: Sequelize.CHAR(36), allowNull: false },
      account_id: { type: Sequelize.CHAR(36), allowNull: false },
      driver_id: { type: Sequelize.CHAR(36), allowNull: false },
      tipo: {
        type: Sequelize.ENUM("incidencia", "prestamo"),
        allowNull: false,
      },
      concepto: { type: Sequelize.STRING(512), allowNull: false },
      monto_original: { type: Sequelize.DECIMAL(14, 2), allowNull: false },
      cuota_liquidacion: { type: Sequelize.DECIMAL(14, 2), allowNull: false },
      fecha: { type: Sequelize.DATEONLY, allowNull: false },
      estatus: {
        type: Sequelize.ENUM("activo", "liquidado", "cancelado"),
        allowNull: false,
        defaultValue: "activo",
      },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex("driver_account_items", ["tenant_id", "driver_id", "estatus"], {
      name: "driver_account_items_driver_status_idx",
    });
    await queryInterface.addIndex("driver_account_items", ["account_id"], {
      name: "driver_account_items_account_idx",
    });
    await queryInterface.addConstraint("driver_account_items", {
      fields: ["account_id"],
      type: "foreign key",
      name: "driver_account_items_account_fk",
      references: { table: "driver_accounts", field: "id" },
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });
    await queryInterface.addConstraint("driver_account_items", {
      fields: ["driver_id"],
      type: "foreign key",
      name: "driver_account_items_driver_fk",
      references: { table: "drivers", field: "id" },
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });

    await queryInterface.createTable("driver_account_movements", {
      id: { type: Sequelize.CHAR(36), primaryKey: true },
      tenant_id: { type: Sequelize.CHAR(36), allowNull: false },
      account_id: { type: Sequelize.CHAR(36), allowNull: false },
      item_id: { type: Sequelize.CHAR(36), allowNull: false },
      driver_id: { type: Sequelize.CHAR(36), allowNull: false },
      tipo: {
        type: Sequelize.ENUM("liquidacion", "pago_directo"),
        allowNull: false,
      },
      monto: { type: Sequelize.DECIMAL(14, 2), allowNull: false },
      fecha: { type: Sequelize.DATEONLY, allowNull: false },
      nota: { type: Sequelize.STRING(512), allowNull: true },
      settlement_id: { type: Sequelize.CHAR(36), allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex("driver_account_movements", ["tenant_id", "driver_id"], {
      name: "driver_account_movements_driver_idx",
    });
    await queryInterface.addIndex("driver_account_movements", ["item_id"], {
      name: "driver_account_movements_item_idx",
    });
    await queryInterface.addIndex("driver_account_movements", ["item_id", "settlement_id"], {
      unique: true,
      name: "driver_account_movements_item_settlement_uidx",
    });
    await queryInterface.addConstraint("driver_account_movements", {
      fields: ["account_id"],
      type: "foreign key",
      name: "driver_account_movements_account_fk",
      references: { table: "driver_accounts", field: "id" },
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });
    await queryInterface.addConstraint("driver_account_movements", {
      fields: ["item_id"],
      type: "foreign key",
      name: "driver_account_movements_item_fk",
      references: { table: "driver_account_items", field: "id" },
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });
    await queryInterface.addConstraint("driver_account_movements", {
      fields: ["driver_id"],
      type: "foreign key",
      name: "driver_account_movements_driver_fk",
      references: { table: "drivers", field: "id" },
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });
    await queryInterface.addConstraint("driver_account_movements", {
      fields: ["settlement_id"],
      type: "foreign key",
      name: "driver_account_movements_settlement_fk",
      references: { table: "settlements", field: "id" },
      onDelete: "SET NULL",
      onUpdate: "CASCADE",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("driver_account_movements");
    await queryInterface.dropTable("driver_account_items");
    await queryInterface.dropTable("driver_accounts");
  },
};
