"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.up = void 0;
exports.down = void 0;
async function up(knex) {
  await knex.schema.table('episode', table => {
    table.float('progress').nullable();
  });
}
async function down(knex) {
  await knex.schema.table('episode', table => {
    table.dropColumn('progress');
  });
}
exports.up = up;
exports.down = down;
//# sourceMappingURL=20260428000003_addProgressToEpisode.js.map
