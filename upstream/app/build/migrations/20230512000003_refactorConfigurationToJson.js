"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.down = down;
exports.up = up;
async function up(knex) {
  const configuration = await knex('configuration').first();
  await knex.schema.alterTable('configuration', table => {
    table.dropColumn('enableRegistration');
    table.dropColumn('tmdbLang');
    table.dropColumn('audibleLang');
    table.dropColumn('serverLang');
    table.dropColumn('igdbClientId');
    table.dropColumn('igdbClientSecret');
    table.text('configurationJson');
  });
  if (configuration) {
    await knex('configuration').update('configurationJson', JSON.stringify({
      enableRegistration: configuration.enableRegistration,
      tmdbLang: configuration.tmdbLang,
      audibleLang: configuration.audibleLang,
      serverLang: configuration.serverLang,
      igdbClientId: configuration.igdbClientId,
      igdbClientSecret: configuration.igdbClientSecret
    }));
  }
}
async function down(knex) {
  const configurationEntry = await knex('configuration').first();
  await knex.schema.alterTable('configuration', table => {
    table.boolean('enableRegistration');
    table.string('tmdbLang');
    table.string('audibleLang');
    table.string('serverLang');
    table.string('igdbClientId');
    table.string('igdbClientSecret');
    table.dropColumn('configurationJson');
  });
  if (configurationEntry) {
    const configuration = JSON.parse(configurationEntry.configurationJson);
    await knex('configuration').update({
      enableRegistration: configuration.enableRegistration,
      tmdbLang: configuration.tmdbLang,
      audibleLang: configuration.audibleLang,
      serverLang: configuration.serverLang,
      igdbClientId: configuration.igdbClientId,
      igdbClientSecret: configuration.igdbClientSecret
    });
  }
  await knex.schema.alterTable('configuration', table => {
    table.dropNullable('enableRegistration');
  });
}
//# sourceMappingURL=20230512000003_refactorConfigurationToJson.js.map