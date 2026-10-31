"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.down = down;
exports.up = up;
var _lodash = _interopRequireDefault(require("lodash"));
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
async function up(knex) {
  const progressEntries = await knex('seen').where('type', 'progress');
  const latestProgress = (0, _lodash.default)(progressEntries).groupBy(item => [item.userId, item.mediaItemId, item.episodeId]).mapValues(values => _lodash.default.maxBy(values, value => value.date)).values().value();
  await knex.schema.createTable('progress', table => {
    table.increments('id').primary();
    table.bigInteger('date').notNullable();
    table.integer('mediaItemId').notNullable().references('id').inTable('mediaItem');
    table.integer('episodeId').references('id').inTable('episode');
    table.integer('userId').references('id').inTable('user').notNullable();
    table.double('progress').notNullable();
    table.double('duration');
    table.string('action');
    table.string('device');
    table.index('date');
    table.index('mediaItemId');
    table.index('episodeId');
    table.index('userId');
    table.unique(['userId', 'mediaItemId', 'episodeId']);
  });
  await knex('seen').where('type', 'progress').delete();
  await knex.schema.alterTable('seen', table => {
    table.dropColumn('type');
    table.dropColumn('action');
    table.dropColumn('progress');
    table.dropColumn('startedAt');
  });
  if (latestProgress.length > 0) {
    await knex.batchInsert('progress', latestProgress.map(item => ({
      date: item.date,
      mediaItemId: item.mediaItemId,
      episodeId: item.episodeId,
      userId: item.userId,
      duration: item.duration,
      action: item.action,
      progress: item.progress
    })).filter(item => item.progress), 30);
  }
}
async function down(knex) {
  await knex.schema.alterTable('seen', table => {
    table.double('progress');
    table.double('startedAt');
    table.string('action');
    table.string('type');
  });
  const progress = await knex('progress');
  if (progress.length > 0) {
    await knex.batchInsert('seen', progress.map(item => ({
      date: item.date,
      mediaItemId: item.mediaItemId,
      episodeId: item.episodeId,
      userId: item.userId,
      duration: item.duration,
      action: item.action,
      progress: item.progress,
      type: 'progress'
    })).filter(item => item.progress), 30);
  }
  await knex.schema.dropTable('progress');
}
//# sourceMappingURL=20230501000000_progress.js.map