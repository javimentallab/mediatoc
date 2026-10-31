"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.down = down;
exports.up = up;
async function up(knex) {
  await knex.schema.alterTable('seen', table => {
    table.string('type');
    table.index('type');
  });
  await knex('seen').where('action', 'started').update({
    type: 'progress',
    progress: 0,
    action: null
  });
  await knex('seen').whereNull('type').update({
    type: 'seen',
    action: null
  });
  await knex.schema.alterTable('seen', table => {
    table.string('type').notNullable().alter({
      alterNullable: true
    });
  });
}
async function down(knex) {
  return knex.schema.alterTable('seen', table => {
    table.dropColumn('type');
  });
}
//# sourceMappingURL=20220217012900_progress.js.map