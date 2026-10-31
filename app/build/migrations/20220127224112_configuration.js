"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.down = down;
exports.up = up;
async function up(knex) {
  return knex.schema.alterTable('configuration', table => {
    table.string('tmdbLang');
    table.string('audibleLang');
    table.string('serverLang');
  });
}
async function down(knex) {
  return knex.schema.alterTable('configuration', table => {
    table.dropColumn('tmdbLang');
    table.dropColumn('audibleLang');
    table.dropColumn('serverLang');
  });
}
//# sourceMappingURL=20220127224112_configuration.js.map