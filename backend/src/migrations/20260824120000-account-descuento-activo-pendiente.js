"use strict";

const TIPOS_NEW = "'incidencia','prestamo','pendiente'";
const TIPOS_OLD = "'incidencia','prestamo'";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("driver_account_items", "descuento_activo", {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    });
    await queryInterface.addColumn("driver_account_items", "origen_settlement_id", {
      type: Sequelize.CHAR(36),
      allowNull: true,
    });
    await queryInterface.addIndex("driver_account_items", ["origen_settlement_id"], {
      unique: true,
      name: "driver_account_items_origen_settlement_uidx",
    });
    await queryInterface.addConstraint("driver_account_items", {
      fields: ["origen_settlement_id"],
      type: "foreign key",
      name: "driver_account_items_origen_settlement_fk",
      references: { table: "settlements", field: "id" },
      onDelete: "SET NULL",
      onUpdate: "CASCADE",
    });

    const dialect = queryInterface.sequelize.getDialect();
    if (dialect === "mysql" || dialect === "mariadb") {
      await queryInterface.sequelize.query(
        `ALTER TABLE \`driver_account_items\` MODIFY COLUMN \`tipo\` ENUM(${TIPOS_NEW}) NOT NULL`,
      );
    } else {
      await queryInterface.changeColumn("driver_account_items", "tipo", {
        type: Sequelize.ENUM("incidencia", "prestamo", "pendiente"),
        allowNull: false,
      });
    }
  },

  async down(queryInterface, Sequelize) {
    const dialect = queryInterface.sequelize.getDialect();
    if (dialect === "mysql" || dialect === "mariadb") {
      await queryInterface.sequelize.query(
        "UPDATE `driver_account_items` SET `tipo` = 'incidencia' WHERE `tipo` = 'pendiente'",
      );
    } else {
      await queryInterface.bulkUpdate("driver_account_items", { tipo: "incidencia" }, { tipo: "pendiente" });
    }

    if (dialect === "mysql" || dialect === "mariadb") {
      await queryInterface.sequelize.query(
        `ALTER TABLE \`driver_account_items\` MODIFY COLUMN \`tipo\` ENUM(${TIPOS_OLD}) NOT NULL`,
      );
    } else {
      await queryInterface.changeColumn("driver_account_items", "tipo", {
        type: Sequelize.ENUM("incidencia", "prestamo"),
        allowNull: false,
      });
    }

    await queryInterface.removeConstraint("driver_account_items", "driver_account_items_origen_settlement_fk");
    await queryInterface.removeIndex("driver_account_items", "driver_account_items_origen_settlement_uidx");
    await queryInterface.removeColumn("driver_account_items", "origen_settlement_id");
    await queryInterface.removeColumn("driver_account_items", "descuento_activo");
  },
};
