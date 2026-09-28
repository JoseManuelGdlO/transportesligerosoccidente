"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();
    const names = tables.map((t) => String(typeof t === "string" ? t : t.tableName || t).toLowerCase());
    if (!names.includes("truck_odometer_resets")) {
      await queryInterface.createTable("truck_odometer_resets", {
        id: { type: Sequelize.CHAR(36), primaryKey: true },
        tenant_id: { type: Sequelize.CHAR(36), allowNull: false },
        truck_id: { type: Sequelize.CHAR(36), allowNull: false },
        effective_at: { type: Sequelize.DATE, allowNull: false },
        old_km: { type: Sequelize.INTEGER, allowNull: false },
        new_km: { type: Sequelize.INTEGER, allowNull: false },
        motivo: { type: Sequelize.STRING(512), allowNull: false },
        created_by_user_id: { type: Sequelize.CHAR(36), allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false },
        updated_at: { type: Sequelize.DATE, allowNull: false },
      });
    }
    const indexes = await queryInterface.showIndex("truck_odometer_resets");
    const hasIndex = indexes.some((idx) => idx.name === "truck_odometer_resets_tenant_truck_effective");
    if (!hasIndex) {
      await queryInterface.addIndex("truck_odometer_resets", ["tenant_id", "truck_id", "effective_at"], {
        name: "truck_odometer_resets_tenant_truck_effective",
      });
    }
  },

  async down(queryInterface) {
    await queryInterface.dropTable("truck_odometer_resets");
  },
};
