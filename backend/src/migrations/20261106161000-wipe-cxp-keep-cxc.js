"use strict";

/**
 * Reset pedido por el cliente: borra todas las cuentas por pagar y sus abonos.
 * Las cuentas por cobrar se conservan.
 */
module.exports = {
  async up(queryInterface) {
    const [tables] = await queryInterface.sequelize.query(
      "SELECT table_name AS name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'cfdi_pago_documentos'",
    );
    if (Array.isArray(tables) && tables.length) {
      await queryInterface.sequelize.query(`
        DELETE l FROM cfdi_pago_documentos l
        INNER JOIN account_documents d ON d.id = l.account_document_id
        WHERE d.tipo = 'cxp'
      `);
    }
    await queryInterface.sequelize.query(`
      DELETE p FROM account_document_payments p
      INNER JOIN account_documents d ON d.id = p.document_id
      WHERE d.tipo = 'cxp'
    `);
    await queryInterface.sequelize.query(`
      DELETE FROM account_documents WHERE tipo = 'cxp'
    `);
  },

  async down() {
    // Los documentos borrados no se pueden reconstruir.
  },
};
