"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("maintenance_records", "num_factura", {
      type: Sequelize.STRING(64),
      allowNull: true,
    });
    await queryInterface.addColumn("maintenance_records", "conceptos", {
      type: Sequelize.JSON,
      allowNull: true,
    });
    await queryInterface.addColumn("account_documents", "conceptos", {
      type: Sequelize.JSON,
      allowNull: true,
    });

    const records = await queryInterface.sequelize.query(
      "SELECT id, descripcion, costo FROM maintenance_records",
      { type: queryInterface.sequelize.QueryTypes.SELECT },
    );
    for (const r of records) {
      const precio = Math.max(0, Math.round(((Number(r.costo) || 0) + Number.EPSILON) * 100) / 100);
      const descripcion = String(r.descripcion || "Concepto").slice(0, 512);
      await queryInterface.sequelize.query(
        "UPDATE maintenance_records SET conceptos = :conceptos WHERE id = :id",
        {
          replacements: {
            id: r.id,
            conceptos: JSON.stringify([{ descripcion, precio }]),
          },
        },
      );
    }

    const docs = await queryInterface.sequelize.query(
      "SELECT id, concepto, monto_original FROM account_documents",
      { type: queryInterface.sequelize.QueryTypes.SELECT },
    );
    for (const d of docs) {
      const precio = Math.max(
        0,
        Math.round(((Number(d.monto_original) || 0) + Number.EPSILON) * 100) / 100,
      );
      const descripcion = String(d.concepto || "Concepto").slice(0, 512);
      await queryInterface.sequelize.query(
        "UPDATE account_documents SET conceptos = :conceptos WHERE id = :id",
        {
          replacements: {
            id: d.id,
            conceptos: JSON.stringify([{ descripcion, precio }]),
          },
        },
      );
    }
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("account_documents", "conceptos");
    await queryInterface.removeColumn("maintenance_records", "conceptos");
    await queryInterface.removeColumn("maintenance_records", "num_factura");
  },
};
