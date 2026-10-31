"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.up = void 0;
exports.down = void 0;
async function up(knex) {
  await knex.schema.table('mediaItem', table => {
    table.index('downloaded', 'mediaitem_downloaded_index');
    table.index('audioProgress', 'mediaitem_audioprogress_index');
    table.index('mediaType', 'mediaitem_mediatype_index');
  });
  await knex.schema.table('episode', table => {
    table.index('progress', 'episode_progress_index');
    table.index(['tvShowId', 'seasonNumber'], 'episode_tvshow_season_index');
  });
}
async function down(knex) {
  await knex.schema.table('mediaItem', table => {
    table.dropIndex('downloaded', 'mediaitem_downloaded_index');
    table.dropIndex('audioProgress', 'mediaitem_audioprogress_index');
    table.dropIndex('mediaType', 'mediaitem_mediatype_index');
  });
  await knex.schema.table('episode', table => {
    table.dropIndex('progress', 'episode_progress_index');
    table.dropIndex(['tvShowId', 'seasonNumber'], 'episode_tvshow_season_index');
  });
}
exports.up = up;
exports.down = down;
//# sourceMappingURL=20260428000004_addPerfIndexes.js.map
