"use strict";

/**
 * Un cliente tiene un solo CP activo. Otro cliente del mismo tenant puede repetir ese CP.
 * Las filas inactivas conservan el CP: la unicidad vive en cp_activo, que queda NULL si no está activa.
 *
 * Antes del índice se fusionan las activas repetidas (la más completa sobrevive; viajes y rutas
 * apuntan a esa fila; el tipo se ensancha a Ambos si había Origen y Destino).
 */

const FILLABLE = [
  "calle",
  "numero_exterior",
  "numero_interior",
  "colonia",
  "colonia_clave",
  "localidad",
  "localidad_clave",
  "municipio",
  "municipio_clave",
  "estado",
  "pais",
  "rfc",
  "razon_social",
];

function blank(value) {
  return String(value ?? "").trim();
}

function cpKey(value) {
  const digits = blank(value).replace(/\D/g, "");
  return digits.length === 5 ? digits : "";
}

function richness(row) {
  return FILLABLE.reduce((score, key) => score + (blank(row[key]) ? 1 : 0), 0);
}

function widenTipo(existing, incoming) {
  const a = blank(existing);
  const b = blank(incoming);
  if (!a && !b) return "Ambos";
  if (!a) return b;
  if (!b) return a;
  if (a === b) return a;
  return "Ambos";
}

async function mergeActiveDuplicates(queryInterface, transaction) {
  const [rows] = await queryInterface.sequelize.query(
    `SELECT id, tenant_id, client_id, tipo, calle, numero_exterior, numero_interior,
            colonia, colonia_clave, localidad, localidad_clave, municipio, municipio_clave,
            estado, pais, rfc, razon_social, cp, created_at
     FROM client_ubicaciones
     WHERE estatus = 'activo'`,
    { transaction },
  );

  const buckets = new Map();
  for (const row of rows) {
    const cp = cpKey(row.cp);
    if (!cp || !row.client_id) continue;
    const key = `${row.tenant_id}\0${String(row.client_id).trim()}\0${cp}`;
    const list = buckets.get(key) ?? [];
    list.push(row);
    buckets.set(key, list);
  }

  for (const members of buckets.values()) {
    if (members.length < 2) continue;
    const ranked = [...members].sort((a, b) => {
      const score = richness(b) - richness(a);
      if (score !== 0) return score;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });
    const survivor = ranked[0];
    const duplicates = ranked.slice(1);
    const patch = {};
    for (const key of FILLABLE) {
      if (!blank(survivor[key])) {
        const donor = duplicates.find((row) => blank(row[key]));
        if (donor) patch[key] = donor[key];
      }
    }
    const tipo = duplicates.reduce((acc, row) => widenTipo(acc, row.tipo), blank(survivor.tipo) || undefined);
    if (tipo && tipo !== blank(survivor.tipo)) patch.tipo = tipo;
    if (Object.keys(patch).length > 0) {
      await queryInterface.bulkUpdate("client_ubicaciones", patch, { id: survivor.id }, { transaction });
    }
    for (const dup of duplicates) {
      for (const table of ["trip_ubicaciones", "trip_stops", "route_stops"]) {
        await queryInterface.sequelize.query(
          `UPDATE \`${table}\` SET client_ubicacion_id = :survivor WHERE client_ubicacion_id = :dup`,
          { replacements: { survivor: survivor.id, dup: dup.id }, transaction },
        );
      }
      await queryInterface.bulkUpdate(
        "client_ubicaciones",
        { estatus: "inactivo" },
        { id: dup.id },
        { transaction },
      );
    }
  }
}

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    const dialect = queryInterface.sequelize.getDialect();
    if (dialect !== "mysql" && dialect !== "mariadb") {
      throw new Error(`CP único por cliente solo está definido para MySQL (dialecto: ${dialect})`);
    }

    await queryInterface.sequelize.transaction(async (transaction) => {
      await mergeActiveDuplicates(queryInterface, transaction);
    });

    const [columns] = await queryInterface.sequelize.query(
      "SHOW COLUMNS FROM client_ubicaciones LIKE 'cp_activo'",
    );
    if (!columns.length) {
      await queryInterface.sequelize.query(`
        ALTER TABLE client_ubicaciones
        ADD COLUMN cp_activo VARCHAR(5)
        GENERATED ALWAYS AS (
          CASE
            WHEN estatus = 'activo' AND cp REGEXP '^[0-9]{5}$' THEN cp
            ELSE NULL
          END
        ) STORED
      `);
    }

    const [indexes] = await queryInterface.sequelize.query(
      "SHOW INDEX FROM client_ubicaciones WHERE Key_name = 'client_ubicaciones_client_cp_activo'",
    );
    if (!indexes.length) {
      await queryInterface.addIndex("client_ubicaciones", ["tenant_id", "client_id", "cp_activo"], {
        name: "client_ubicaciones_client_cp_activo",
        unique: true,
      });
    }
  },

  async down(queryInterface) {
    await queryInterface.removeIndex("client_ubicaciones", "client_ubicaciones_client_cp_activo");
    await queryInterface.removeColumn("client_ubicaciones", "cp_activo");
  },
};
