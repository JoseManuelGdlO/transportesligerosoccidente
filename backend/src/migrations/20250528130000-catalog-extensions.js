"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const addCols = async (table, cols) => {
      for (const [name, def] of Object.entries(cols)) {
        await queryInterface.addColumn(table, name, def);
      }
    };

    await addCols("clients", {
      numero_exterior: { type: Sequelize.STRING(32), allowNull: true },
      numero_interior: { type: Sequelize.STRING(32), allowNull: true },
      localidad: { type: Sequelize.STRING(128), allowNull: true },
      email: { type: Sequelize.STRING(255), allowNull: true },
      regimen_fiscal: { type: Sequelize.STRING(10), allowNull: true },
      estatus: {
        type: Sequelize.ENUM("activo", "inactivo"),
        allowNull: false,
        defaultValue: "activo",
      },
      observaciones: { type: Sequelize.TEXT, allowNull: true },
    });

    await queryInterface.createTable("client_ubicaciones", {
      id: { type: Sequelize.CHAR(36), primaryKey: true },
      tenant_id: { type: Sequelize.CHAR(36), allowNull: false },
      client_id: { type: Sequelize.CHAR(36), allowNull: false },
      nombre: { type: Sequelize.STRING(255), allowNull: false },
      tipo: {
        type: Sequelize.ENUM("Origen", "Destino", "Ambos"),
        allowNull: false,
        defaultValue: "Ambos",
      },
      calle: { type: Sequelize.STRING(255), allowNull: true },
      numero_exterior: { type: Sequelize.STRING(32), allowNull: true },
      numero_interior: { type: Sequelize.STRING(32), allowNull: true },
      colonia: { type: Sequelize.STRING(128), allowNull: true },
      localidad: { type: Sequelize.STRING(128), allowNull: true },
      municipio: { type: Sequelize.STRING(128), allowNull: true },
      estado: { type: Sequelize.STRING(64), allowNull: true },
      pais: { type: Sequelize.STRING(3), allowNull: true, defaultValue: "MEX" },
      cp: { type: Sequelize.STRING(5), allowNull: true },
      estatus: {
        type: Sequelize.ENUM("activo", "inactivo"),
        allowNull: false,
        defaultValue: "activo",
      },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false },
    });

    await addCols("trucks", {
      vin: { type: Sequelize.STRING(17), allowNull: true },
      capacidad_carga_kg: { type: Sequelize.DECIMAL(12, 2), allowNull: true },
    });

    await addCols("drivers", {
      curp: { type: Sequelize.STRING(18), allowNull: true },
      email: { type: Sequelize.STRING(255), allowNull: true },
      numero_empleado: { type: Sequelize.STRING(64), allowNull: true },
      calle: { type: Sequelize.STRING(255), allowNull: true },
      numero_exterior: { type: Sequelize.STRING(32), allowNull: true },
      numero_interior: { type: Sequelize.STRING(32), allowNull: true },
      colonia: { type: Sequelize.STRING(128), allowNull: true },
      localidad: { type: Sequelize.STRING(128), allowNull: true },
      municipio: { type: Sequelize.STRING(128), allowNull: true },
      estado: { type: Sequelize.STRING(64), allowNull: true },
      cp: { type: Sequelize.STRING(5), allowNull: true },
      pais: { type: Sequelize.STRING(3), allowNull: true, defaultValue: "MEX" },
      truck_id: { type: Sequelize.CHAR(36), allowNull: true },
      puesto: { type: Sequelize.STRING(128), allowNull: true },
    });

    await addCols("trip_ubicaciones", {
      numero_interior: { type: Sequelize.STRING(32), allowNull: true },
      client_ubicacion_id: { type: Sequelize.CHAR(36), allowNull: true },
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("trip_ubicaciones", "client_ubicacion_id");
    await queryInterface.removeColumn("trip_ubicaciones", "numero_interior");

    for (const c of [
      "curp",
      "email",
      "numero_empleado",
      "calle",
      "numero_exterior",
      "numero_interior",
      "colonia",
      "localidad",
      "municipio",
      "estado",
      "cp",
      "pais",
      "truck_id",
      "puesto",
    ]) {
      await queryInterface.removeColumn("drivers", c);
    }

    for (const c of ["vin", "capacidad_carga_kg"]) {
      await queryInterface.removeColumn("trucks", c);
    }

    await queryInterface.dropTable("client_ubicaciones");

    for (const c of [
      "numero_exterior",
      "numero_interior",
      "localidad",
      "email",
      "regimen_fiscal",
      "estatus",
      "observaciones",
    ]) {
      await queryInterface.removeColumn("clients", c);
    }
  },
};
