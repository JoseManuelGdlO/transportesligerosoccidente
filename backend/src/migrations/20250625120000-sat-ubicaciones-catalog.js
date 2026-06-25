"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const catalogMeta = {
      fecha_inicio_vigencia: { type: Sequelize.DATEONLY, allowNull: true },
      fecha_fin_vigencia: { type: Sequelize.DATEONLY, allowNull: true },
      catalogo_version: { type: Sequelize.STRING(32), allowNull: true },
      imported_at: { type: Sequelize.DATE, allowNull: false },
    };

    await queryInterface.createTable("sat_municipios", {
      clave: { type: Sequelize.STRING(16), allowNull: false, primaryKey: true },
      estado: { type: Sequelize.STRING(8), allowNull: false, primaryKey: true },
      descripcion: { type: Sequelize.STRING(255), allowNull: false },
      ...catalogMeta,
    });
    await queryInterface.addIndex("sat_municipios", ["descripcion"], {
      name: "sat_municipios_descripcion_idx",
    });
    await queryInterface.addIndex("sat_municipios", ["estado"], {
      name: "sat_municipios_estado_idx",
    });

    await queryInterface.createTable("sat_localidades", {
      clave: { type: Sequelize.STRING(16), allowNull: false, primaryKey: true },
      estado: { type: Sequelize.STRING(8), allowNull: false, primaryKey: true },
      descripcion: { type: Sequelize.STRING(255), allowNull: false },
      ...catalogMeta,
    });
    await queryInterface.addIndex("sat_localidades", ["descripcion"], {
      name: "sat_localidades_descripcion_idx",
    });
    await queryInterface.addIndex("sat_localidades", ["estado"], {
      name: "sat_localidades_estado_idx",
    });

    await queryInterface.createTable("sat_colonias", {
      clave: { type: Sequelize.STRING(16), allowNull: false, primaryKey: true },
      codigo_postal: { type: Sequelize.STRING(5), allowNull: false, primaryKey: true },
      nombre: { type: Sequelize.STRING(255), allowNull: false },
      ...catalogMeta,
    });
    await queryInterface.addIndex("sat_colonias", ["nombre"], {
      name: "sat_colonias_nombre_idx",
    });
    await queryInterface.addIndex("sat_colonias", ["codigo_postal"], {
      name: "sat_colonias_codigo_postal_idx",
    });

    const ubicClaves = {
      colonia_clave: { type: Sequelize.STRING(16), allowNull: true },
      municipio_clave: { type: Sequelize.STRING(16), allowNull: true },
      localidad_clave: { type: Sequelize.STRING(16), allowNull: true },
    };
    for (const [name, def] of Object.entries(ubicClaves)) {
      await queryInterface.addColumn("clients", name, def);
    }
  },

  async down(queryInterface) {
    for (const col of ["colonia_clave", "municipio_clave", "localidad_clave"]) {
      await queryInterface.removeColumn("clients", col);
    }
    await queryInterface.dropTable("sat_colonias");
    await queryInterface.dropTable("sat_localidades");
    await queryInterface.dropTable("sat_municipios");
  },
};
