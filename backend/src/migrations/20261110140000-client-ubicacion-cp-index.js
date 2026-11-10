"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.addIndex("client_ubicaciones", ["tenant_id", "client_id", "cp"], {
      name: "client_ubicaciones_tenant_client_cp",
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex("client_ubicaciones", "client_ubicaciones_tenant_client_cp");
  },
};
