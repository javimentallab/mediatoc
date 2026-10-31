"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.up = void 0;
exports.down = void 0;
async function up(knex) {
  await knex.schema.table('mediaItem', table => {
    table.float('audioProgress').nullable();
  });
}
async function down(knex) {
  await knex.schema.table('mediaItem', table => {
    table.dropColumn('audioProgress');
  });
}
exports.up = up;
exports.down = down;
//# sourceMappingURL=20260428000002_addAudioProgressToMediaItem.js.map
