"use strict";

const bcrypt = require("bcryptjs");

/** Fixed UUIDs for idempotent seeds */
const PERMS = [
  { id: "10000000-0000-4000-8000-000000000001", slug: "viajes.ver" },
  { id: "10000000-0000-4000-8000-000000000002", slug: "viajes.crear" },
  { id: "10000000-0000-4000-8000-000000000003", slug: "viajes.cerrar" },
  { id: "10000000-0000-4000-8000-000000000004", slug: "viajes.eliminar" },
  { id: "10000000-0000-4000-8000-000000000005", slug: "liquidaciones.ver" },
  { id: "10000000-0000-4000-8000-000000000006", slug: "liquidaciones.cerrar" },
  { id: "10000000-0000-4000-8000-000000000007", slug: "catalogos.ver" },
  { id: "10000000-0000-4000-8000-000000000008", slug: "catalogos.editar" },
  { id: "10000000-0000-4000-8000-000000000009", slug: "reportes.ver" },
  { id: "10000000-0000-4000-8000-000000000010", slug: "usuarios.gestionar" },
  { id: "10000000-0000-4000-8000-000000000011", slug: "empresa.gestionar" },
  { id: "10000000-0000-4000-8000-000000000012", slug: "marca.gestionar" },
];

const DEFAULT_TENANT_ID = "e0000000-0000-4000-8000-000000000001";

const ROLES = [
  {
    id: "20000000-0000-4000-8000-000000000001",
    slug: "admin",
    nombre: "Administrador",
    descripcion:
      "Acceso total al sistema, gestión de usuarios, cierre de liquidaciones y configuración.",
  },
  {
    id: "20000000-0000-4000-8000-000000000002",
    slug: "capturista",
    nombre: "Capturista",
    descripcion:
      "Captura y operación diaria de viajes, viáticos y combustible. Sin acceso a usuarios ni cierre de liquidaciones.",
  },
];

const CAPTURISTA_PERM_SLUGS = [
  "viajes.ver",
  "viajes.crear",
  "viajes.cerrar",
  "liquidaciones.ver",
  "catalogos.ver",
  "reportes.ver",
];

/**
 * @param {import('sequelize').QueryInterface} queryInterface
 * @param {string} roleId
 * @param {string} slug
 * @param {Date} now
 */
async function ensureRolePermission(queryInterface, roleId, slug, now) {
  const [rows] = await queryInterface.sequelize.query(
    "SELECT `id` FROM `permissions` WHERE `slug` = :slug LIMIT 1",
    { replacements: { slug } },
  );
  const perm = rows[0];
  if (!perm) return;
  await queryInterface.sequelize.query(
    "INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`, `created_at`, `updated_at`) " +
      "VALUES (:roleId, :permissionId, :c, :u)",
    { replacements: { roleId, permissionId: perm.id, c: now, u: now } },
  );
}

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    const now = new Date();
    const dialect = queryInterface.sequelize.getDialect();

    if (dialect === "mysql" || dialect === "mariadb") {
      for (const p of PERMS) {
        await queryInterface.sequelize.query(
          "INSERT IGNORE INTO `permissions` (`id`, `slug`, `created_at`, `updated_at`) " +
            "VALUES (:id, :slug, :c, :u)",
          { replacements: { id: p.id, slug: p.slug, c: now, u: now } },
        );
      }
      for (const r of ROLES) {
        await queryInterface.sequelize.query(
          "INSERT IGNORE INTO `roles` (`id`, `slug`, `nombre`, `descripcion`, `created_at`, `updated_at`) " +
            "VALUES (:id, :slug, :nombre, :descripcion, :c, :u)",
          { replacements: { id: r.id, slug: r.slug, nombre: r.nombre, descripcion: r.descripcion, c: now, u: now } },
        );
      }
    } else {
      await queryInterface.bulkInsert(
        "permissions",
        PERMS.map((p) => ({ ...p, created_at: now, updated_at: now })),
        { ignoreDuplicates: true },
      );
      await queryInterface.bulkInsert(
        "roles",
        ROLES.map((r) => ({ ...r, created_at: now, updated_at: now })),
        { ignoreDuplicates: true },
      );
    }

    const adminId = ROLES[0].id;
    const capId = ROLES[1].id;

    for (const p of PERMS) {
      await ensureRolePermission(queryInterface, adminId, p.slug, now);
    }
    for (const slug of CAPTURISTA_PERM_SLUGS) {
      await ensureRolePermission(queryInterface, capId, slug, now);
    }

    const email = process.env.SEED_ADMIN_EMAIL || "admin@tlo.mx";
    const plain = process.env.SEED_ADMIN_PASSWORD || "ChangeMe123!";
    const hash = await bcrypt.hash(plain, 10);

    if (dialect === "mysql" || dialect === "mariadb") {
      await queryInterface.sequelize.query(
        "INSERT IGNORE INTO `users` (`id`, `tenant_id`, `role_id`, `email`, `password_hash`, `nombre`, `estatus`, `ultimo_acceso`, `creado_en`, `updated_at`) " +
          "VALUES (:id, :tenantId, :roleId, :email, :passwordHash, :nombre, :estatus, NULL, :creado, :u)",
        {
          replacements: {
            id: "30000000-0000-4000-8000-000000000001",
            tenantId: DEFAULT_TENANT_ID,
            roleId: adminId,
            email,
            passwordHash: hash,
            nombre: "Administrador TLO",
            estatus: "activo",
            creado: now,
            u: now,
          },
        },
      );
    } else {
      await queryInterface.bulkInsert(
        "users",
        [
          {
            id: "30000000-0000-4000-8000-000000000001",
            tenant_id: DEFAULT_TENANT_ID,
            role_id: adminId,
            email,
            password_hash: hash,
            nombre: "Administrador TLO",
            estatus: "activo",
            ultimo_acceso: null,
            creado_en: now,
            updated_at: now,
          },
        ],
        { ignoreDuplicates: true },
      );
    }
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("users", { id: "30000000-0000-4000-8000-000000000001" });
    await queryInterface.bulkDelete("role_permissions", null, {});
    await queryInterface.bulkDelete("roles", null, {});
    await queryInterface.bulkDelete("permissions", null, {});
  },
};
