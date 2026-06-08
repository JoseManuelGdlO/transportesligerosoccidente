"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("fuel_loads", "fuel_ticket_id", {
      type: Sequelize.CHAR(36),
      allowNull: true,
      references: { model: "fuel_tickets", key: "id" },
      onUpdate: "CASCADE",
      onDelete: "SET NULL",
    });

    await queryInterface.addIndex("fuel_loads", ["tenant_id", "trip_id", "fuel_ticket_id"], {
      name: "fuel_loads_tenant_trip_ticket_unique",
      unique: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex("fuel_loads", "fuel_loads_tenant_trip_ticket_unique");
    await queryInterface.removeColumn("fuel_loads", "fuel_ticket_id");
  },
};
