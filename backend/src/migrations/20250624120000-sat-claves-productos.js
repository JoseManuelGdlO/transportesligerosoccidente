"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("sat_claves_productos", {
      clave: {
        type: Sequelize.CHAR(8),
        primaryKey: true,
        allowNull: false,
      },
      descripcion: {
        type: Sequelize.STRING(512),
        allowNull: false,
      },
      palabras_similares: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      material_peligroso: {
        type: Sequelize.ENUM("0", "1", "0,1"),
        allowNull: false,
      },
      fecha_inicio_vigencia: {
        type: Sequelize.DATEONLY,
        allowNull: true,
      },
      fecha_fin_vigencia: {
        type: Sequelize.DATEONLY,
        allowNull: true,
      },
      catalogo_version: {
        type: Sequelize.STRING(32),
        allowNull: true,
      },
      imported_at: {
        type: Sequelize.DATE,
        allowNull: false,
      },
    });

    await queryInterface.addIndex("sat_claves_productos", ["descripcion"], {
      name: "sat_claves_productos_descripcion_idx",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("sat_claves_productos");
  },
};
