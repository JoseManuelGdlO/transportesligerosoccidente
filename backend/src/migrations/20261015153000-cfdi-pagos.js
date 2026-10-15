"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("tenants", "cfdi_serie_pago", {
      type: Sequelize.STRING(16),
      allowNull: true,
      defaultValue: "P",
    });
    await queryInterface.addColumn("account_document_payments", "cfdi_pago_id", {
      type: Sequelize.CHAR(36),
      allowNull: true,
    });
    await queryInterface.createTable("cfdi_pagos", {
      id: { type: Sequelize.CHAR(36), primaryKey: true },
      tenant_id: { type: Sequelize.CHAR(36), allowNull: false },
      client_id: { type: Sequelize.CHAR(36), allowNull: false },
      fecha_pago: { type: Sequelize.DATE, allowNull: false },
      forma_pago_p: { type: Sequelize.STRING(2), allowNull: false },
      moneda_p: { type: Sequelize.STRING(3), allowNull: false },
      tipo_cambio_p: { type: Sequelize.DECIMAL(14, 6), allowNull: false },
      monto: { type: Sequelize.DECIMAL(14, 2), allowNull: false },
      num_operacion: { type: Sequelize.STRING(100), allowNull: true },
      serie: { type: Sequelize.STRING(16), allowNull: false },
      folio: { type: Sequelize.STRING(32), allowNull: false },
      estatus: { type: Sequelize.ENUM("error", "timbrado"), allowNull: false },
      uuid: { type: Sequelize.STRING(36), allowNull: true },
      xml_timbrado: { type: Sequelize.TEXT("long"), allowNull: true },
      pdf_path: { type: Sequelize.STRING(512), allowNull: true },
      timbrado_at: { type: Sequelize.DATE, allowNull: true },
      error_mensaje: { type: Sequelize.TEXT, allowNull: true },
      created_by: { type: Sequelize.CHAR(36), allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.createTable("cfdi_pago_documentos", {
      id: { type: Sequelize.CHAR(36), primaryKey: true },
      tenant_id: { type: Sequelize.CHAR(36), allowNull: false },
      cfdi_pago_id: { type: Sequelize.CHAR(36), allowNull: false },
      account_document_id: { type: Sequelize.CHAR(36), allowNull: false },
      carta_porte_id: { type: Sequelize.CHAR(36), allowNull: false },
      num_parcialidad: { type: Sequelize.INTEGER, allowNull: false },
      imp_saldo_ant: { type: Sequelize.DECIMAL(14, 2), allowNull: false },
      imp_pagado: { type: Sequelize.DECIMAL(14, 2), allowNull: false },
      imp_saldo_insoluto: { type: Sequelize.DECIMAL(14, 2), allowNull: false },
      moneda_dr: { type: Sequelize.STRING(3), allowNull: false },
      equivalencia_dr: { type: Sequelize.DECIMAL(14, 6), allowNull: false },
      objeto_imp_dr: { type: Sequelize.STRING(2), allowNull: false },
      impuestos: { type: Sequelize.JSON, allowNull: false },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex("cfdi_pagos", ["tenant_id", "folio"], {
      name: "cfdi_pagos_tenant_folio",
    });
    await queryInterface.addIndex("cfdi_pago_documentos", ["cfdi_pago_id"], {
      name: "cfdi_pago_documentos_pago",
    });
    await queryInterface.addIndex("account_document_payments", ["cfdi_pago_id"], {
      name: "account_document_payments_cfdi_pago",
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex("account_document_payments", "account_document_payments_cfdi_pago");
    await queryInterface.dropTable("cfdi_pago_documentos");
    await queryInterface.dropTable("cfdi_pagos");
    await queryInterface.removeColumn("account_document_payments", "cfdi_pago_id");
    await queryInterface.removeColumn("tenants", "cfdi_serie_pago");
  },
};
