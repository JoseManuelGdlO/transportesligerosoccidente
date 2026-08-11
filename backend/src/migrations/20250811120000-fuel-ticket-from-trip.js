"use strict";

const { randomUUID } = require("node:crypto");

/**
 * Helpers for resumable migration after a partial failure.
 * @param {import('sequelize').QueryInterface} queryInterface
 * @param {string} table
 * @param {string} column
 */
async function columnExists(queryInterface, table, column) {
  const [rows] = await queryInterface.sequelize.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :table AND COLUMN_NAME = :column`,
    { replacements: { table, column } },
  );
  return rows.length > 0;
}

/**
 * @param {import('sequelize').QueryInterface} queryInterface
 * @param {string} table
 * @param {string} indexName
 */
async function indexExists(queryInterface, table, indexName) {
  const [rows] = await queryInterface.sequelize.query(
    `SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :table AND INDEX_NAME = :indexName
     LIMIT 1`,
    { replacements: { table, indexName } },
  );
  return rows.length > 0;
}

/**
 * @param {import('sequelize').QueryInterface} queryInterface
 * @param {string} table
 * @param {string} constraintName
 */
async function dropForeignKeyIfExists(queryInterface, table, constraintName) {
  const [rows] = await queryInterface.sequelize.query(
    `SELECT CONSTRAINT_NAME FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :table
       AND CONSTRAINT_TYPE = 'FOREIGN KEY' AND CONSTRAINT_NAME = :constraintName`,
    { replacements: { table, constraintName } },
  );
  if (rows.length === 0) return;
  await queryInterface.sequelize.query(
    `ALTER TABLE \`${table}\` DROP FOREIGN KEY \`${constraintName}\``,
  );
}

/**
 * Drop all FKs on a table (MySQL requires this before DROP PRIMARY KEY when PK is referenced by FK index).
 * @param {import('sequelize').QueryInterface} queryInterface
 * @param {string} table
 */
