"use strict";

/** Comentarios del CFDI: salen debajo del total en letra (NoIdentificacion, máx. 100). */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("cartas_porte", "comentarios", {
      type: Sequelize.STRING(100),
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("cartas_porte", "comentarios");
  },
};
