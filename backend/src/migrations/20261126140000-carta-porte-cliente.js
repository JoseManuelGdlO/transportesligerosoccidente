"use strict";

/**
 * Cada factura puede tener su propio receptor.
 * Timbrada o cancelada: se queda con el cliente del viaje en ese momento.
 * Borrador sin cliente propio: sigue usando el cliente del viaje.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("cartas_porte", "client_id", {
      type: Sequelize.CHAR(36),
      allowNull: true,
    });
    await queryInterface.sequelize.query(`
      UPDATE cartas_porte c
      INNER JOIN trips t ON t.id = c.trip_id
      SET c.client_id = t.client_id
      WHERE c.client_id IS NULL
        AND c.estatus IN ('timbrada', 'cancelada')
    `);
    await queryInterface.addIndex("cartas_porte", ["client_id"], {
      name: "cartas_porte_client_id_idx",
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex("cartas_porte", "cartas_porte_client_id_idx");
    await queryInterface.removeColumn("cartas_porte", "client_id");
  },
};