async function dropAllForeignKeys(queryInterface, table) {
  const [rows] = await queryInterface.sequelize.query(
    `SELECT CONSTRAINT_NAME FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :table AND CONSTRAINT_TYPE = 'FOREIGN KEY'`,
    { replacements: { table } },
  );
  for (const row of rows) {
    await queryInterface.sequelize.query(
      `ALTER TABLE \`${table}\` DROP FOREIGN KEY \`${row.CONSTRAINT_NAME}\``,
    );
  }
}

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    if (!(await columnExists(queryInterface, "fuel_tickets", "es_foraneo"))) {
      await queryInterface.addColumn("fuel_tickets", "es_foraneo", {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      });
    }

    if (!(await columnExists(queryInterface, "fuel_tickets", "source_trip_id"))) {
      await queryInterface.addColumn("fuel_tickets", "source_trip_id", {
        type: Sequelize.CHAR(36),
        allowNull: true,
      });
    }

    if (!(await indexExists(queryInterface, "fuel_tickets", "fuel_tickets_tenant_source_trip_idx"))) {
      await queryInterface.addIndex("fuel_tickets", ["tenant_id", "source_trip_id"], {
        name: "fuel_tickets_tenant_source_trip_idx",
      });
    }

    // FK source_trip_id → trips (may already exist from prior partial run)
    const [sourceFk] = await queryInterface.sequelize.query(
      `SELECT CONSTRAINT_NAME FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'fuel_tickets'
         AND COLUMN_NAME = 'source_trip_id' AND REFERENCED_TABLE_NAME = 'trips'
       LIMIT 1`,
    );
    if (sourceFk.length === 0) {
      await queryInterface.addConstraint("fuel_tickets", {
        fields: ["source_trip_id"],
        type: "foreign key",
        name: "fuel_tickets_source_trip_id_fk",
        references: { table: "trips", field: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      });
    }

    if (!(await columnExists(queryInterface, "fuel_proration_assignments", "id"))) {
      await queryInterface.addColumn("fuel_proration_assignments", "id", {
        type: Sequelize.CHAR(36),
        allowNull: true,
      });
    }

    const [rows] = await queryInterface.sequelize.query(
      `SELECT trip_id, tenant_id, fuel_ticket_id FROM fuel_proration_assignments WHERE id IS NULL`,
    );
    for (const row of rows) {
      const id = randomUUID();
      await queryInterface.sequelize.query(
        `UPDATE fuel_proration_assignments SET id = :id
         WHERE trip_id = :trip_id AND tenant_id = :tenant_id AND fuel_ticket_id = :fuel_ticket_id AND id IS NULL`,
        {
          replacements: {
            id,
            trip_id: row.trip_id,
            tenant_id: row.tenant_id,
            fuel_ticket_id: row.fuel_ticket_id,
          },
        },
      );
    }

    const dialect = queryInterface.sequelize.getDialect();
    if (dialect === "mysql" || dialect === "mariadb") {
      // PRIMARY is currently trip_id; MySQL blocks DROP PRIMARY KEY while trip_id FK uses that index.
      await dropAllForeignKeys(queryInterface, "fuel_proration_assignments");

      const [pk] = await queryInterface.sequelize.query(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'fuel_proration_assignments'
           AND CONSTRAINT_NAME = 'PRIMARY'`,
      );
      const pkCols = pk.map((r) => r.COLUMN_NAME);
      if (pkCols.length === 1 && pkCols[0] === "trip_id") {
        await queryInterface.sequelize.query(
          `ALTER TABLE fuel_proration_assignments DROP PRIMARY KEY`,
        );
      }

      await queryInterface.sequelize.query(
        `ALTER TABLE fuel_proration_assignments MODIFY id CHAR(36) NOT NULL`,
      );

      const [pkAfter] = await queryInterface.sequelize.query(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'fuel_proration_assignments'
           AND CONSTRAINT_NAME = 'PRIMARY'`,
      );
      if (pkAfter.length === 0) {
        await queryInterface.sequelize.query(
          `ALTER TABLE fuel_proration_assignments ADD PRIMARY KEY (id)`,
        );
      }

      // Indexes required before re-adding FKs
      if (!(await indexExists(queryInterface, "fuel_proration_assignments", "fuel_proration_assignments_trip_id_idx"))) {
        await queryInterface.addIndex("fuel_proration_assignments", ["trip_id"], {
          name: "fuel_proration_assignments_trip_id_idx",
        });
      }
      if (!(await indexExists(queryInterface, "fuel_proration_assignments", "fuel_proration_assignments_tenant_ticket_idx"))) {
        await queryInterface.addIndex("fuel_proration_assignments", ["tenant_id", "fuel_ticket_id"], {
          name: "fuel_proration_assignments_tenant_ticket_idx",
        });
      }

      await queryInterface.addConstraint("fuel_proration_assignments", {
        fields: ["tenant_id"],
        type: "foreign key",
        name: "fuel_proration_assignments_tenant_fk",
        references: { table: "tenants", field: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      });
      await queryInterface.addConstraint("fuel_proration_assignments", {
        fields: ["trip_id"],
        type: "foreign key",
        name: "fuel_proration_assignments_trip_fk",
        references: { table: "trips", field: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      });
      await queryInterface.addConstraint("fuel_proration_assignments", {
        fields: ["fuel_ticket_id"],
        type: "foreign key",
        name: "fuel_proration_assignments_ticket_fk",
        references: { table: "fuel_tickets", field: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      });
    } else {
      await queryInterface.changeColumn("fuel_proration_assignments", "id", {
        type: Sequelize.CHAR(36),
        allowNull: false,
        primaryKey: true,
      });
    }

    if (
      !(await indexExists(
        queryInterface,
        "fuel_proration_assignments",
        "fuel_proration_assignments_tenant_trip_ticket_unique",
      ))
    ) {
      await queryInterface.addIndex(
        "fuel_proration_assignments",
        ["tenant_id", "trip_id", "fuel_ticket_id"],
        {
          name: "fuel_proration_assignments_tenant_trip_ticket_unique",
          unique: true,
        },
      );
    }
  },

  async down(queryInterface, Sequelize) {
    if (
      await indexExists(
        queryInterface,
        "fuel_proration_assignments",
        "fuel_proration_assignments_tenant_trip_ticket_unique",
      )
    ) {
      await queryInterface.removeIndex(
        "fuel_proration_assignments",
        "fuel_proration_assignments_tenant_trip_ticket_unique",
      );
    }

    const dialect = queryInterface.sequelize.getDialect();
    if (dialect === "mysql" || dialect === "mariadb") {
      await dropAllForeignKeys(queryInterface, "fuel_proration_assignments");
      await queryInterface.sequelize.query(
        `ALTER TABLE fuel_proration_assignments DROP PRIMARY KEY`,
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE fuel_proration_assignments ADD PRIMARY KEY (trip_id)`,
      );
      await queryInterface.addConstraint("fuel_proration_assignments", {
        fields: ["tenant_id"],
        type: "foreign key",
        name: "fuel_proration_assignments_tenant_fk",
        references: { table: "tenants", field: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      });
      await queryInterface.addConstraint("fuel_proration_assignments", {
        fields: ["trip_id"],
        type: "foreign key",
        name: "fuel_proration_assignments_trip_fk",
        references: { table: "trips", field: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      });
      await queryInterface.addConstraint("fuel_proration_assignments", {
        fields: ["fuel_ticket_id"],
        type: "foreign key",
        name: "fuel_proration_assignments_ticket_fk",
        references: { table: "fuel_tickets", field: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      });
    }

    if (await columnExists(queryInterface, "fuel_proration_assignments", "id")) {
      await queryInterface.removeColumn("fuel_proration_assignments", "id");
    }

    await dropForeignKeyIfExists(queryInterface, "fuel_tickets", "fuel_tickets_source_trip_id_fk");
    await dropForeignKeyIfExists(queryInterface, "fuel_tickets", "fuel_tickets_source_trip_id_foreign_idx");

    if (await indexExists(queryInterface, "fuel_tickets", "fuel_tickets_tenant_source_trip_idx")) {
      await queryInterface.removeIndex("fuel_tickets", "fuel_tickets_tenant_source_trip_idx");
    }
    if (await columnExists(queryInterface, "fuel_tickets", "source_trip_id")) {
      await queryInterface.removeColumn("fuel_tickets", "source_trip_id");
    }
    if (await columnExists(queryInterface, "fuel_tickets", "es_foraneo")) {
      await queryInterface.removeColumn("fuel_tickets", "es_foraneo");
    }
  },
};
