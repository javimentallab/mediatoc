"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.up = void 0;
exports.down = void 0;
async function up(knex) {
  // seen: covers backup importJson dedup, "is episode N seen by user U" hot-path
  await knex.raw('CREATE INDEX IF NOT EXISTS seen_user_media_episode_idx ON seen(userId, mediaItemId, episodeId)');
  // userRating: covers all rating lookups across season/episode granularity
  await knex.raw('CREATE INDEX IF NOT EXISTS userrating_user_media_season_episode_idx ON userRating(userId, mediaItemId, seasonId, episodeId)');
  // listItem: dedup during list import + watchlist membership checks
  await knex.raw('CREATE INDEX IF NOT EXISTS listitem_list_media_season_episode_idx ON listItem(listId, mediaItemId, seasonId, episodeId)');
}
async function down(knex) {
  await knex.raw('DROP INDEX IF EXISTS seen_user_media_episode_idx');
  await knex.raw('DROP INDEX IF EXISTS userrating_user_media_season_episode_idx');
  await knex.raw('DROP INDEX IF EXISTS listitem_list_media_season_episode_idx');
}
exports.up = up;
exports.down = down;
//# sourceMappingURL=20260504010000_addPerfIndexesV3.js.map
