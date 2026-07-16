// patch_29_list_items_progress_columns.js
//
// The list pages (/api/list/items → repository/list.js) never select
// audioProgress nor the first-unwatched-episode progress, so:
//   - a book being LISTENED (audioProgress>0, progress null) shows 0% under
//     the cover on watchlist/custom-list pages while the ficha shows the
//     real % (reported: "Viaje al centro de la Tierra" 31% vs 0%);
//   - TV cards on those pages always render the episode bar at 0%.
// Also, its mediaItemProgress join (unlike items.js and details.js) does not
// exclude progress=1 rows, so a completed pass would render as a stuck 100%.
//
// Three coordinated edits to /app/build/repository/list.js:
//   A. select map: add mediaItem.audioProgress + firstUnwatchedEpisode.progress
//   B. joins: exclude progress=1 in mediaItemProgress; join progress on the
//      first-unwatched episode (mediaItemFueProgress)
//   C. result mapping: expose both fields where the frontend card reads them.

;(() => {
const fs = require('fs');
const path = '/app/build/repository/list.js';
let c = fs.readFileSync(path, 'utf8');

if (c.includes('mediaItemFueProgress')) {
  console.log('list progress columns: already patched');
  return;
}

// A. select map
const selOld = "'mediaItem.progress': 'mediaItemProgress.progress',";
const selNew =
  "'mediaItem.progress': 'mediaItemProgress.progress',\n" +
  "      'mediaItem.audioProgress': 'mediaItem.audioProgress',\n" +
  "      'mediaItem.firstUnwatchedEpisode.progress': 'mediaItemFueProgress.progress',";
if (c.split(selOld).length - 1 !== 1) {
  console.error('list progress columns: select anchor count != 1');
  process.exit(1);
}
c = c.replace(selOld, selNew);

// B. joins
const joinOld = ".leftJoin(qb => qb.from('progress').where('userId', userId).where('episodeId', null).as('mediaItemProgress'), 'mediaItemProgress.mediaItemId', 'listItem.mediaItemId')";
const joinNew =
  ".leftJoin(qb => qb.from('progress').where('userId', userId).where('episodeId', null).whereNot('progress', 1).as('mediaItemProgress'), 'mediaItemProgress.mediaItemId', 'listItem.mediaItemId')\n" +
  "    // MediaItem: first unwatched episode progress\n" +
  "    .leftJoin(qb => qb.from('progress').where('userId', userId).whereNotNull('episodeId').as('mediaItemFueProgress'), 'mediaItemFueProgress.episodeId', 'mediaItemFirstUnwatchedEpisode.id')";
if (c.split(joinOld).length - 1 !== 1) {
  console.error('list progress columns: join anchor count != 1');
  process.exit(1);
}
c = c.replace(joinOld, joinNew);

// C. result mapping
const mapProgOld = "progress: listItem['mediaItem.progress'],";
const mapProgNew =
  "progress: listItem['mediaItem.progress'],\n" +
  "          audioProgress: listItem['mediaItem.audioProgress'],";
if (c.split(mapProgOld).length - 1 !== 1) {
  console.error('list progress columns: mapping (progress) anchor count != 1');
  process.exit(1);
}
c = c.replace(mapProgOld, mapProgNew);

const mapFueOld = "releaseDate: listItem['mediaItem.firstUnwatchedEpisode.releaseDate'],";
const mapFueNew =
  "releaseDate: listItem['mediaItem.firstUnwatchedEpisode.releaseDate'],\n" +
  "            progress: listItem['mediaItem.firstUnwatchedEpisode.progress'],";
if (c.split(mapFueOld).length - 1 !== 1) {
  console.error('list progress columns: mapping (fue) anchor count != 1');
  process.exit(1);
}
c = c.replace(mapFueOld, mapFueNew);

fs.writeFileSync(path, c);
try {
  delete require.cache[require.resolve(path)];
  require(path);
  console.log('list progress columns: applied (select + 2 joins + 2 mappings), syntax OK');
} catch (e) {
  console.error('list progress columns: SYNTAX ERROR -> ' + String(e.message || '').slice(0, 400));
  process.exit(1);
}
})();
