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
      rfc: { type: Sequelize.STRING(13), allowNull: true },
      razon_social: { type: Sequelize.STRING(255), allowNull: true },
      regimen_fiscal: { type: Sequelize.STRING(10), allowNull: true },
      cp_fiscal: { type: Sequelize.STRING(5), allowNull: true },
      calle_fiscal: { type: Sequelize.STRING(255), allowNull: true },
      colonia_fiscal: { type: Sequelize.STRING(128), allowNull: true },
      municipio_fiscal: { type: Sequelize.STRING(128), allowNull: true },
      estado_fiscal: { type: Sequelize.STRING(64), allowNull: true },
      pac_proveedor: { type: Sequelize.STRING(64), allowNull: true },
      pac_url: { type: Sequelize.STRING(512), allowNull: true },
      pac_usuario: { type: Sequelize.STRING(128), allowNull: true },
      pac_token_enc: { type: Sequelize.TEXT, allowNull: true },
      csd_cer_path: { type: Sequelize.STRING(512), allowNull: true },
      csd_key_path: { type: Sequelize.STRING(512), allowNull: true },
      csd_password_enc: { type: Sequelize.TEXT, allowNull: true },
      cfdi_serie: { type: Sequelize.STRING(16), allowNull: true, defaultValue: "CP" },
    });

    await addCols("clients", {
      calle: { type: Sequelize.STRING(255), allowNull: true },
      colonia: { type: Sequelize.STRING(128), allowNull: true },
      municipio: { type: Sequelize.STRING(128), allowNull: true },
      estado: { type: Sequelize.STRING(64), allowNull: true },
      cp: { type: Sequelize.STRING(5), allowNull: true },
      pais: { type: Sequelize.STRING(3), allowNull: true, defaultValue: "MEX" },
    });

    await addCols("trucks", {
      config_vehicular: { type: Sequelize.STRING(16), allowNull: true },
      perm_sct: { type: Sequelize.STRING(16), allowNull: true },
      num_permiso_sct: { type: Sequelize.STRING(64), allowNull: true },
      peso_bruto_vehicular: { type: Sequelize.DECIMAL(10, 2), allowNull: true },
      aseguradora_resp_civil: { type: Sequelize.STRING(128), allowNull: true },
      poliza_resp_civil: { type: Sequelize.STRING(64), allowNull: true },
    });

    await addCols("drivers", {
      rfc: { type: Sequelize.STRING(13), allowNull: true },
      licencia_federal: { type: Sequelize.STRING(64), allowNull: true },
    });

    await queryInterface.createTable("trip_ubicaciones", {
      id: { type: Sequelize.CHAR(36), primaryKey: true },
      tenant_id: { type: Sequelize.CHAR(36), allowNull: false },
      trip_id: { type: Sequelize.CHAR(36), allowNull: false },
      tipo: { type: Sequelize.ENUM("Origen", "Destino"), allowNull: false },
      rfc: { type: Sequelize.STRING(13), allowNull: true },
      nombre: { type: Sequelize.STRING(255), allowNull: true },
      fecha_hora: { type: Sequelize.DATE, allowNull: true },
      calle: { type: Sequelize.STRING(255), allowNull: true },
      colonia: { type: Sequelize.STRING(128), allowNull: true },
      municipio: { type: Sequelize.STRING(128), allowNull: true },
      localidad: { type: Sequelize.STRING(128), allowNull: true },
      estado: { type: Sequelize.STRING(64), allowNull: true },
      cp: { type: Sequelize.STRING(5), allowNull: true },
      distancia_km: { type: Sequelize.DECIMAL(10, 2), allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex("trip_ubicaciones", ["trip_id", "tipo"], { unique: true, name: "trip_ubicaciones_trip_tipo" });

    await queryInterface.createTable("trip_mercancias", {
      id: { type: Sequelize.CHAR(36), primaryKey: true },
      tenant_id: { type: Sequelize.CHAR(36), allowNull: false },
      trip_id: { type: Sequelize.CHAR(36), allowNull: false },
      descripcion: { type: Sequelize.STRING(500), allowNull: false },
      cantidad: { type: Sequelize.DECIMAL(14, 4), allowNull: false, defaultValue: 1 },
      unidad: { type: Sequelize.STRING(16), allowNull: false, defaultValue: "H87" },
      peso_kg: { type: Sequelize.DECIMAL(14, 4), allowNull: false },
      clave_prod_serv: { type: Sequelize.STRING(16), allowNull: true },
      material_peligroso: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      embalaje: { type: Sequelize.STRING(32), allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex("trip_mercancias", ["trip_id"]);

    await queryInterface.createTable("cartas_porte", {
      id: { type: Sequelize.CHAR(36), primaryKey: true },
      tenant_id: { type: Sequelize.CHAR(36), allowNull: false },
      trip_id: { type: Sequelize.CHAR(36), allowNull: false },
      estatus: {
        type: Sequelize.ENUM("borrador", "timbrada", "cancelada", "error"),
        allowNull: false,
        defaultValue: "borrador",
      },
      uuid: { type: Sequelize.STRING(36), allowNull: true },
      serie: { type: Sequelize.STRING(16), allowNull: true },
      folio_cfdi: { type: Sequelize.STRING(32), allowNull: true },
      xml_timbrado: { type: Sequelize.TEXT("long"), allowNull: true },
      pdf_path: { type: Sequelize.STRING(512), allowNull: true },
      pac_proveedor: { type: Sequelize.STRING(64), allowNull: true },
      pac_response: { type: Sequelize.TEXT, allowNull: true },
      error_mensaje: { type: Sequelize.TEXT, allowNull: true },
      timbrado_at: { type: Sequelize.DATE, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex("cartas_porte", ["trip_id"], { unique: true, name: "cartas_porte_trip_unique" });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("cartas_porte");
    await queryInterface.dropTable("trip_mercancias");
    await queryInterface.dropTable("trip_ubicaciones");

    const dropTenant = [
      "rfc", "razon_social", "regimen_fiscal", "cp_fiscal", "calle_fiscal", "colonia_fiscal",
      "municipio_fiscal", "estado_fiscal", "pac_proveedor", "pac_url", "pac_usuario", "pac_token_enc",
      "csd_cer_path", "csd_key_path", "csd_password_enc", "cfdi_serie",
    ];
    for (const c of dropTenant) await queryInterface.removeColumn("tenants", c);

    for (const c of ["calle", "colonia", "municipio", "estado", "cp", "pais"]) {
      await queryInterface.removeColumn("clients", c);
    }
    for (const c of ["config_vehicular", "perm_sct", "num_permiso_sct", "peso_bruto_vehicular", "aseguradora_resp_civil", "poliza_resp_civil"]) {
      await queryInterface.removeColumn("trucks", c);
    }
    for (const c of ["rfc", "licencia_federal"]) await queryInterface.removeColumn("drivers", c);
  },
};
