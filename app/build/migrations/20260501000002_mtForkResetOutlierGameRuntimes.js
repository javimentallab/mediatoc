"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.up = void 0;
exports.down = void 0;
async function up(knex) {
  // 30000 min = 500h. Anything above that is IGDB telling us the game is
  // effectively endless (MMOs, sandbox, live-service) — skip from the total.
  await knex.raw(`UPDATE mediaItem SET runtime = NULL WHERE mediaType = ? AND runtime > ?`, ['video_game', 30000]);
}
async function down(knex) {
  // No-op — old values are gone; re-fetch via the IGDB time-to-beat refresh.
}
exports.up = up;
exports.down = down;
