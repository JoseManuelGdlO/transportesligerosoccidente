"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("fuel_tickets", "prorrateo_confirmado_at", {
      type: Sequelize.DATE,
      allowNull: true,
    });

    await queryInterface.addColumn("fuel_proration_assignments", "km_recorridos", {
      type: Sequelize.DECIMAL(12, 2),
      allowNull: true,
    });
    await queryInterface.addColumn("fuel_proration_assignments", "litros_asignados", {
      type: Sequelize.DECIMAL(12, 2),
      allowNull: true,
    });
    await queryInterface.addColumn("fuel_proration_assignments", "costo_asignado", {
      type: Sequelize.DECIMAL(12, 2),
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("fuel_proration_assignments", "costo_asignado");
    await queryInterface.removeColumn("fuel_proration_assignments", "litros_asignados");
    await queryInterface.removeColumn("fuel_proration_assignments", "km_recorridos");
    await queryInterface.removeColumn("fuel_tickets", "prorrateo_confirmado_at");
  },
};
