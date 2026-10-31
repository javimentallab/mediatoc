"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.up = void 0;
exports.down = void 0;
async function up(knex) {
  // Adds a 'kind' column to seen so we can distinguish "actually played" from
  // "watched only" (e.g. someone watching a gameplay video). Default 'played'
  // preserves prior behavior — every existing row stays 'played'. The "Visto"
  // filter only surfaces items the user has explicitly marked via the
  // "Marcar como visto" button (which inserts kind='watched').
  //
  // (Earlier versions of this migration auto-reclassified rows whose mediaItem
  // was on the watchlist as 'watched'. That conflated being on the watchlist
  // with having been explicitly marked as watched, polluting the Visto filter
  // — removed.)
  await knex.raw("ALTER TABLE seen ADD COLUMN kind TEXT NOT NULL DEFAULT 'played'");
  await knex.raw('CREATE INDEX IF NOT EXISTS seen_kind_index ON seen(kind)');
}
async function down(knex) {
  await knex.raw('DROP INDEX IF EXISTS seen_kind_index');
  await knex.raw('ALTER TABLE seen DROP COLUMN kind');
}
exports.up = up;
exports.down = down;
//# sourceMappingURL=20260429000001_addSeenKind.js.map
