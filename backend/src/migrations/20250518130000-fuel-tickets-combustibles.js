"use strict";

const COMBUSTIBLES_PERMS = [
  { id: "10000000-0000-4000-8000-000000000020", slug: "combustibles.ver" },
  { id: "10000000-0000-4000-8000-000000000021", slug: "combustibles.crear" },
  { id: "10000000-0000-4000-8000-000000000022", slug: "combustibles.importar" },
  { id: "10000000-0000-4000-8000-000000000023", slug: "combustibles.eliminar" },
];

const ADMIN_ROLE_ID = "20000000-0000-4000-8000-000000000001";
const CAPTURISTA_ROLE_ID = "20000000-0000-4000-8000-000000000002";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const now = new Date();

    await queryInterface.addColumn("trucks", "folio_tag", {
      type: Sequelize.STRING(64),
      allowNull: true,
    });
    await queryInterface.addIndex("trucks", ["tenant_id", "folio_tag"], {
      name: "trucks_tenant_folio_tag_idx",
    });

    await queryInterface.createTable("fuel_tickets", {
      id: { type: Sequelize.CHAR(36), primaryKey: true },
      tenant_id: {
        type: Sequelize.CHAR(36),
        allowNull: false,
        references: { model: "tenants", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      truck_id: {
        type: Sequelize.CHAR(36),
        allowNull: false,
        references: { model: "trucks", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "RESTRICT",
      },
      fecha: { type: Sequelize.DATEONLY, allowNull: false },
      hora: { type: Sequelize.TIME, allowNull: true },
      folio_tag: { type: Sequelize.STRING(64), allowNull: true },
      numero_economico_raw: { type: Sequelize.STRING(64), allowNull: true },
      placas_raw: { type: Sequelize.STRING(32), allowNull: true },
      odometro: { type: Sequelize.INTEGER, allowNull: false },
      litros: { type: Sequelize.DECIMAL(12, 2), allowNull: false },
      precio_litro: { type: Sequelize.DECIMAL(12, 4), allowNull: false },
      importe_total: { type: Sequelize.DECIMAL(12, 2), allowNull: false },
      ubicacion: { type: Sequelize.STRING(255), allowNull: false, defaultValue: "Gasolinera" },
      origen: {
        type: Sequelize.ENUM("manual", "import_excel", "api"),
        allowNull: false,
        defaultValue: "manual",
      },
      external_id: { type: Sequelize.STRING(128), allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false },
    });

    await queryInterface.addIndex("fuel_tickets", ["tenant_id", "truck_id", "fecha", "odometro", "litros"], {
      name: "fuel_tickets_dedup_idx",
      unique: true,
    });
    await queryInterface.addIndex("fuel_tickets", ["tenant_id", "truck_id", "fecha"], {
      name: "fuel_tickets_truck_fecha_idx",
    });

    const dialect = queryInterface.sequelize.getDialect();
    for (const p of COMBUSTIBLES_PERMS) {
      if (dialect === "mysql" || dialect === "mariadb") {
        await queryInterface.sequelize.query(
          "INSERT IGNORE INTO `permissions` (`id`, `slug`, `created_at`, `updated_at`) VALUES (:id, :slug, :c, :u)",
          { replacements: { id: p.id, slug: p.slug, c: now, u: now } },
        );
      } else {
        await queryInterface.bulkInsert("permissions", [
          { id: p.id, slug: p.slug, created_at: now, updated_at: now },
        ]);
      }
    }

    for (const p of COMBUSTIBLES_PERMS) {
      await queryInterface.sequelize.query(
        "INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`, `created_at`, `updated_at`) " +
          "VALUES (:roleId, :permId, :c, :u)",
        { replacements: { roleId: ADMIN_ROLE_ID, permId: p.id, c: now, u: now } },
      );
    }

    const capturistaSlugs = ["combustibles.ver", "combustibles.crear"];
    for (const slug of capturistaSlugs) {
      const perm = COMBUSTIBLES_PERMS.find((x) => x.slug === slug);
      if (!perm) continue;
      await queryInterface.sequelize.query(
        "INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`, `created_at`, `updated_at`) " +
          "VALUES (:roleId, :permId, :c, :u)",
        { replacements: { roleId: CAPTURISTA_ROLE_ID, permId: perm.id, c: now, u: now } },
      );
    }
  },

  async down(queryInterface) {
    await queryInterface.dropTable("fuel_tickets");
    await queryInterface.removeIndex("trucks", "trucks_tenant_folio_tag_idx");
    await queryInterface.removeColumn("trucks", "folio_tag");

    const slugs = COMBUSTIBLES_PERMS.map((p) => p.slug);
    await queryInterface.sequelize.query(
      "DELETE FROM `role_permissions` WHERE `permission_id` IN (SELECT `id` FROM `permissions` WHERE `slug` IN (:slugs))",
      { replacements: { slugs } },
    );
    await queryInterface.bulkDelete("permissions", { slug: slugs });
  },
};
