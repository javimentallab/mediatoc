"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.up = void 0;
exports.down = void 0;
async function up(knex) {
  // Composite index to speed up "is this mediaItem seen by this user" lookups.
  // The existing seen_userid_index forced a 31k-row scan per outer row in queries
  // like "tv shows in progress" — this drops them from ~9s to ~1ms.
  // Raw SQL with IF NOT EXISTS so this is idempotent across hot-fixes that
  // may have already created the index manually.
  await knex.raw('CREATE INDEX IF NOT EXISTS seen_mediaitem_user_idx ON seen(mediaItemId, userId)');
}
async function down(knex) {
  await knex.raw('DROP INDEX IF EXISTS seen_mediaitem_user_idx');
}
exports.up = up;
exports.down = down;
//# sourceMappingURL=20260428000005_addSeenMediaItemUserIndex.js.map
