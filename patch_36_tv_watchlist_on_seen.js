// patch_36_tv_watchlist_on_seen.js
//
// BUG: a finished TV show with every aired episode watched stayed in the
// watchlist ("Pendientes") even though the ficha showed it as completed.
// Reported 2026-07-16; 5 shows stuck (Castle Rock, Evil, The Night Of,
// "Cortar por la linea de puntos", "Ultras. Pasion y Muerte").
//
// Root cause: PUT /api/seen (SeenController.add) never touched the
// watchlist -- it still carried the V1 "states independent" comment, a
// policy dropped long ago. Every client path that marks a show/season/
// episode seen goes through `add`, and each was expected to fire its own
// DELETE /api/watchlist:
//   * the Rp modal does, gated by status (patch_30),
//   * the sidebar "Marcar como completado" (_doMark) skips it for TV
//     outright -- `if(a.mediaType!=="tv")` -- so completing a whole series
//     never cleared Pendientes,
//   * marking episodes one by one from the episodes table never did either.
// Only PUT /api/seen/by-external-id (Jellyfin) called the helper.
//
// (A) `add` now awaits _removeFromWatchlistIfComplete for TV items.
//     Awaited (not fire-and-forget) so the refetch the client fires after
//     the PUT sees the updated watchlist. Non-TV is deliberately left
//     alone: the frontend already handles it, and the video_game
//     kind='watched' rule (watching someone else play != played) lives
//     there.
//
// (B) The helper (WL_COMPLETE_V3) counted episodes with no release date or
//     a future one as "remaining", while patch_27's `seen` flag -- what
//     makes the ficha say "completada" -- counts only AIRED unseen ones.
//     A Canceled show with announced-but-never-aired episodes would read
//     as completed and still sit in Pendientes: same bug, different
//     trigger. Align the helper with patch_27: non-special, aired, unseen.
//     The status gate already in the helper (Returning Series / In
//     Production / Planned) is what keeps still-airing shows in Pendientes.

;(() => {
const fs = require('fs');
const child = require('child_process');
const filePath = '/app/build/controllers/seen.js';
const marker = '/*mt-fork:tv-watchlist-on-seen*/';
let c = fs.readFileSync(filePath, 'utf8');

if (c.includes(marker)) {
  console.log('tv watchlist on seen: already patched');
  return;
}

let edits = 0;

// === (A) hook the helper into PUT /api/seen for TV ===
const addOld =
  '      /* mt-fork: states independent — no implicit watchlist mutation on /api/seen */\n' +
  '    }\n' +
  '    res.send();';
const addNew =
  '    }\n' +
  '    ' + marker + '\n' +
  '    if (mediaItem.mediaType === \'tv\') {\n' +
  '      await _removeFromWatchlistIfComplete(userId, mediaItem);\n' +
  '    }\n' +
  '    res.send();';
if (c.split(addOld).length - 1 !== 1) {
  console.error('tv watchlist on seen: add anchor count != 1');
  process.exit(1);
}
c = c.replace(addOld, addNew); edits++;

// === (B) helper "remaining" = aired unseen only (parity with patch_27) ===
const remOld =
  "        const remaining = await knex('episode')\n" +
  "          .where('episode.tvShowId', mediaItem.id)\n" +
  "          .where('episode.isSpecialEpisode', false)\n" +
  "          .where(q => q\n" +
  "            .whereNull('episode.releaseDate')\n" +
  "            .orWhere('episode.releaseDate', '>', today)\n" +
  "            .orWhereNotExists(function() { this.from('seen').whereRaw('seen.episodeId = episode.id').where('seen.userId', userId); })\n" +
  "          )\n" +
  "          .count('* as c').first();";
const remNew =
  "        /*mt-fork:wl-complete-aired-only*/\n" +
  "        const remaining = await knex('episode')\n" +
  "          .where('episode.tvShowId', mediaItem.id)\n" +
  "          .where('episode.isSpecialEpisode', false)\n" +
  "          .whereNotNull('episode.releaseDate')\n" +
  "          .where('episode.releaseDate', '<=', today)\n" +
  "          .whereNotExists(function() { this.from('seen').whereRaw('seen.episodeId = episode.id').where('seen.userId', userId); })\n" +
  "          .count('* as c').first();";
if (c.split(remOld).length - 1 !== 1) {
  console.error('tv watchlist on seen: remaining anchor count != 1');
  process.exit(1);
}
c = c.replace(remOld, remNew); edits++;

fs.writeFileSync(filePath, c);
try {
  child.execSync('node --check ' + filePath, { stdio: 'pipe' });
  console.log('tv watchlist on seen: ' + edits + ' edits, syntax OK');
} catch (e) {
  console.error('tv watchlist on seen: SYNTAX ERROR -> ' + String(e.message || '').slice(0, 300));
  process.exit(1);
}
})();
