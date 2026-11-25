"use strict";

const ESTATUS_NEW = "'error','timbrado','cancelado'";
const ESTATUS_OLD = "'error','timbrado'";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const dialect = queryInterface.sequelize.getDialect();
    if (dialect === "mysql" || dialect === "mariadb") {
      await queryInterface.sequelize.query(
        `ALTER TABLE \`cfdi_pagos\` MODIFY COLUMN \`estatus\` ENUM(${ESTATUS_NEW}) NOT NULL`,
      );
      return;
    }
    await queryInterface.changeColumn("cfdi_pagos", "estatus", {
      type: Sequelize.ENUM("error", "timbrado", "cancelado"),
      allowNull: false,
    });
  },

  async down(queryInterface, Sequelize) {
    const dialect = queryInterface.sequelize.getDialect();
    if (dialect === "mysql" || dialect === "mariadb") {
      await queryInterface.sequelize.query(
        `ALTER TABLE \`cfdi_pagos\` MODIFY COLUMN \`estatus\` ENUM(${ESTATUS_OLD}) NOT NULL`,
      );
      return;
    }
    await queryInterface.changeColumn("cfdi_pagos", "estatus", {
      type: Sequelize.ENUM("error", "timbrado"),
      allowNull: false,
    });
  },
};
