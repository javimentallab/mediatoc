"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.down = down;
exports.up = up;
var _mediaItemSlug = require("./20220312002700_mediaItemSlug");
async function up(knex) {
  await (0, _mediaItemSlug.fixItemsWithInvalidMediaItemId)(knex);
  return knex.schema.alterTable('season', table => {
    table.unique(['tvShowId', 'seasonNumber']);
  }).alterTable('episode', table => {
    table.unique(['tvShowId', 'seasonNumber', 'episodeNumber']);
  });
}
async function down(knex) {
  return knex.schema.alterTable('season', table => {
    table.dropUnique(['tvShowId', 'seasonNumber']);
  }).alterTable('episode', table => {
    table.dropUnique(['tvShowId', 'seasonNumber', 'episodeNumber']);
  });
}
//# sourceMappingURL=20220406165800_uniqueSeasonAndEpisodeNumbers.js.map