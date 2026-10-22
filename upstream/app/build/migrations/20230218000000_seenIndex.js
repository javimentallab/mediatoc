"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.down = down;
exports.up = up;
async function up(knex) {
  return knex.schema.alterTable('seen', table => {
    table.index(['userId', 'type', 'episodeId']);
  });
}
async function down(knex) {
  return knex.schema.alterTable('seen', table => {
    table.dropIndex(['userId', 'type', 'episodeId']);
  });
}
//# sourceMappingURL=20230218000000_seenIndex.js.map