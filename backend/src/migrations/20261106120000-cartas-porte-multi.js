"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.removeIndex("cartas_porte", "cartas_porte_trip_unique");
    await queryInterface.addIndex("cartas_porte", ["tenant_id", "trip_id"], {
      name: "cartas_porte_tenant_trip_idx",
    });
    await queryInterface.addColumn("cartas_porte", "cfdi_conceptos", {
      type: Sequelize.JSON,
      allowNull: true,
    });
    await queryInterface.sequelize.query(`
      UPDATE cartas_porte c
      INNER JOIN trips t ON t.id = c.trip_id AND t.tenant_id = c.tenant_id
      SET c.cfdi_conceptos = t.cfdi_conceptos
      WHERE t.cfdi_conceptos IS NOT NULL
    `);
    await queryInterface.addColumn("account_documents", "carta_porte_id", {
      type: Sequelize.CHAR(36),
      allowNull: true,
    });
    await queryInterface.sequelize.query(`
      UPDATE account_documents d
      INNER JOIN cartas_porte c ON c.trip_id = d.trip_id AND c.tenant_id = d.tenant_id
      SET d.carta_porte_id = c.id
      WHERE d.origen = 'viaje' AND d.trip_id IS NOT NULL AND d.carta_porte_id IS NULL
    `);
    await queryInterface.removeIndex("account_documents", "account_documents_tenant_trip_uidx");
    await queryInterface.addIndex("account_documents", ["tenant_id", "trip_id"], {
      name: "account_documents_tenant_trip_idx",
    });
    await queryInterface.addIndex("account_documents", ["tenant_id", "carta_porte_id"], {
      unique: true,
      name: "account_documents_tenant_carta_uidx",
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex("account_documents", "account_documents_tenant_carta_uidx");
    await queryInterface.removeIndex("account_documents", "account_documents_tenant_trip_idx");

    await queryInterface.sequelize.query(`
      UPDATE account_documents SET carta_porte_id = NULL
    `);
    const [dupCxc] = await queryInterface.sequelize.query(`
      SELECT tenant_id, trip_id, COUNT(*) AS n
      FROM account_documents
      WHERE origen = 'viaje' AND trip_id IS NOT NULL
      GROUP BY tenant_id, trip_id
      HAVING COUNT(*) > 1
      LIMIT 1
    `);
    if (Array.isArray(dupCxc) && dupCxc.length > 0) {
      throw new Error("hay que fusionar las CXC a mano");
    }
    await queryInterface.addIndex("account_documents", ["tenant_id", "trip_id"], {
      unique: true,
      name: "account_documents_tenant_trip_uidx",
    });
    await queryInterface.removeColumn("account_documents", "carta_porte_id");

    await queryInterface.sequelize.query(`
      DELETE c FROM cartas_porte c
      INNER JOIN (
        SELECT trip_id, MIN(created_at) AS min_created
        FROM cartas_porte
        GROUP BY trip_id
      ) keep ON keep.trip_id = c.trip_id
      WHERE c.created_at > keep.min_created
         OR (c.created_at = keep.min_created AND c.id NOT IN (
           SELECT id FROM (
             SELECT MIN(id) AS id
             FROM cartas_porte
             GROUP BY trip_id, created_at
           ) oldest_ids
         ))
    `);
    await queryInterface.removeColumn("cartas_porte", "cfdi_conceptos");
    await queryInterface.removeIndex("cartas_porte", "cartas_porte_tenant_trip_idx");
    await queryInterface.addIndex("cartas_porte", ["trip_id"], {
      unique: true,
      name: "cartas_porte_trip_unique",
    });
  },
};
