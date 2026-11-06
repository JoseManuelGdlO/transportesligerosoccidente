"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("expenses", "genera_cxc", {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
    await queryInterface.addColumn("account_documents", "categoria", {
      type: Sequelize.STRING(32),
      allowNull: true,
    });
    await queryInterface.addColumn("account_documents", "unidad", {
      type: Sequelize.STRING(64),
      allowNull: true,
    });
    await queryInterface.removeIndex("account_documents", "account_documents_tenant_expense_uidx");
    await queryInterface.addIndex("account_documents", ["tenant_id", "expense_id", "tipo"], {
      unique: true,
      name: "account_documents_tenant_expense_tipo_uidx",
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex(
      "account_documents",
      "account_documents_tenant_expense_tipo_uidx",
    );
    await queryInterface.addIndex("account_documents", ["tenant_id", "expense_id"], {
      unique: true,
      name: "account_documents_tenant_expense_uidx",
    });
    await queryInterface.removeColumn("account_documents", "unidad");
    await queryInterface.removeColumn("account_documents", "categoria");
    await queryInterface.removeColumn("expenses", "genera_cxc");
  },
};
