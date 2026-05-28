"use strict";

const { randomUUID } = require("node:crypto");

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("routes", {
      id: { type: Sequelize.CHAR(36), primaryKey: true },
      tenant_id: { type: Sequelize.CHAR(36), allowNull: false },
      client_id: {
        type: Sequelize.CHAR(36),
        allowNull: true,
        references: { model: "clients", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      nombre: { type: Sequelize.STRING(255), allowNull: false },
      tipo_viaje: { type: Sequelize.ENUM("local", "foraneo"), allowNull: true },
      estatus: { type: Sequelize.ENUM("activo", "inactivo"), allowNull: false, defaultValue: "activo" },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex("routes", ["tenant_id", "estatus"], { name: "routes_tenant_estatus_idx" });
    await queryInterface.addIndex("routes", ["client_id"], { name: "routes_client_id_idx" });

    await queryInterface.createTable("route_stops", {
      id: { type: Sequelize.CHAR(36), primaryKey: true },
      route_id: {
        type: Sequelize.CHAR(36),
        allowNull: false,
        references: { model: "routes", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      orden: { type: Sequelize.INTEGER, allowNull: false },
      etiqueta: { type: Sequelize.STRING(255), allowNull: false },
      client_ubicacion_id: { type: Sequelize.CHAR(36), allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex("route_stops", ["route_id", "orden"], {
      unique: true,
      name: "route_stops_route_orden",
    });

    await queryInterface.addColumn("trips", "route_id", {
      type: Sequelize.CHAR(36),
      allowNull: true,
      references: { model: "routes", key: "id" },
      onUpdate: "CASCADE",
      onDelete: "SET NULL",
    });

    await queryInterface.createTable("trip_stops", {
      id: { type: Sequelize.CHAR(36), primaryKey: true },
      tenant_id: { type: Sequelize.CHAR(36), allowNull: false },
      trip_id: {
        type: Sequelize.CHAR(36),
        allowNull: false,
        references: { model: "trips", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      orden: { type: Sequelize.INTEGER, allowNull: false },
      etiqueta: { type: Sequelize.STRING(255), allowNull: false },
      client_ubicacion_id: { type: Sequelize.CHAR(36), allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex("trip_stops", ["trip_id", "orden"], {
      unique: true,
      name: "trip_stops_trip_orden",
    });

    await queryInterface.addColumn("trip_ubicaciones", "orden", {
      type: Sequelize.INTEGER,
      allowNull: true,
    });

    const [ubicRows] = await queryInterface.sequelize.query(
      `SELECT id, trip_id, tipo FROM trip_ubicaciones ORDER BY trip_id, tipo`,
    );
    for (const row of ubicRows) {
      const orden = row.tipo === "Origen" ? 1 : 2;
      await queryInterface.sequelize.query(
        `UPDATE trip_ubicaciones SET orden = :orden WHERE id = :id`,
        { replacements: { orden, id: row.id } },
      );
    }

    await queryInterface.removeIndex("trip_ubicaciones", "trip_ubicaciones_trip_tipo");
    await queryInterface.changeColumn("trip_ubicaciones", "orden", {
      type: Sequelize.INTEGER,
      allowNull: false,
    });
    await queryInterface.addIndex("trip_ubicaciones", ["trip_id", "orden"], {
      unique: true,
      name: "trip_ubicaciones_trip_orden",
    });

    const [trips] = await queryInterface.sequelize.query(
      `SELECT id, tenant_id, origen, destino FROM trips`,
    );
    const now = new Date();
    for (const trip of trips) {
      const stops = [
        { orden: 1, etiqueta: trip.origen },
        { orden: 2, etiqueta: trip.destino },
      ];
      for (const s of stops) {
        await queryInterface.bulkInsert("trip_stops", [
          {
            id: randomUUID(),
            tenant_id: trip.tenant_id,
            trip_id: trip.id,
            orden: s.orden,
            etiqueta: s.etiqueta,
            client_ubicacion_id: null,
            created_at: now,
            updated_at: now,
          },
        ]);
      }
    }
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeIndex("trip_ubicaciones", "trip_ubicaciones_trip_orden");
    await queryInterface.addIndex("trip_ubicaciones", ["trip_id", "tipo"], {
      unique: true,
      name: "trip_ubicaciones_trip_tipo",
    });
    await queryInterface.removeColumn("trip_ubicaciones", "orden");
    await queryInterface.dropTable("trip_stops");
    await queryInterface.removeColumn("trips", "route_id");
    await queryInterface.dropTable("route_stops");
    await queryInterface.dropTable("routes");
  },
};
