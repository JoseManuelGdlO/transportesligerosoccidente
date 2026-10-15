"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    const tables = ["fuel_tickets", "maintenance_records", "expenses", "account_documents"];
    for (const table of tables) {
      await queryInterface.sequelize.query(`
        UPDATE ${table} t
        INNER JOIN suppliers s ON s.id = t.supplier_id
        SET t.supplier_id = NULL
        WHERE s.origen = 'auto'
      `);
    }
    await queryInterface.sequelize.query(`
      DELETE FROM suppliers WHERE origen = 'auto'
    `);
  },

  async down() {
    // No se recrean las filas automáticas: el catálogo vuelve a ser solo altas manuales.
  },
};
