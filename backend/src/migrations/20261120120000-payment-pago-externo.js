"use strict";

/** Provisional: abonos de facturas ya pagadas en Sicofi, sin timbrar el complemento aquí. */
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("account_document_payments", "pago_externo", {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("account_document_payments", "pago_externo");
  },
};
