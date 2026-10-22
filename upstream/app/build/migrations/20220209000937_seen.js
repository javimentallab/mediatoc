"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.down = down;
exports.up = up;
async function up(knex) {
  await knex.schema.alterTable('seen', table => {
    table.double('progress');
    table.double('duration');
    table.double('startedAt');
    table.string('action');
    table.dropColumn('seasonId');
  });
  await knex('seen').update({
    action: 'watched'
  });
  await knex('seen').whereNotNull('episodeId').update({
    duration: knex('episode').select(knex.raw('runtime * 60 * 1000')).where('id', knex.raw('??', ['seen.episodeId']))
  });
  await knex('seen').whereNotNull('episodeId').whereNull('duration').update({
    duration: knex('mediaItem').select(knex.raw('runtime * 60 * 1000')).where('id', knex.raw('??', ['seen.mediaItemId']))
  });
  await knex('seen').whereNull('episodeId').update({
    duration: knex('mediaItem').select(knex.raw('runtime * 60 * 1000')).where('id', knex.raw('??', ['seen.mediaItemId']))
  });
}
async function down(knex) {
  return knex.schema.alterTable('seen', table => {
    table.dropColumn('progress');
    table.dropColumn('duration');
    table.dropColumn('startedAt');
    table.dropColumn('action');
    table.integer('seasonId').references('id').inTable('season');
  });
}
//# sourceMappingURL=20220209000937_seen.js.map