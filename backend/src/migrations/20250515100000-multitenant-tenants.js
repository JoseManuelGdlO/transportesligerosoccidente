"use strict";

const DEFAULT_TENANT_ID = "e0000000-0000-4000-8000-000000000001";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const now = new Date();

    await queryInterface.createTable("tenants", {
      id: { type: Sequelize.CHAR(36), primaryKey: true },
      slug: { type: Sequelize.STRING(64), allowNull: false, unique: true },
      nombre: { type: Sequelize.STRING(255), allowNull: false },
      estatus: { type: Sequelize.ENUM("activo", "suspendido"), allowNull: false, defaultValue: "activo" },
      logo_url: { type: Sequelize.TEXT, allowNull: true },
      color_primary: { type: Sequelize.STRING(16), allowNull: true },
      color_accent: { type: Sequelize.STRING(16), allowNull: true },
      color_sidebar: { type: Sequelize.STRING(16), allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex("tenants", ["slug"], { name: "tenants_slug_idx", unique: true });

    await queryInterface.bulkInsert("tenants", [
      {
        id: DEFAULT_TENANT_ID,
        slug: "tlo",
        nombre: "Transportes Ligeros Occidente",
        estatus: "activo",
        logo_url: null,
        color_primary: null,
        color_accent: null,
        color_sidebar: null,
        created_at: now,
        updated_at: now,
      },
    ]);

    const bareTenantCol = { type: Sequelize.CHAR(36), allowNull: true };
    const tables = ["users", "trucks", "drivers", "clients", "trips", "settlements", "fuel_loads", "expenses"];
    for (const t of tables) {
      await queryInterface.addColumn(t, "tenant_id", bareTenantCol);
    }

    await queryInterface.sequelize.query(`UPDATE users SET tenant_id = :tid WHERE tenant_id IS NULL`, {
      replacements: { tid: DEFAULT_TENANT_ID },
    });
    for (const tbl of ["trucks", "drivers", "clients", "trips", "settlements"]) {
      await queryInterface.sequelize.query(`UPDATE \`${tbl}\` SET tenant_id = :tid WHERE tenant_id IS NULL`, {
        replacements: { tid: DEFAULT_TENANT_ID },
      });
    }
    await queryInterface.sequelize.query(
      `UPDATE fuel_loads f INNER JOIN trips t ON t.id = f.trip_id SET f.tenant_id = t.tenant_id WHERE f.tenant_id IS NULL`,
    );
    await queryInterface.sequelize.query(
      `UPDATE expenses e INNER JOIN trips t ON t.id = e.trip_id SET e.tenant_id = t.tenant_id WHERE e.tenant_id IS NULL`,
    );

    for (const tbl of tables) {
      await queryInterface.changeColumn(tbl, "tenant_id", {
        type: Sequelize.CHAR(36),
        allowNull: false,
      });
    }

    for (const tbl of tables) {
      await queryInterface.addConstraint(tbl, {
        fields: ["tenant_id"],
        type: "foreign key",
        name: `${tbl}_tenant_id_fk`,
        references: { table: "tenants", field: "id" },
        onUpdate: "CASCADE",
        onDelete: "RESTRICT",
      });
    }

    try {
      await queryInterface.removeIndex("users", "users_email_idx");
    } catch {
      /* index name may differ */
    }
    await queryInterface.sequelize.query(`ALTER TABLE users DROP INDEX \`email\``).catch(() => {});

    await queryInterface.addIndex("users", ["tenant_id", "email"], {
      name: "users_tenant_email_unique",
      unique: true,
    });

    await queryInterface.addIndex("trucks", ["tenant_id"], { name: "trucks_tenant_id_idx" });
    await queryInterface.addIndex("drivers", ["tenant_id"], { name: "drivers_tenant_id_idx" });
    await queryInterface.addIndex("clients", ["tenant_id"], { name: "clients_tenant_id_idx" });
    await queryInterface.addIndex("trips", ["tenant_id"], { name: "trips_tenant_id_idx" });
    await queryInterface.addIndex("settlements", ["tenant_id"], { name: "settlements_tenant_id_idx" });
    await queryInterface.addIndex("fuel_loads", ["tenant_id"], { name: "fuel_loads_tenant_id_idx" });
    await queryInterface.addIndex("expenses", ["tenant_id"], { name: "expenses_tenant_id_idx" });
    await queryInterface.addIndex("users", ["tenant_id"], { name: "users_tenant_id_idx" });

    await queryInterface.sequelize.query(`ALTER TABLE trips DROP INDEX \`folio\``).catch(() => {});
    await queryInterface.sequelize.query(`ALTER TABLE trips DROP INDEX \`trips_folio_unique\``).catch(() => {});
    await queryInterface.sequelize.query(`ALTER TABLE trips DROP INDEX \`folio_2\``).catch(() => {});
    await queryInterface.addIndex("trips", ["tenant_id", "folio"], {
      name: "trips_tenant_folio_unique",
      unique: true,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeIndex("trips", "trips_tenant_folio_unique").catch(() => {});
    await queryInterface.addIndex("trips", ["folio"], { name: "folio", unique: true }).catch(() => {});
    await queryInterface.removeIndex("users", "users_tenant_email_unique").catch(() => {});
    await queryInterface.addIndex("users", ["email"], { name: "users_email_idx" });

    const tables = ["expenses", "fuel_loads", "settlements", "trips", "clients", "drivers", "trucks", "users"];
    for (const t of tables) {
      const idxName = `${t}_tenant_id_idx`;
      await queryInterface.removeIndex(t, idxName).catch(() => {});
      await queryInterface.removeConstraint(t, `${t}_tenant_id_fk`).catch(() => {});
      await queryInterface.removeColumn(t, "tenant_id");
    }

    await queryInterface.dropTable("tenants");
  },
};
