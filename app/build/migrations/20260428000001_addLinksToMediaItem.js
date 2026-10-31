"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.down = down; exports.up = up;
async function up(knex) {
  const has = await knex.schema.hasColumn('mediaItem', 'links');
  if (!has) await knex.schema.alterTable('mediaItem', t => t.text('links').defaultTo('[]'));
}
async function down(knex) {
  const has = await knex.schema.hasColumn('mediaItem', 'links');
  if (has) await knex.schema.alterTable('mediaItem', t => t.dropColumn('links'));
}
