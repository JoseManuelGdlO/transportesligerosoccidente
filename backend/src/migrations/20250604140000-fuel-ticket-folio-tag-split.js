"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("fuel_tickets", "folio", {
      type: Sequelize.STRING(32),
      allowNull: true,
    });
    await queryInterface.addColumn("fuel_tickets", "tag", {
      type: Sequelize.STRING(64),
      allowNull: true,
    });
    await queryInterface.sequelize.query(
      "UPDATE `fuel_tickets` SET `tag` = `folio_tag` WHERE `folio_tag` IS NOT NULL",
    );
    await queryInterface.removeColumn("fuel_tickets", "folio_tag");
    await queryInterface.addIndex("fuel_tickets", ["tenant_id", "folio"], {
      name: "fuel_tickets_tenant_folio_unique",
      unique: true,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeIndex("fuel_tickets", "fuel_tickets_tenant_folio_unique");
    await queryInterface.addColumn("fuel_tickets", "folio_tag", {
      type: Sequelize.STRING(64),
      allowNull: true,
    });
    await queryInterface.sequelize.query(
      "UPDATE `fuel_tickets` SET `folio_tag` = `tag` WHERE `tag` IS NOT NULL",
    );
    await queryInterface.removeColumn("fuel_tickets", "folio");
    await queryInterface.removeColumn("fuel_tickets", "tag");
  },
};
