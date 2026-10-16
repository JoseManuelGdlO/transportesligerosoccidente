"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("cfdi_pagos", "email", {
      type: Sequelize.STRING(255),
      allowNull: true,
    });
    await queryInterface.addColumn("cfdi_pagos", "email_mensaje", {
      type: Sequelize.TEXT,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("cfdi_pagos", "email_mensaje");
    await queryInterface.removeColumn("cfdi_pagos", "email");
  },
};
