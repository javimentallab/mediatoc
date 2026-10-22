"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.down = down;
exports.up = up;
var _lodash = _interopRequireDefault(require("lodash"));
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
async function up(knex) {
  await knex.schema.alterTable('configuration', table => {
    table.string('igdbClientId');
    table.string('igdbClientSecret');
  });
  const res = await knex('metadataProviderCredentials');
  const {
    IGDB
  } = _lodash.default.groupBy(res, 'providerName');
  if (IGDB) {
    const {
      CLIENT_ID,
      CLIENT_SECRET
    } = (0, _lodash.default)(IGDB).keyBy('name').mapValues(value => value.value).value();
    if (CLIENT_ID && CLIENT_SECRET) {
      const alteredRows = await knex('configuration').update({
        igdbClientId: CLIENT_ID,
        igdbClientSecret: CLIENT_SECRET
      });
      if (alteredRows === 0) {
        await knex('configuration').insert({
          igdbClientId: CLIENT_ID,
          igdbClientSecret: CLIENT_SECRET
        });
      }
    }
  }
  await knex.schema.dropTable('metadataProviderCredentials');
}
async function down(knex) {
  await knex.schema.createTable('metadataProviderCredentials', table => {
    table.increments('id').primary();
    table.text('providerName').notNullable();
    table.text('name').notNullable();
    table.text('value').notNullable();
    table.index('providerName');
  });
  const {
    igdbClientId,
    igdbClientSecret
  } = (await knex('configuration').first()) || {};
  if (igdbClientId && igdbClientSecret) {
    await knex('metadataProviderCredentials').insert([{
      providerName: 'IGDB',
      name: 'CLIENT_ID',
      value: igdbClientId
    }, {
      providerName: 'IGDB',
      name: 'CLIENT_SECRET',
      value: igdbClientSecret
    }]);
  }
  await knex.schema.alterTable('configuration', table => {
    table.dropColumn('igdbClientId');
    table.dropColumn('igdbClientSecret');
  });
}
//# sourceMappingURL=20220222153600_removeMetadataProviderCredentials.js.map