exports.up = async knex => {
  const has = await knex.schema.hasColumn('activelyInProgress', 'excluded');
  if (has) return;
  await knex.schema.alterTable('activelyInProgress', t => {
    t.boolean('excluded').notNullable().defaultTo(false);
  });
};
exports.down = async knex => {
  const has = await knex.schema.hasColumn('activelyInProgress', 'excluded');
  if (!has) return;
  await knex.schema.alterTable('activelyInProgress', t => { t.dropColumn('excluded'); });
};
