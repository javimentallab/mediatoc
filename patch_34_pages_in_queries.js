// patch_34_pages_in_queries.js  (requires patch_29)
//
// The Progreso modal derives its page slider from t.numberOfPages||200 —
// but neither /api/items (mapRawResult) nor /api/list/items exposed
// numberOfPages, so opening the modal from ANY card used the 200-page
// default while the ficha (details endpoint, full mediaItem row) used the
// real total (e.g. 483). Same % → different page counts, and saving pages
// from a card recomputed the % against the wrong total.
//
// Fix: expose mediaItem.numberOfPages in both queries. items.js already
// SELECTs it (mediaItemColumns includes numberOfPages) — only the mapping
// was missing. list.js needs select + mapping (anchored on the audioProgress
// entries patch_29 added, so this patch must run after it).

;(() => {
const fs = require('fs');

// A. items.js mapRawResult
{
  const path = '/app/build/knex/queries/items.js';
  let c = fs.readFileSync(path, 'utf8');
  if (c.includes("numberOfPages: row['mediaItem.numberOfPages']")) {
    console.log('pages in queries: items.js already patched');
  } else {
    const old = "audioProgress: row['mediaItem.audioProgress'],";
    const fresh =
      "audioProgress: row['mediaItem.audioProgress'],\n" +
      "    numberOfPages: row['mediaItem.numberOfPages'],";
    if (c.split(old).length - 1 !== 1) {
      console.error('pages in queries: items.js anchor count != 1');
      process.exit(1);
    }
    c = c.replace(old, fresh);
    fs.writeFileSync(path, c);
    try {
      delete require.cache[require.resolve(path)];
      require(path);
      console.log('pages in queries: items.js mapping added, syntax OK');
    } catch (e) {
      console.error('pages in queries: items.js SYNTAX ERROR -> ' + String(e.message || '').slice(0, 400));
      process.exit(1);
    }
  }
}

// B. list.js select + mapping
{
  const path = '/app/build/repository/list.js';
  let c = fs.readFileSync(path, 'utf8');
  if (c.includes("'mediaItem.numberOfPages'")) {
    console.log('pages in queries: list.js already patched');
  } else {
    const selOld = "'mediaItem.audioProgress': 'mediaItem.audioProgress',";
    const selNew =
      "'mediaItem.audioProgress': 'mediaItem.audioProgress',\n" +
      "      'mediaItem.numberOfPages': 'mediaItem.numberOfPages',";
    if (c.split(selOld).length - 1 !== 1) {
      console.error('pages in queries: list.js select anchor count != 1 (patch_29 must run first)');
      process.exit(1);
    }
    c = c.replace(selOld, selNew);

    const mapOld = "audioProgress: listItem['mediaItem.audioProgress'],";
    const mapNew =
      "audioProgress: listItem['mediaItem.audioProgress'],\n" +
      "          numberOfPages: listItem['mediaItem.numberOfPages'],";
    if (c.split(mapOld).length - 1 !== 1) {
      console.error('pages in queries: list.js mapping anchor count != 1');
      process.exit(1);
    }
    c = c.replace(mapOld, mapNew);

    fs.writeFileSync(path, c);
    try {
      delete require.cache[require.resolve(path)];
      require(path);
      console.log('pages in queries: list.js select + mapping added, syntax OK');
    } catch (e) {
      console.error('pages in queries: list.js SYNTAX ERROR -> ' + String(e.message || '').slice(0, 400));
      process.exit(1);
    }
  }
}
})();
