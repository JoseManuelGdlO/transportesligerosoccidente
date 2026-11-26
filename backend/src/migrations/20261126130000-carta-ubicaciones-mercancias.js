"use strict";

/**
 * Ubicaciones y mercancías dejan de ser del viaje y pasan a ser de cada carta porte.
 * La factura timbrada conserva su copia. Una factura nueva recibe un duplicado editable.
 */

const UBIC_COLS = [
  "orden",
  "tipo",
  "rfc",
  "nombre",
  "fecha_hora",
  "calle",
  "colonia",
  "colonia_clave",
  "municipio",
  "municipio_clave",
  "localidad",
  "localidad_clave",
  "estado",
  "cp",
  "numero_exterior",
  "numero_interior",
  "pais",
  "id_ubicacion_sat",
  "client_ubicacion_id",
  "distancia_km",
];

const MERC_COLS = [
  "descripcion",
  "cantidad",
  "unidad",
  "peso_kg",
  "clave_prod_serv",
  "material_peligroso",
  "embalaje",
  "cantidad_transportada",
];

async function indexExists(queryInterface, table, name) {
  const [rows] = await queryInterface.sequelize.query(
    `SHOW INDEX FROM \`${table}\` WHERE Key_name = :name`,
    { replacements: { name } },
  );
  return Array.isArray(rows) && rows.length > 0;
}

async function copyFiscal(queryInterface, table, cols, sourceId, targetId) {
  const colList = cols.map((c) => `\`${c}\``).join(", ");
  await queryInterface.sequelize.query(
    `INSERT INTO \`${table}\` (id, tenant_id, trip_id, carta_porte_id, ${colList}, created_at, updated_at)
     SELECT UUID(), tenant_id, trip_id, :targetId, ${colList}, NOW(), NOW()
     FROM \`${table}\`
     WHERE carta_porte_id = :sourceId`,
    { replacements: { sourceId, targetId } },
  );
}

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("trip_ubicaciones", "carta_porte_id", {
      type: Sequelize.CHAR(36),
      allowNull: true,
    });
    await queryInterface.addColumn("trip_mercancias", "carta_porte_id", {
      type: Sequelize.CHAR(36),
      allowNull: true,
    });

    if (await indexExists(queryInterface, "trip_ubicaciones", "trip_ubicaciones_trip_orden")) {
      await queryInterface.removeIndex("trip_ubicaciones", "trip_ubicaciones_trip_orden");
    }

    const [trips] = await queryInterface.sequelize.query(`
      SELECT DISTINCT trip_id, tenant_id FROM cartas_porte
    `);
    for (const trip of trips) {
      const [cartas] = await queryInterface.sequelize.query(
        `SELECT id FROM cartas_porte
         WHERE trip_id = :tripId AND tenant_id = :tenantId
         ORDER BY created_at ASC, id ASC`,
        { replacements: { tripId: trip.trip_id, tenantId: trip.tenant_id } },
      );
      if (!Array.isArray(cartas) || cartas.length === 0) continue;
      const firstId = cartas[0].id;
      await queryInterface.sequelize.query(
        `UPDATE trip_ubicaciones
         SET carta_porte_id = :firstId
         WHERE trip_id = :tripId AND tenant_id = :tenantId AND carta_porte_id IS NULL`,
        { replacements: { firstId, tripId: trip.trip_id, tenantId: trip.tenant_id } },
      );
      await queryInterface.sequelize.query(
        `UPDATE trip_mercancias
         SET carta_porte_id = :firstId
         WHERE trip_id = :tripId AND tenant_id = :tenantId AND carta_porte_id IS NULL`,
        { replacements: { firstId, tripId: trip.trip_id, tenantId: trip.tenant_id } },
      );
      for (const carta of cartas.slice(1)) {
        const [ubicCount] = await queryInterface.sequelize.query(
          `SELECT COUNT(*) AS n FROM trip_ubicaciones WHERE carta_porte_id = :id`,
          { replacements: { id: carta.id } },
        );
        if (Number(ubicCount[0]?.n ?? 0) === 0) {
          await copyFiscal(queryInterface, "trip_ubicaciones", UBIC_COLS, firstId, carta.id);
        }
        const [mercCount] = await queryInterface.sequelize.query(
          `SELECT COUNT(*) AS n FROM trip_mercancias WHERE carta_porte_id = :id`,
          { replacements: { id: carta.id } },
        );
        if (Number(mercCount[0]?.n ?? 0) === 0) {
          await copyFiscal(queryInterface, "trip_mercancias", MERC_COLS, firstId, carta.id);
        }
      }
    }

    await queryInterface.addIndex("trip_ubicaciones", ["carta_porte_id", "orden"], {
      unique: true,
      name: "trip_ubicaciones_carta_orden",
    });
    await queryInterface.addIndex("trip_mercancias", ["carta_porte_id"], {
      name: "trip_mercancias_carta_idx",
    });
  },

  async down(queryInterface) {
    if (await indexExists(queryInterface, "trip_ubicaciones", "trip_ubicaciones_carta_orden")) {
      await queryInterface.removeIndex("trip_ubicaciones", "trip_ubicaciones_carta_orden");
    }
    if (await indexExists(queryInterface, "trip_mercancias", "trip_mercancias_carta_idx")) {
      await queryInterface.removeIndex("trip_mercancias", "trip_mercancias_carta_idx");
    }

    await queryInterface.sequelize.query(`
      DELETE extra
      FROM trip_ubicaciones extra
      INNER JOIN trip_ubicaciones keep
        ON keep.trip_id = extra.trip_id
       AND keep.orden = extra.orden
       AND keep.created_at < extra.created_at
    `);
    await queryInterface.sequelize.query(`
      DELETE m
      FROM trip_mercancias m
      INNER JOIN cartas_porte c ON c.id = m.carta_porte_id
      INNER JOIN cartas_porte older
        ON older.trip_id = c.trip_id
       AND older.tenant_id = c.tenant_id
       AND (older.created_at < c.created_at OR (older.created_at = c.created_at AND older.id < c.id))
    `);

    await queryInterface.removeColumn("trip_ubicaciones", "carta_porte_id");
    await queryInterface.removeColumn("trip_mercancias", "carta_porte_id");
    await queryInterface.addIndex("trip_ubicaciones", ["trip_id", "orden"], {
      unique: true,
      name: "trip_ubicaciones_trip_orden",
    });
  },
};
