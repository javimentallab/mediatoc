// mediaocd: clean up orphan notificationsHistory rows and install triggers
// so future mediaItem/episode deletes don't re-orphan them. Safe to run
// repeatedly — the WHERE clauses are no-ops when there's nothing to drop,
// and the triggers use IF NOT EXISTS.
exports.up = async function (knex) {
  try {
    await knex.raw("DELETE FROM notificationsHistory WHERE mediaItemId NOT IN (SELECT id FROM mediaItem)");
    await knex.raw("DELETE FROM notificationsHistory WHERE episodeId IS NOT NULL AND episodeId NOT IN (SELECT id FROM episode)");
    await knex.raw("CREATE TRIGGER IF NOT EXISTS mt_fork_mediaitem_cleanup_notifs AFTER DELETE ON mediaItem BEGIN DELETE FROM notificationsHistory WHERE mediaItemId = OLD.id; END");
    await knex.raw("CREATE TRIGGER IF NOT EXISTS mt_fork_episode_cleanup_notifs AFTER DELETE ON episode BEGIN DELETE FROM notificationsHistory WHERE episodeId = OLD.id; END");
  } catch (_) { /* not load-bearing — never block boot */ }
};
exports.down = async function (knex) {
  try {
    await knex.raw('DROP TRIGGER IF EXISTS mt_fork_mediaitem_cleanup_notifs');
    await knex.raw('DROP TRIGGER IF EXISTS mt_fork_episode_cleanup_notifs');
  } catch (_) {}
};
