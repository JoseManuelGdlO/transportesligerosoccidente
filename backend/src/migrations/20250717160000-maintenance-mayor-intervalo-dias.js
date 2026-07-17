"use strict";

const TIPOS_NEW = "'menor','intermedio','mayor','correctivo'";
const TIPOS_OLD = "'menor','intermedio','correctivo'";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const dialect = queryInterface.sequelize.getDialect();
    if (dialect === "mysql" || dialect === "mariadb") {
      await queryInterface.sequelize.query(
        `ALTER TABLE \`maintenance_schedules\` MODIFY COLUMN \`tipo\` ENUM(${TIPOS_NEW}) NOT NULL`,
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE \`maintenance_records\` MODIFY COLUMN \`tipo\` ENUM(${TIPOS_NEW}) NOT NULL`,
      );
    } else {
      await queryInterface.changeColumn("maintenance_schedules", "tipo", {
        type: Sequelize.ENUM("menor", "intermedio", "mayor", "correctivo"),
        allowNull: false,
      });
      await queryInterface.changeColumn("maintenance_records", "tipo", {
        type: Sequelize.ENUM("menor", "intermedio", "mayor", "correctivo"),
        allowNull: false,
      });
    }

    await queryInterface.addColumn("maintenance_schedules", "intervalo_dias", {
      type: Sequelize.INTEGER,
      allowNull: true,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn("maintenance_schedules", "intervalo_dias");

    const dialect = queryInterface.sequelize.getDialect();
    if (dialect === "mysql" || dialect === "mariadb") {
      await queryInterface.sequelize.query(
        "UPDATE `maintenance_schedules` SET `tipo` = 'intermedio' WHERE `tipo` = 'mayor'",
      );
      await queryInterface.sequelize.query(
        "UPDATE `maintenance_records` SET `tipo` = 'intermedio' WHERE `tipo` = 'mayor'",
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE \`maintenance_schedules\` MODIFY COLUMN \`tipo\` ENUM(${TIPOS_OLD}) NOT NULL`,
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE \`maintenance_records\` MODIFY COLUMN \`tipo\` ENUM(${TIPOS_OLD}) NOT NULL`,
      );
    } else {
      await queryInterface.sequelize.query(
        "UPDATE maintenance_schedules SET tipo = 'intermedio' WHERE tipo = 'mayor'",
      );
      await queryInterface.sequelize.query(
        "UPDATE maintenance_records SET tipo = 'intermedio' WHERE tipo = 'mayor'",
      );
      await queryInterface.changeColumn("maintenance_schedules", "tipo", {
        type: Sequelize.ENUM("menor", "intermedio", "correctivo"),
        allowNull: false,
      });
      await queryInterface.changeColumn("maintenance_records", "tipo", {
        type: Sequelize.ENUM("menor", "intermedio", "correctivo"),
        allowNull: false,
      });
    }
  },
};
