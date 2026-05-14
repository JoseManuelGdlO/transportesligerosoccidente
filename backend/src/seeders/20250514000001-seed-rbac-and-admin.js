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
];

const ROLES = [
  {
    id: "20000000-0000-4000-8000-000000000001",
    slug: "admin",
    nombre: "Administrador",
    descripcion: "Acceso total al sistema, gestión de usuarios, cierre de liquidaciones y configuración.",
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

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    const now = new Date();
    await queryInterface.bulkInsert(
      "permissions",
      PERMS.map((p) => ({ ...p, created_at: now, updated_at: now })),
    );
    await queryInterface.bulkInsert(
      "roles",
      ROLES.map((r) => ({ ...r, created_at: now, updated_at: now })),
    );

    const adminId = ROLES[0].id;
    const capId = ROLES[1].id;
    const rpRows = [];
    for (const p of PERMS) {
      rpRows.push({ role_id: adminId, permission_id: p.id, created_at: now, updated_at: now });
    }
    for (const slug of CAPTURISTA_PERM_SLUGS) {
      const p = PERMS.find((x) => x.slug === slug);
      rpRows.push({ role_id: capId, permission_id: p.id, created_at: now, updated_at: now });
    }
    await queryInterface.bulkInsert("role_permissions", rpRows);

    const email = process.env.SEED_ADMIN_EMAIL || "admin@tlo.mx";
    const plain = process.env.SEED_ADMIN_PASSWORD || "ChangeMe123!";
    const hash = await bcrypt.hash(plain, 10);
    await queryInterface.bulkInsert("users", [
      {
        id: "30000000-0000-4000-8000-000000000001",
        role_id: adminId,
        email,
        password_hash: hash,
        nombre: "Administrador TLO",
        estatus: "activo",
        ultimo_acceso: null,
        creado_en: now,
        updated_at: now,
      },
    ]);
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("users", { id: "30000000-0000-4000-8000-000000000001" });
    await queryInterface.bulkDelete("role_permissions", null, {});
    await queryInterface.bulkDelete("roles", null, {});
    await queryInterface.bulkDelete("permissions", null, {});
  },
};
