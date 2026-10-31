"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.down = down;
exports.up = up;
async function up(knex) {
  return knex.schema.alterTable('watchlist', table => {
    table.double('addedAt');
  });
}
async function down(knex) {
  return knex.schema.alterTable('watchlist', table => {
    table.dropColumn('addedAt');
  });
}
//# sourceMappingURL=20220208234441_watchlist.js.map