"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const addCols = async (table, cols) => {
      for (const [name, def] of Object.entries(cols)) {
        await queryInterface.addColumn(table, name, def);
      }
    };

    await addCols("trip_ubicaciones", {
      numero_exterior: { type: Sequelize.STRING(32), allowNull: true },
      pais: { type: Sequelize.STRING(3), allowNull: true, defaultValue: "MEX" },
      id_ubicacion_sat: { type: Sequelize.STRING(16), allowNull: true },
    });

    await addCols("trip_mercancias", {
      cantidad_transportada: { type: Sequelize.DECIMAL(14, 4), allowNull: true },
    });

    await addCols("cartas_porte", {
      id_ccp: { type: Sequelize.STRING(36), allowNull: true },
      transporte_internacional: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
    });

    await addCols("drivers", {
      tipo_figura: { type: Sequelize.STRING(2), allowNull: true, defaultValue: "01" },
    });
  },

  async down(queryInterface) {
    for (const c of ["numero_exterior", "pais", "id_ubicacion_sat"]) {
      await queryInterface.removeColumn("trip_ubicaciones", c);
    }
    await queryInterface.removeColumn("trip_mercancias", "cantidad_transportada");
    for (const c of ["id_ccp", "transporte_internacional"]) {
      await queryInterface.removeColumn("cartas_porte", c);
    }
    await queryInterface.removeColumn("drivers", "tipo_figura");
  },
};
