"use strict";

/**
 * @param {import('sequelize').QueryInterface} queryInterface
 * @param {string} tableName
 */
async function tableExists(queryInterface, tableName) {
  const tables = await queryInterface.showAllTables();
  return tables.some((t) => t === tableName);
}

/**
 * @param {import('sequelize').QueryInterface} queryInterface
 * @param {string} tableName
 * @param {string} indexName
 */
async function indexExists(queryInterface, tableName, indexName) {
  const dialect = queryInterface.sequelize.getDialect();
  if (dialect !== "mysql" && dialect !== "mariadb") {
    const indexes = await queryInterface.showIndex(tableName);
    return indexes.some((idx) => idx.name === indexName);
  }
  const [rows] = await queryInterface.sequelize.query(
    `SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :tableName AND INDEX_NAME = :indexName
     LIMIT 1`,
    { replacements: { tableName, indexName } },
  );
  return rows.length > 0;
}

/**
 * @param {import('sequelize').QueryInterface} queryInterface
 * @param {string} constraintName
 */
async function constraintExists(queryInterface, constraintName) {
  const dialect = queryInterface.sequelize.getDialect();
  if (dialect !== "mysql" && dialect !== "mariadb") {
    return false;
  }
  const [rows] = await queryInterface.sequelize.query(
    `SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
     WHERE CONSTRAINT_SCHEMA = DATABASE() AND CONSTRAINT_NAME = :name
     LIMIT 1`,
    { replacements: { name: constraintName } },
  );
  return rows.length > 0;
}

/**
 * @param {import('sequelize').QueryInterface} queryInterface
 * @param {string} tableName
 * @param {string} columnName
 */
