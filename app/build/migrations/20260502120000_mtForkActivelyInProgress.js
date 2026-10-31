exports.up = async knex => {
  const exists = await knex.schema.hasTable('activelyInProgress');
  if (exists) return;
  await knex.schema.createTable('activelyInProgress', t => {
    t.increments('id').primary();
    t.integer('userId').notNullable().references('id').inTable('user');
    t.integer('mediaItemId').notNullable().references('id').inTable('mediaItem');
    t.float('createdAt').notNullable();
    t.unique(['userId', 'mediaItemId']);
    t.index('userId');
    t.index('mediaItemId');
  });
};
exports.down = async knex => {
  await knex.schema.dropTableIfExists('activelyInProgress');
};
