"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.down = down;
exports.up = up;
async function up(knex) {
  const has = await knex.schema.hasColumn('mediaItem', 'numberOfChapters');
  if (!has) {
    await knex.schema.alterTable('mediaItem', table => {
      table.integer('numberOfChapters');
    });
  }
}
async function down(knex) {
  const has = await knex.schema.hasColumn('mediaItem', 'numberOfChapters');
  if (has) {
    await knex.schema.alterTable('mediaItem', table => {
      table.dropColumn('numberOfChapters');
    });
  }
}
