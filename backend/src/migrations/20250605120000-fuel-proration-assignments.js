"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const now = new Date();

    await queryInterface.createTable("fuel_proration_assignments", {
      tenant_id: {
        type: Sequelize.CHAR(36),
        allowNull: false,
        references: { model: "tenants", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      trip_id: {
        type: Sequelize.CHAR(36),
        primaryKey: true,
        references: { model: "trips", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      fuel_ticket_id: {
        type: Sequelize.CHAR(36),
        allowNull: false,
        references: { model: "fuel_tickets", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: now },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: now },
    });

    await queryInterface.addIndex("fuel_proration_assignments", ["tenant_id", "trip_id"], {
      name: "fuel_proration_assignments_tenant_trip_unique",
      unique: true,
    });
    await queryInterface.addIndex("fuel_proration_assignments", ["tenant_id", "fuel_ticket_id"], {
      name: "fuel_proration_assignments_tenant_ticket_idx",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("fuel_proration_assignments");
  },
};
