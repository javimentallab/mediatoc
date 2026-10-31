"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.up = void 0;
exports.down = void 0;
async function up(knex) {
  // mediaocd: per-user "I gave up on this" flag. Excluded from Pendiente, listed
  // separately on /abandonados. Composite PK so toggling on/off is idempotent.
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS abandoned (
      userId INTEGER NOT NULL,
      mediaItemId INTEGER NOT NULL,
      date BIGINT NOT NULL,
      PRIMARY KEY (userId, mediaItemId),
      FOREIGN KEY (userId) REFERENCES user(id),
      FOREIGN KEY (mediaItemId) REFERENCES mediaItem(id)
    )
  `);
  await knex.raw('CREATE INDEX IF NOT EXISTS abandoned_userid_index ON abandoned(userId)');
  await knex.raw('CREATE INDEX IF NOT EXISTS abandoned_mediaitemid_index ON abandoned(mediaItemId)');
}
async function down(knex) {
  await knex.raw('DROP INDEX IF EXISTS abandoned_userid_index');
  await knex.raw('DROP INDEX IF EXISTS abandoned_mediaitemid_index');
  await knex.raw('DROP TABLE IF EXISTS abandoned');
}
exports.up = up;
exports.down = down;
