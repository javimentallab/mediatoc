// patch_40_progress_sync_views.js
//
// "Escribo el progreso en la carátula y dentro no cambia, y al revés."
// Two independent causes, both fixed here. Neither is specific to TV: the
// same desync hits movies, books, audiobooks and games.
//
// (1) refetchQueries only touches ACTIVE queries (react-query v3). Writing
//     progress from the card refetches the grid you are looking at, but the
//     detail page's ["details", id] query is inactive at that moment, so it
//     keeps its cached copy and — with staleTime 30s (60s for ["items"]) —
//     serves it again when you navigate there. invalidateQueries marks
//     inactive queries stale too, so the next mount refetches. List pages
//     (["listItems", id]) were never invalidated by anything, so they are
//     added explicitly.
//
// (2) repository/list.js read episode progress from the `progress` TABLE
//     (joins mediaItemFueProgress / episodeProgress on progress.episodeId),
//     while the UI writes it to the `episode.progress` COLUMN through
//     PUT /api/episode-progress — which is also what items.js and details.js
//     read. That table has 0 rows with episodeId, so on list pages every
//     series card reads 0% no matter what you save, and the modal opened
//     from there starts at 0 and writes somewhere the page never reads.
//     COALESCE keeps the legacy join as a fallback in case a scrobbler ever
//     writes episode rows there.

;(() => {
const fs = require('fs');

// ------------------------------------------------- (2) list query parity
const listPath = '/app/build/repository/list.js';
let l = fs.readFileSync(listPath, 'utf8');
if (l.includes('mt-fork:list-episode-progress-column')) {
  console.log('progress sync: list.js already patched');
} else {
  const oldFue = "'mediaItem.firstUnwatchedEpisode.progress': 'mediaItemFueProgress.progress',";
  const newFue = "/*mt-fork:list-episode-progress-column*/'mediaItem.firstUnwatchedEpisode.progress': " +
    "_dbconfig.Database.knex.raw('COALESCE(\"mediaItemFirstUnwatchedEpisode\".\"progress\", \"mediaItemFueProgress\".\"progress\")'),";
  if (!l.includes(oldFue)) { console.error('progress sync: fue progress select anchor not found'); process.exit(1); }
  l = l.replace(oldFue, newFue);

  const oldEp = "'episode.progress': 'episodeProgress.progress',";
  const newEp = "'episode.progress': " +
    "_dbconfig.Database.knex.raw('COALESCE(\"episode\".\"progress\", \"episodeProgress\".\"progress\")'),";
  if (!l.includes(oldEp)) { console.error('progress sync: episode progress select anchor not found'); process.exit(1); }
  l = l.replace(oldEp, newEp);

  fs.writeFileSync(listPath, l);
  console.log('progress sync: list.js now reads episode.progress (COALESCE with the legacy progress table)');
}

// --------------------------------------------- (1) client cache invalidation
const bundlePath = require('child_process')
  .execSync('ls /app/public/main_*.js | grep -v "\\.LICENSE\\|\\.map"').toString().trim();
let c = fs.readFileSync(bundlePath, 'utf8');

if (c.includes('RQ_INVALIDATE_V1')) {
  console.log('progress sync: bundle already patched');
  return;
}

// Only our own call sites (HW is the app QueryClient); react-query's internal
// this.refetchQueries implementation is left alone.
const oldCall = 'HW.refetchQueries(';
const n = c.split(oldCall).length - 1;
if (n === 0) { console.error('progress sync: no HW.refetchQueries call sites found'); process.exit(1); }
c = c.split(oldCall).join('HW.invalidateQueries(');
console.log('progress sync: ' + n + ' refetchQueries call sites → invalidateQueries');

// List pages live under their own query key and nothing ever invalidated them.
const itemsInv = 'HW.invalidateQueries(["items"])';
const itemsInvNew = '(HW.invalidateQueries(["items"]),HW.invalidateQueries(["listItems"]))';
const m = c.split(itemsInv).length - 1;
if (m === 0) { console.error('progress sync: no items invalidation to extend'); process.exit(1); }
c = c.split(itemsInv).join(itemsInvNew);
console.log('progress sync: ' + m + ' items invalidations also invalidate ["listItems"]');

c = c.replace('Rp=function(e){', '/*RQ_INVALIDATE_V1*/Rp=function(e){');

fs.writeFileSync(bundlePath, c);
console.log('patch_40: complete');
})();
