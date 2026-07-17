"use strict";

const TIPOS_NEW = "'preventivo','menor','intermedio','mayor','correctivo'";
const TIPOS_OLD = "'menor','intermedio','mayor','correctivo'";

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
      return;
    }

    await queryInterface.changeColumn("maintenance_schedules", "tipo", {
      type: Sequelize.ENUM("preventivo", "menor", "intermedio", "mayor", "correctivo"),
      allowNull: false,
    });
    await queryInterface.changeColumn("maintenance_records", "tipo", {
      type: Sequelize.ENUM("preventivo", "menor", "intermedio", "mayor", "correctivo"),
      allowNull: false,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(
      "UPDATE maintenance_schedules SET tipo = 'menor' WHERE tipo = 'preventivo'",
    );
    await queryInterface.sequelize.query(
      "UPDATE maintenance_records SET tipo = 'menor' WHERE tipo = 'preventivo'",
    );

    const dialect = queryInterface.sequelize.getDialect();
    if (dialect === "mysql" || dialect === "mariadb") {
      await queryInterface.sequelize.query(
        `ALTER TABLE \`maintenance_schedules\` MODIFY COLUMN \`tipo\` ENUM(${TIPOS_OLD}) NOT NULL`,
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE \`maintenance_records\` MODIFY COLUMN \`tipo\` ENUM(${TIPOS_OLD}) NOT NULL`,
      );
      return;
    }

    await queryInterface.changeColumn("maintenance_schedules", "tipo", {
      type: Sequelize.ENUM("menor", "intermedio", "mayor", "correctivo"),
      allowNull: false,
    });
    await queryInterface.changeColumn("maintenance_records", "tipo", {
      type: Sequelize.ENUM("menor", "intermedio", "mayor", "correctivo"),
      allowNull: false,
    });
  },
};
