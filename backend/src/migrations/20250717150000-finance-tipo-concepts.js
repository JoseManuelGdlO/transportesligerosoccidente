"use strict";

const DISCOUNT_TIPOS_NEW = "'prestamo','dano','multa','nomina','caja','ahorro','fianza','otro'";
const DISCOUNT_TIPOS_OLD = "'prestamo','dano','multa','otro'";
const COMPENSATION_TIPOS_NEW = "'bono','espera','incentivo','nomina','caja','ahorro','fianza','otro'";
const COMPENSATION_TIPOS_OLD = "'bono','espera','incentivo','otro'";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const dialect = queryInterface.sequelize.getDialect();
    if (dialect === "mysql" || dialect === "mariadb") {
      await queryInterface.sequelize.query(
        `ALTER TABLE \`driver_discounts\` MODIFY COLUMN \`tipo\` ENUM(${DISCOUNT_TIPOS_NEW}) NOT NULL DEFAULT 'otro'`,
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE \`driver_compensations\` MODIFY COLUMN \`tipo\` ENUM(${COMPENSATION_TIPOS_NEW}) NOT NULL DEFAULT 'otro'`,
      );
    } else {
      await queryInterface.changeColumn("driver_discounts", "tipo", {
        type: Sequelize.ENUM("prestamo", "dano", "multa", "nomina", "caja", "ahorro", "fianza", "otro"),
        allowNull: false,
        defaultValue: "otro",
      });
      await queryInterface.changeColumn("driver_compensations", "tipo", {
        type: Sequelize.ENUM("bono", "espera", "incentivo", "nomina", "caja", "ahorro", "fianza", "otro"),
        allowNull: false,
        defaultValue: "otro",
      });
    }
  },

  async down(queryInterface, Sequelize) {
    const dialect = queryInterface.sequelize.getDialect();
    if (dialect === "mysql" || dialect === "mariadb") {
      await queryInterface.sequelize.query(
        "UPDATE `driver_discounts` SET `tipo` = 'otro' WHERE `tipo` IN ('nomina','caja','ahorro','fianza')",
      );
      await queryInterface.sequelize.query(
        "UPDATE `driver_compensations` SET `tipo` = 'otro' WHERE `tipo` IN ('nomina','caja','ahorro','fianza')",
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE \`driver_discounts\` MODIFY COLUMN \`tipo\` ENUM(${DISCOUNT_TIPOS_OLD}) NOT NULL DEFAULT 'otro'`,
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE \`driver_compensations\` MODIFY COLUMN \`tipo\` ENUM(${COMPENSATION_TIPOS_OLD}) NOT NULL DEFAULT 'otro'`,
      );
    } else {
      await queryInterface.changeColumn("driver_discounts", "tipo", {
        type: Sequelize.ENUM("prestamo", "dano", "multa", "otro"),
        allowNull: false,
        defaultValue: "otro",
      });
      await queryInterface.changeColumn("driver_compensations", "tipo", {
        type: Sequelize.ENUM("bono", "espera", "incentivo", "otro"),
        allowNull: false,
        defaultValue: "otro",
      });
    }
  },
};
