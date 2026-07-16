// patch_35_list_parity.js  (requires patch_34)
//
// Field-parity defects between /api/list/items (repository/list.js) and the other
// two queries (knex/queries/details.js, knex/queries/items.js). Every card on a
// list page — Pendientes included — is fed by list.js, and both the card (_v) and
// the Progreso modal (Rp) read these fields:
//
//  1. downloaded — never selected. The card renders _DL with d=undefined, so an
//     item with downloaded=1 in the DB paints "arrow_downward" (= not downloaded)
//     on every list page. Worse: /api/downloaded is a server-side TOGGLE
//     (controllers/item.js -> update downloaded ? 0 : 1), so clicking it to
//     "mark as downloaded" actually UN-marks it, while the optimistic UI shows
//     the done tick. 11 watchlist items were in that state when this was found.
//
//  2. status — lowercased here, original case in details.js/items.js. The
//     _markCompleted gate compares against ["Returning Series","In Production",
//     "Planned"] case-sensitively, so marking the last unwatched episode of a
//     still-airing series from a card drops it from the watchlist, while doing
//     the same from the ficha keeps it. No consumer wants the lowercase form
//     (the only bundle reads are that gate and a plain display), so drop
//     .toLowerCase() and match items.js: status: row['mediaItem.status'].
//
//  3. seenWatched — never selected, so the video_game "Visto" eye badge never
//     shows on list pages. Mirrors the items.js leftJoin (seen, kind='watched').

;(() => {
const fs = require('fs');
const path = '/app/build/repository/list.js';
let c = fs.readFileSync(path, 'utf8');
let touched = false;

const fail = (msg) => { console.error('list parity: ' + msg); process.exit(1); };
const once = (needle, what) => {
  const n = c.split(needle).length - 1;
  if (n !== 1) fail(what + ' anchor count = ' + n + ' (expected 1)');
};

// A. select: downloaded  (anchored on the numberOfPages entry patch_34 added)
if (c.includes("'mediaItem.downloaded': 'mediaItem.downloaded'")) {
  console.log('list parity: downloaded select already patched');
} else {
  const selOld = "'mediaItem.numberOfPages': 'mediaItem.numberOfPages',";
  once(selOld, 'select numberOfPages (patch_34 must run first)');
  c = c.replace(selOld, selOld + "\n      'mediaItem.downloaded': 'mediaItem.downloaded',");
  touched = true;
}

// B. map: downloaded  (Boolean(), same shape as items.js mapRawResult)
if (c.includes("downloaded: Boolean(listItem['mediaItem.downloaded'])")) {
  console.log('list parity: downloaded mapping already patched');
} else {
  const mapOld = "numberOfPages: listItem['mediaItem.numberOfPages'],";
  once(mapOld, 'map numberOfPages');
  c = c.replace(mapOld, mapOld + "\n          downloaded: Boolean(listItem['mediaItem.downloaded']),");
  touched = true;
}

// C. map: status keeps its original case (parity with items.js / details.js)
if (c.includes("status: listItem['mediaItem.status'],")) {
  console.log('list parity: status case already patched');
} else {
  const stOld = "status: (_listItem$mediaItemS = listItem['mediaItem.status']) === null || _listItem$mediaItemS === void 0 ? void 0 : _listItem$mediaItemS.toLowerCase(),";
  once(stOld, 'status toLowerCase');
  c = c.replace(stOld, "status: listItem['mediaItem.status'],");
  touched = true;
}

// D. seenWatched: leftJoin + select + map (mirrors items.js seenWatched-flag)
if (c.includes("'seenWatched.mediaItemId'")) {
  console.log('list parity: seenWatched already patched');
} else {
  const joinAnchor = ".orderBy('listItem.id', 'asc');";
  once(joinAnchor, 'orderBy join tail');
  const join =
    "\n    // mt-fork: seenWatched-flag (parity with items.js)\n" +
    "    .leftJoin(qb => qb.select('mediaItemId').from('seen')" +
    ".where('userId', userId).where('kind', 'watched')" +
    ".groupBy('mediaItemId').as('seenWatched'), " +
    "'seenWatched.mediaItemId', 'listItem.mediaItemId')";
  c = c.replace(joinAnchor, join + joinAnchor);

  const selOld = "'mediaItem.downloaded': 'mediaItem.downloaded',";
  once(selOld, 'select downloaded (part A must have run)');
  c = c.replace(selOld, selOld + "\n      'seenWatched.mediaItemId': 'seenWatched.mediaItemId',");

  const mapOld = "downloaded: Boolean(listItem['mediaItem.downloaded']),";
  once(mapOld, 'map downloaded (part B must have run)');
  c = c.replace(mapOld, mapOld + "\n          seenWatched: Boolean(listItem['seenWatched.mediaItemId']),");
  touched = true;
}

if (!touched) {
  console.log('list parity: nothing to do');
  return;
}

fs.writeFileSync(path, c);
try {
  delete require.cache[require.resolve(path)];
  require(path);
  console.log('list parity: list.js downloaded + status case + seenWatched applied, syntax OK');
} catch (e) {
  console.error('list parity: list.js SYNTAX ERROR -> ' + String(e.message || '').slice(0, 400));
  process.exit(1);
}
})();
