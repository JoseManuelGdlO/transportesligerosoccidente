"use strict";

const { randomUUID } = require("node:crypto");

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const now = new Date();

    await queryInterface.createTable("trip_statuses", {
      id: { type: Sequelize.CHAR(36), primaryKey: true },
      tenant_id: {
        type: Sequelize.CHAR(36),
        allowNull: false,
        references: { model: "tenants", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "RESTRICT",
      },
      nombre: { type: Sequelize.STRING(255), allowNull: false },
      color: { type: Sequelize.STRING(16), allowNull: false, defaultValue: "#6366f1" },
      slug: { type: Sequelize.STRING(32), allowNull: true },
      is_system: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      activo: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex("trip_statuses", ["tenant_id"], { name: "trip_statuses_tenant_id_idx" });
    await queryInterface.addIndex("trip_statuses", ["tenant_id", "slug"], {
      name: "trip_statuses_tenant_slug_idx",
      unique: true,
    });

    await queryInterface.createTable("trip_status_assignments", {
      trip_id: {
        type: Sequelize.CHAR(36),
        primaryKey: true,
        references: { model: "trips", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      trip_status_id: {
        type: Sequelize.CHAR(36),
        primaryKey: true,
        references: { model: "trip_statuses", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex("trip_status_assignments", ["trip_status_id"], {
      name: "trip_status_assignments_status_id_idx",
    });

    const [tenants] = await queryInterface.sequelize.query(`SELECT id FROM tenants`);
    const statusByTenant = new Map();

    for (const row of tenants) {
      const tenantId = row.id;
      const enCursoId = randomUUID();
      const cerradoId = randomUUID();
      statusByTenant.set(tenantId, { en_curso: enCursoId, cerrado: cerradoId });

      await queryInterface.bulkInsert("trip_statuses", [
        {
          id: enCursoId,
          tenant_id: tenantId,
          nombre: "En curso",
          color: "#6366f1",
          slug: "en_curso",
          is_system: true,
          activo: true,
          created_at: now,
          updated_at: now,
        },
        {
          id: cerradoId,
          tenant_id: tenantId,
          nombre: "Cerrado",
          color: "#22c55e",
          slug: "cerrado",
          is_system: true,
          activo: true,
          created_at: now,
          updated_at: now,
        },
      ]);
    }

    const [trips] = await queryInterface.sequelize.query(
      `SELECT id, tenant_id, estatus FROM trips`,
    );
    const assignments = [];
    for (const trip of trips) {
      const ids = statusByTenant.get(trip.tenant_id);
      if (!ids) continue;
      const statusId = trip.estatus === "cerrado" ? ids.cerrado : ids.en_curso;
      assignments.push({
        trip_id: trip.id,
        trip_status_id: statusId,
        created_at: now,
        updated_at: now,
      });
    }
    if (assignments.length > 0) {
      await queryInterface.bulkInsert("trip_status_assignments", assignments);
    }

    try {
      await queryInterface.removeIndex("trips", "trips_estatus_idx");
    } catch {
      /* index may not exist */
    }
    await queryInterface.removeColumn("trips", "estatus");
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.addColumn("trips", "estatus", {
      type: Sequelize.ENUM("en_curso", "cerrado"),
      allowNull: false,
      defaultValue: "en_curso",
    });

    const [assignments] = await queryInterface.sequelize.query(`
      SELECT tsa.trip_id, ts.slug
      FROM trip_status_assignments tsa
      INNER JOIN trip_statuses ts ON ts.id = tsa.trip_status_id
      WHERE ts.slug IN ('en_curso', 'cerrado')
    `);
    const closedTrips = new Set();
    for (const row of assignments) {
      if (row.slug === "cerrado") closedTrips.add(row.trip_id);
    }
    for (const tripId of closedTrips) {
      await queryInterface.sequelize.query(`UPDATE trips SET estatus = 'cerrado' WHERE id = :id`, {
        replacements: { id: tripId },
      });
    }

    await queryInterface.addIndex("trips", ["estatus"], { name: "trips_estatus_idx" });
    await queryInterface.dropTable("trip_status_assignments");
    await queryInterface.dropTable("trip_statuses");
  },
};
