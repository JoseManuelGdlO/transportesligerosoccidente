"use strict";

const CAPTURISTA_ROLE_ID = "20000000-0000-4000-8000-000000000002";
const IMPORT_PERM_ID = "10000000-0000-4000-8000-000000000022";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      "DELETE FROM `role_permissions` WHERE `role_id` = :roleId AND `permission_id` = :permId",
      { replacements: { roleId: CAPTURISTA_ROLE_ID, permId: IMPORT_PERM_ID } },
    );
  },

  async down(queryInterface) {
    const now = new Date();
    await queryInterface.sequelize.query(
      "INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`, `created_at`, `updated_at`) " +
        "VALUES (:roleId, :permId, :c, :u)",
      { replacements: { roleId: CAPTURISTA_ROLE_ID, permId: IMPORT_PERM_ID, c: now, u: now } },
    );
  },
};
