"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("maintenance_categories", {
      id: { type: Sequelize.CHAR(36), primaryKey: true },
      tenant_id: { type: Sequelize.CHAR(36), allowNull: false },
      nombre: { type: Sequelize.STRING(120), allowNull: false },
      descripcion: { type: Sequelize.STRING(255), allowNull: true },
      estatus: {
        type: Sequelize.ENUM("activo", "inactivo"),
        allowNull: false,
        defaultValue: "activo",
      },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false },
    });

    await queryInterface.addIndex("maintenance_categories", ["tenant_id", "nombre"], {
      unique: true,
      name: "maintenance_categories_tenant_nombre_uq",
    });

    await queryInterface.addConstraint("maintenance_categories", {
      fields: ["tenant_id"],
      type: "foreign key",
      name: "maintenance_categories_tenant_fk",
      references: { table: "tenants", field: "id" },
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });

    await queryInterface.addColumn("maintenance_records", "category_id", {
      type: Sequelize.CHAR(36),
      allowNull: true,
    });

    await queryInterface.addConstraint("maintenance_records", {
      fields: ["category_id"],
      type: "foreign key",
      name: "maintenance_records_category_id_fk",
      references: { table: "maintenance_categories", field: "id" },
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });
  },

  async down(queryInterface) {
    await queryInterface.removeConstraint("maintenance_records", "maintenance_records_category_id_fk");
    await queryInterface.removeColumn("maintenance_records", "category_id");
    await queryInterface.removeConstraint("maintenance_categories", "maintenance_categories_tenant_fk");
    await queryInterface.dropTable("maintenance_categories");
  },
};
