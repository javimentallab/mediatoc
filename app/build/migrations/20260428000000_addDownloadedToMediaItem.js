"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.down = down;
exports.up = up;
async function up(knex) {
  const has = await knex.schema.hasColumn('mediaItem', 'downloaded');
  if (!has) {
    await knex.schema.alterTable('mediaItem', table => {
      table.boolean('downloaded').defaultTo(false);
    });
  }
}
async function down(knex) {
  const has = await knex.schema.hasColumn('mediaItem', 'downloaded');
  if (has) {
    await knex.schema.alterTable('mediaItem', table => {
      table.dropColumn('downloaded');
    });
  }
}
