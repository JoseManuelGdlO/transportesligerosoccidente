"use strict";

const ADMIN_ROLE_ID = "20000000-0000-4000-8000-000000000001";

const PERMS = [
  { id: "10000000-0000-4000-8000-000000000030", slug: "cuentas.ver" },
  { id: "10000000-0000-4000-8000-000000000031", slug: "cuentas.gestionar" },
  { id: "10000000-0000-4000-8000-000000000032", slug: "proveedores.ver" },
  { id: "10000000-0000-4000-8000-000000000033", slug: "proveedores.gestionar" },
];

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const now = new Date();

    await queryInterface.createTable("suppliers", {
      id: { type: Sequelize.CHAR(36), primaryKey: true },
      tenant_id: { type: Sequelize.CHAR(36), allowNull: false },
      razon_social: { type: Sequelize.STRING(255), allowNull: false },
      rfc: { type: Sequelize.STRING(32), allowNull: true },
      contacto: { type: Sequelize.STRING(255), allowNull: true },
      telefono: { type: Sequelize.STRING(64), allowNull: true },
      email: { type: Sequelize.STRING(255), allowNull: true },
      dias_credito: { type: Sequelize.INTEGER, allowNull: true },
      estatus: {
        type: Sequelize.ENUM("activo", "inactivo"),
        allowNull: false,
        defaultValue: "activo",
      },
      observaciones: { type: Sequelize.TEXT, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex("suppliers", ["tenant_id", "razon_social"], {
      name: "suppliers_tenant_razon_idx",
    });
    await queryInterface.addIndex("suppliers", ["tenant_id", "estatus"], {
      name: "suppliers_tenant_status_idx",
    });

    await queryInterface.addColumn("clients", "dias_credito", {
      type: Sequelize.INTEGER,
      allowNull: true,
    });

    await queryInterface.addColumn("fuel_tickets", "supplier_id", {
      type: Sequelize.CHAR(36),
      allowNull: true,
    });
    await queryInterface.addConstraint("fuel_tickets", {
      fields: ["supplier_id"],
      type: "foreign key",
      name: "fuel_tickets_supplier_fk",
      references: { table: "suppliers", field: "id" },
      onDelete: "SET NULL",
      onUpdate: "CASCADE",
    });

    await queryInterface.addColumn("maintenance_records", "supplier_id", {
      type: Sequelize.CHAR(36),
      allowNull: true,
    });
    await queryInterface.addConstraint("maintenance_records", {
      fields: ["supplier_id"],
      type: "foreign key",
      name: "maintenance_records_supplier_fk",
      references: { table: "suppliers", field: "id" },
      onDelete: "SET NULL",
      onUpdate: "CASCADE",
    });

    await queryInterface.addColumn("expenses", "supplier_id", {
      type: Sequelize.CHAR(36),
      allowNull: true,
    });
    await queryInterface.addConstraint("expenses", {
      fields: ["supplier_id"],
      type: "foreign key",
      name: "expenses_supplier_fk",
      references: { table: "suppliers", field: "id" },
      onDelete: "SET NULL",
      onUpdate: "CASCADE",
    });

    await queryInterface.createTable("account_documents", {
      id: { type: Sequelize.CHAR(36), primaryKey: true },
      tenant_id: { type: Sequelize.CHAR(36), allowNull: false },
      tipo: {
        type: Sequelize.ENUM("cxc", "cxp"),
        allowNull: false,
      },
      client_id: { type: Sequelize.CHAR(36), allowNull: true },
      supplier_id: { type: Sequelize.CHAR(36), allowNull: true },
      entidad_nombre: { type: Sequelize.STRING(255), allowNull: false },
      folio: { type: Sequelize.STRING(64), allowNull: false },
      concepto: { type: Sequelize.STRING(512), allowNull: false },
      fecha_emision: { type: Sequelize.DATEONLY, allowNull: false },
      plazo_credito_dias: { type: Sequelize.INTEGER, allowNull: true },
      fecha_vencimiento: { type: Sequelize.DATEONLY, allowNull: true },
      monto_original: { type: Sequelize.DECIMAL(14, 2), allowNull: false },
      estatus: {
        type: Sequelize.ENUM("abierta", "pagada", "cancelada"),
        allowNull: false,
        defaultValue: "abierta",
      },
      origen: {
        type: Sequelize.ENUM("manual", "viaje", "combustible", "mantenimiento", "gasto"),
        allowNull: false,
        defaultValue: "manual",
      },
      trip_id: { type: Sequelize.CHAR(36), allowNull: true },
      fuel_ticket_id: { type: Sequelize.CHAR(36), allowNull: true },
      fuel_load_id: { type: Sequelize.CHAR(36), allowNull: true },
      maintenance_record_id: { type: Sequelize.CHAR(36), allowNull: true },
      expense_id: { type: Sequelize.CHAR(36), allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false },
    });

    await queryInterface.addIndex("account_documents", ["tenant_id", "tipo", "estatus"], {
      name: "account_documents_tenant_tipo_estatus_idx",
    });
    await queryInterface.addIndex("account_documents", ["tenant_id", "fecha_vencimiento"], {
      name: "account_documents_tenant_vencimiento_idx",
    });
    await queryInterface.addIndex("account_documents", ["tenant_id", "folio"], {
      name: "account_documents_tenant_folio_idx",
    });
    await queryInterface.addIndex("account_documents", ["tenant_id", "trip_id"], {
      unique: true,
      name: "account_documents_tenant_trip_uidx",
    });
    await queryInterface.addIndex("account_documents", ["tenant_id", "fuel_ticket_id"], {
      unique: true,
      name: "account_documents_tenant_fuel_ticket_uidx",
    });
    await queryInterface.addIndex("account_documents", ["tenant_id", "fuel_load_id"], {
      unique: true,
      name: "account_documents_tenant_fuel_load_uidx",
    });
    await queryInterface.addIndex("account_documents", ["tenant_id", "maintenance_record_id"], {
      unique: true,
      name: "account_documents_tenant_maint_uidx",
    });
    await queryInterface.addIndex("account_documents", ["tenant_id", "expense_id"], {
      unique: true,
      name: "account_documents_tenant_expense_uidx",
    });

    await queryInterface.addConstraint("account_documents", {
      fields: ["client_id"],
      type: "foreign key",
      name: "account_documents_client_fk",
      references: { table: "clients", field: "id" },
      onDelete: "SET NULL",
      onUpdate: "CASCADE",
    });
    await queryInterface.addConstraint("account_documents", {
      fields: ["supplier_id"],
      type: "foreign key",
      name: "account_documents_supplier_fk",
      references: { table: "suppliers", field: "id" },
      onDelete: "SET NULL",
      onUpdate: "CASCADE",
    });
    await queryInterface.addConstraint("account_documents", {
      fields: ["trip_id"],
      type: "foreign key",
      name: "account_documents_trip_fk",
      references: { table: "trips", field: "id" },
      onDelete: "SET NULL",
      onUpdate: "CASCADE",
    });
    await queryInterface.addConstraint("account_documents", {
      fields: ["fuel_ticket_id"],
      type: "foreign key",
      name: "account_documents_fuel_ticket_fk",
      references: { table: "fuel_tickets", field: "id" },
      onDelete: "SET NULL",
      onUpdate: "CASCADE",
    });
    await queryInterface.addConstraint("account_documents", {
      fields: ["fuel_load_id"],
      type: "foreign key",
      name: "account_documents_fuel_load_fk",
      references: { table: "fuel_loads", field: "id" },
      onDelete: "SET NULL",
      onUpdate: "CASCADE",
    });
    await queryInterface.addConstraint("account_documents", {
      fields: ["maintenance_record_id"],
      type: "foreign key",
      name: "account_documents_maint_fk",
      references: { table: "maintenance_records", field: "id" },
      onDelete: "SET NULL",
      onUpdate: "CASCADE",
    });
    await queryInterface.addConstraint("account_documents", {
      fields: ["expense_id"],
      type: "foreign key",
      name: "account_documents_expense_fk",
      references: { table: "expenses", field: "id" },
      onDelete: "SET NULL",
      onUpdate: "CASCADE",
    });

    await queryInterface.createTable("account_document_payments", {
      id: { type: Sequelize.CHAR(36), primaryKey: true },
      tenant_id: { type: Sequelize.CHAR(36), allowNull: false },
      document_id: { type: Sequelize.CHAR(36), allowNull: false },
      monto: { type: Sequelize.DECIMAL(14, 2), allowNull: false },
      fecha: { type: Sequelize.DATEONLY, allowNull: false },
      nota: { type: Sequelize.STRING(512), allowNull: true },
      created_by: { type: Sequelize.CHAR(36), allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex("account_document_payments", ["document_id"], {
      name: "account_document_payments_doc_idx",
    });
    await queryInterface.addConstraint("account_document_payments", {
      fields: ["document_id"],
      type: "foreign key",
      name: "account_document_payments_doc_fk",
      references: { table: "account_documents", field: "id" },
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });

    for (const perm of PERMS) {
      await queryInterface.sequelize.query(
        "INSERT IGNORE INTO `permissions` (`id`, `slug`, `created_at`, `updated_at`) VALUES (:id, :slug, :c, :u)",
        { replacements: { id: perm.id, slug: perm.slug, c: now, u: now } },
      );
    }
    for (const roleId of [ADMIN_ROLE_ID]) {
      for (const perm of PERMS) {
        await queryInterface.sequelize.query(
          "INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`, `created_at`, `updated_at`) VALUES (:rid, :pid, :c, :u)",
          { replacements: { rid: roleId, pid: perm.id, c: now, u: now } },
        );
      }
    }
  },

  async down(queryInterface) {
    const ids = PERMS.map((p) => p.id);
    await queryInterface.bulkDelete("role_permissions", { permission_id: ids });
    await queryInterface.bulkDelete("permissions", { id: ids });

    await queryInterface.dropTable("account_document_payments");
    await queryInterface.dropTable("account_documents");

    await queryInterface.removeConstraint("expenses", "expenses_supplier_fk");
    await queryInterface.removeColumn("expenses", "supplier_id");
    await queryInterface.removeConstraint("maintenance_records", "maintenance_records_supplier_fk");
    await queryInterface.removeColumn("maintenance_records", "supplier_id");
    await queryInterface.removeConstraint("fuel_tickets", "fuel_tickets_supplier_fk");
    await queryInterface.removeColumn("fuel_tickets", "supplier_id");
    await queryInterface.removeColumn("clients", "dias_credito");
    await queryInterface.dropTable("suppliers");
  },
};
