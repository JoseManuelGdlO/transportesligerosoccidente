"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const addCols = async (table, cols) => {
      for (const [name, def] of Object.entries(cols)) {
        await queryInterface.addColumn(table, name, def);
      }
    };

    await addCols("tenants", {
      metodo_pago_default: { type: Sequelize.STRING(8), allowNull: true, defaultValue: "PPD" },
      forma_pago_default: { type: Sequelize.STRING(8), allowNull: true, defaultValue: "99" },
      uso_cfdi_default: { type: Sequelize.STRING(8), allowNull: true, defaultValue: "G03" },
      iva_tasa_default: { type: Sequelize.DECIMAL(6, 4), allowNull: true, defaultValue: "0.1600" },
      retencion_tasa_default: { type: Sequelize.DECIMAL(6, 4), allowNull: true, defaultValue: "0.0400" },
      condiciones_pago_default: { type: Sequelize.STRING(255), allowNull: true },
    });

    const ubicClaves = {
      colonia_clave: { type: Sequelize.STRING(16), allowNull: true },
      municipio_clave: { type: Sequelize.STRING(16), allowNull: true },
      localidad_clave: { type: Sequelize.STRING(16), allowNull: true },
    };
    await addCols("trip_ubicaciones", ubicClaves);
    await addCols("client_ubicaciones", ubicClaves);

    await addCols("cartas_porte", {
      tipo_comprobante: { type: Sequelize.STRING(16), allowNull: true },
    });
  },

  async down(queryInterface) {
    const dropCols = async (table, cols) => {
      for (const name of cols) {
        await queryInterface.removeColumn(table, name);
      }
    };
    await dropCols("tenants", [
      "metodo_pago_default",
      "forma_pago_default",
      "uso_cfdi_default",
      "iva_tasa_default",
      "retencion_tasa_default",
      "condiciones_pago_default",
    ]);
    await dropCols("trip_ubicaciones", ["colonia_clave", "municipio_clave", "localidad_clave"]);
    await dropCols("client_ubicaciones", ["colonia_clave", "municipio_clave", "localidad_clave"]);
    await dropCols("cartas_porte", ["tipo_comprobante"]);
  },
};