async function hasUniqueOnColumn(queryInterface, tableName, columnName) {
  const dialect = queryInterface.sequelize.getDialect();
  if (dialect !== "mysql" && dialect !== "mariadb") {
    const indexes = await queryInterface.showIndex(tableName);
    return indexes.some(
      (idx) =>
        idx.unique &&
        idx.fields &&
        idx.fields.some((f) => f.attribute === columnName || f.name === columnName),
    );
  }
  const [rows] = await queryInterface.sequelize.query(
    `SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :tableName
       AND COLUMN_NAME = :columnName AND NON_UNIQUE = 0 LIMIT 1`,
    { replacements: { tableName, columnName } },
  );
  return rows.length > 0;
}

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    if (!(await tableExists(queryInterface, "document_types"))) {
      await queryInterface.createTable("document_types", {
        id: { type: Sequelize.CHAR(36), primaryKey: true },
        tenant_id: {
          type: Sequelize.CHAR(36),
          allowNull: false,
          references: { model: "tenants", key: "id" },
          onUpdate: "CASCADE",
          onDelete: "RESTRICT",
        },
        slug: { type: Sequelize.STRING(64), allowNull: false },
        nombre: { type: Sequelize.STRING(255), allowNull: false },
        aplica_a: { type: Sequelize.ENUM("operador", "unidad"), allowNull: false },
        dias_aviso: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false, defaultValue: 30 },
        requiere_vigencia: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        activo: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        created_at: { type: Sequelize.DATE, allowNull: false },
        updated_at: { type: Sequelize.DATE, allowNull: false },
      });
    }
    if (!(await indexExists(queryInterface, "document_types", "document_types_tenant_slug_uq"))) {
      await queryInterface.addIndex("document_types", ["tenant_id", "slug"], {
        name: "document_types_tenant_slug_uq",
        unique: true,
      });
    }
    if (!(await indexExists(queryInterface, "document_types", "document_types_tenant_id_idx"))) {
      await queryInterface.addIndex("document_types", ["tenant_id"], { name: "document_types_tenant_id_idx" });
    }

    if (!(await tableExists(queryInterface, "documents"))) {
      await queryInterface.createTable("documents", {
        id: { type: Sequelize.CHAR(36), primaryKey: true },
        tenant_id: {
          type: Sequelize.CHAR(36),
          allowNull: false,
          references: { model: "tenants", key: "id" },
          onUpdate: "CASCADE",
          onDelete: "RESTRICT",
        },
        document_type_id: {
          type: Sequelize.CHAR(36),
          allowNull: false,
          references: { model: "document_types", key: "id" },
          onUpdate: "CASCADE",
          onDelete: "RESTRICT",
        },
        documentable_type: { type: Sequelize.ENUM("driver", "truck"), allowNull: false },
        documentable_id: { type: Sequelize.CHAR(36), allowNull: false },
        numero: { type: Sequelize.TEXT, allowNull: true },
        vigencia_inicio: { type: Sequelize.DATEONLY, allowNull: true },
        vigencia_fin: { type: Sequelize.DATEONLY, allowNull: true },
        file_path: { type: Sequelize.TEXT, allowNull: true },
        file_name: { type: Sequelize.STRING(255), allowNull: true },
        mime: { type: Sequelize.STRING(128), allowNull: true },
        size: { type: Sequelize.INTEGER.UNSIGNED, allowNull: true },
        notas: { type: Sequelize.TEXT, allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false },
        updated_at: { type: Sequelize.DATE, allowNull: false },
      });
    }
    if (!(await indexExists(queryInterface, "documents", "documents_tenant_poly_idx"))) {
      await queryInterface.addIndex("documents", ["tenant_id", "documentable_type", "documentable_id"], {
        name: "documents_tenant_poly_idx",
      });
    }
    if (!(await indexExists(queryInterface, "documents", "documents_tenant_vigencia_fin_idx"))) {
      await queryInterface.addIndex("documents", ["tenant_id", "vigencia_fin"], {
        name: "documents_tenant_vigencia_fin_idx",
      });
    }
    if (!(await indexExists(queryInterface, "documents", "documents_document_type_id_idx"))) {
      await queryInterface.addIndex("documents", ["document_type_id"], { name: "documents_document_type_id_idx" });
    }

    if (!(await tableExists(queryInterface, "push_subscriptions"))) {
      await queryInterface.createTable("push_subscriptions", {
        id: { type: Sequelize.CHAR(36), primaryKey: true },
        tenant_id: {
          type: Sequelize.CHAR(36),
          allowNull: false,
          references: { model: "tenants", key: "id" },
          onUpdate: "CASCADE",
          onDelete: "RESTRICT",
        },
        user_id: {
          type: Sequelize.CHAR(36),
          allowNull: false,
          references: { model: "users", key: "id" },
          onUpdate: "CASCADE",
          onDelete: "CASCADE",
        },
        // VARCHAR (no TEXT): MySQL no permite UNIQUE en TEXT sin prefijo
        endpoint: { type: Sequelize.STRING(768), allowNull: false, unique: true },
        p256dh: { type: Sequelize.TEXT, allowNull: false },
        auth: { type: Sequelize.TEXT, allowNull: false },
        user_agent: { type: Sequelize.TEXT, allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false },
        updated_at: { type: Sequelize.DATE, allowNull: false },
      });
    }
    if (
      (await tableExists(queryInterface, "push_subscriptions")) &&
      !(await hasUniqueOnColumn(queryInterface, "push_subscriptions", "endpoint"))
    ) {
      await queryInterface.addIndex("push_subscriptions", ["endpoint"], {
        name: "push_subscriptions_endpoint_uq",
        unique: true,
      });
    }
    if (!(await indexExists(queryInterface, "push_subscriptions", "push_subscriptions_tenant_user_idx"))) {
      await queryInterface.addIndex("push_subscriptions", ["tenant_id", "user_id"], {
        name: "push_subscriptions_tenant_user_idx",
      });
    }

    if (!(await tableExists(queryInterface, "notifications"))) {
      await queryInterface.createTable("notifications", {
        id: { type: Sequelize.CHAR(36), primaryKey: true },
        tenant_id: {
          type: Sequelize.CHAR(36),
          allowNull: false,
          references: { model: "tenants", key: "id" },
          onUpdate: "CASCADE",
          onDelete: "RESTRICT",
        },
        user_id: {
          type: Sequelize.CHAR(36),
          allowNull: false,
          references: { model: "users", key: "id" },
          onUpdate: "CASCADE",
          onDelete: "CASCADE",
        },
        tipo: { type: Sequelize.STRING(64), allowNull: false },
        payload: { type: Sequelize.JSON, allowNull: false },
        document_id: {
          type: Sequelize.CHAR(36),
          allowNull: true,
          references: { model: "documents", key: "id" },
          onUpdate: "CASCADE",
          onDelete: "SET NULL",
        },
        alert_date: { type: Sequelize.DATEONLY, allowNull: false },
        leida: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        created_at: { type: Sequelize.DATE, allowNull: false },
        updated_at: { type: Sequelize.DATE, allowNull: false },
      });
    }
    if (!(await indexExists(queryInterface, "notifications", "notifications_tenant_user_leida_idx"))) {
      await queryInterface.addIndex("notifications", ["tenant_id", "user_id", "leida"], {
        name: "notifications_tenant_user_leida_idx",
      });
    }
    if (!(await indexExists(queryInterface, "notifications", "notifications_user_created_idx"))) {
      await queryInterface.addIndex("notifications", ["user_id", "created_at"], {
        name: "notifications_user_created_idx",
      });
    }
    if (!(await constraintExists(queryInterface, "notifications_dedup_uq"))) {
      await queryInterface.addConstraint("notifications", {
        fields: ["user_id", "document_id", "alert_date", "tipo"],
        type: "unique",
        name: "notifications_dedup_uq",
      });
    }
  },

  async down(queryInterface) {
    await queryInterface.dropTable("notifications");
    await queryInterface.dropTable("push_subscriptions");
    await queryInterface.dropTable("documents");
    await queryInterface.dropTable("document_types");
  },
};
