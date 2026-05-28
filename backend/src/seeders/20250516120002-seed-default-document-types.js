"use strict";

const { randomUUID } = require("crypto");

/** @param {import('sequelize').QueryInterface} queryInterface */
async function seedForTenant(queryInterface, tenantId, now) {
  const dialect = queryInterface.sequelize.getDialect();

  const operador = [
    { slug: "acta_nacimiento", nombre: "Acta de nacimiento" },
    { slug: "ine", nombre: "INE" },
    { slug: "curp", nombre: "CURP" },
    { slug: "licencia_federal", nombre: "Licencia Federal" },
    { slug: "apto_medico", nombre: "Apto médico" },
    { slug: "constancia_fiscal", nombre: "Constancia de situación fiscal" },
    { slug: "infonavit", nombre: "Infonavit" },
    { slug: "imss", nombre: "IMSS" },
  ];

  const unidadVig = [
    { slug: "tarjeta_circulacion", nombre: "Tarjeta de circulación" },
    { slug: "fisico_mecanica", nombre: "Verificación físico-mecánica" },
    { slug: "verificacion_contaminantes", nombre: "Verificación de emisión de contaminantes" },
    { slug: "permiso_dimensiones", nombre: "Permiso estatal de exceso de dimensiones" },
    { slug: "poliza_seguro", nombre: "Póliza de seguro" },
    { slug: "permiso_federal", nombre: "Permiso federal / configuración de unidad" },
    { slug: "permiso_sct", nombre: "Permiso SCT" },
  ];

  const unidadFotos = [
    { slug: "foto_placa", nombre: "Galería: placas" },
    { slug: "foto_lateral_izquierdo", nombre: "Galería: lateral izquierdo" },
    { slug: "foto_lateral_derecho", nombre: "Galería: lateral derecho" },
    { slug: "foto_trasero", nombre: "Galería: trasero" },
  ];

  const rows = [];
  for (const o of operador) {
    rows.push({
      id: randomUUID(),
      tenant_id: tenantId,
      slug: o.slug,
      nombre: o.nombre,
      aplica_a: "operador",
      dias_aviso: 30,
      requiere_vigencia: true,
      activo: true,
      created_at: now,
      updated_at: now,
    });
  }
  for (const u of unidadVig) {
    rows.push({
      id: randomUUID(),
      tenant_id: tenantId,
      slug: u.slug,
      nombre: u.nombre,
      aplica_a: "unidad",
      dias_aviso: 30,
      requiere_vigencia: true,
      activo: true,
      created_at: now,
      updated_at: now,
    });
  }
  for (const u of unidadFotos) {
    rows.push({
      id: randomUUID(),
      tenant_id: tenantId,
      slug: u.slug,
      nombre: u.nombre,
      aplica_a: "unidad",
      dias_aviso: 30,
      requiere_vigencia: false,
      activo: true,
      created_at: now,
      updated_at: now,
    });
  }

  if (dialect === "mysql" || dialect === "mariadb") {
    for (const r of rows) {
      await queryInterface.sequelize.query(
        "INSERT IGNORE INTO `document_types` (`id`, `tenant_id`, `slug`, `nombre`, `aplica_a`, `dias_aviso`, `requiere_vigencia`, `activo`, `created_at`, `updated_at`) " +
          "VALUES (:id, :tenant_id, :slug, :nombre, :aplica_a, :dias_aviso, :requiere_vigencia, :activo, :c, :u)",
        {
          replacements: {
            id: r.id,
            tenant_id: r.tenant_id,
            slug: r.slug,
            nombre: r.nombre,
            aplica_a: r.aplica_a,
            dias_aviso: r.dias_aviso,
            requiere_vigencia: r.requiere_vigencia ? 1 : 0,
            activo: r.activo ? 1 : 0,
            c: r.created_at,
            u: r.updated_at,
          },
        },
      );
    }
  } else {
    await queryInterface.bulkInsert("document_types", rows, { ignoreDuplicates: true });
  }
}

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    const now = new Date();
    const [tenants] = await queryInterface.sequelize.query("SELECT `id` FROM `tenants`");
    for (const t of tenants) {
      await seedForTenant(queryInterface, t.id, now);
    }
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("document_types", null, {});
  },
};
