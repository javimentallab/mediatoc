// patch_37_watchlist_order_added.js
//
// "Lista de seguimiento" (/watchlist) sections are ordered by the moment the
// item was added to the watchlist, newest first — instead of alphabetically.
//
// Three pieces:
//   1. items query  → new `listedAt` orderBy case (listItem.addedAt, the join
//      onto the user's watchlist is already there for `onlyOnWatchlist`).
//   2. routes.js    → 'listedAt' added to the MediaItemOrderBy enum, otherwise
//      the request validator rejects /api/items?orderBy=listedAt with a 400.
//   3. bundle       → the three grids inside _WLS ask for listedAt/desc.
//      Only _WLS is touched; _IPS (/in-progress) keeps title/asc.

;(() => {
const fs = require('fs');

// ---------------------------------------------------------------- 1. backend
const itemsPath = '/app/build/knex/queries/items.js';
let q = fs.readFileSync(itemsPath, 'utf8');
if (q.includes('mt-fork:listedAt-order')) {
  console.log('listedAt order: items query already patched');
} else {
  const anchor = '    switch (orderBy) {';
  if (!q.includes(anchor)) { console.error('listedAt order: switch(orderBy) anchor not found'); process.exit(1); }
  const inject = anchor + '\n' +
    '      /*mt-fork:listedAt-order*/\n' +
    '      case \'listedAt\':\n' +
    '        query.orderByRaw(\'"listItem"."addedAt" \' + sortOrder + \' NULLS LAST\');\n' +
    '        query.orderBy(\'mediaItem.title\', \'asc\');\n' +
    '        break;\n';
  q = q.replace(anchor, inject);
  fs.writeFileSync(itemsPath, q);
  console.log('listedAt order: items query case added');
}

// ----------------------------------------------------------------- 2. routes
const routesPath = '/app/build/generated/routes/routes.js';
let rt = fs.readFileSync(routesPath, 'utf8');
const oldEnum = "enum: ['lastAiring', 'lastSeen', 'mediaType', 'nextAiring', 'progress', 'releaseDate', 'status', 'title', 'unseenEpisodes']";
const newEnum = "enum: ['lastAiring', 'lastSeen', 'listedAt', 'mediaType', 'nextAiring', 'progress', 'releaseDate', 'status', 'title', 'unseenEpisodes']";
if (rt.includes(newEnum)) {
  console.log('listedAt order: routes enum already patched');
} else {
  const n = rt.split(oldEnum).length - 1;
  if (n === 0) { console.error('listedAt order: MediaItemOrderBy enum anchor not found'); process.exit(1); }
  rt = rt.split(oldEnum).join(newEnum);
  fs.writeFileSync(routesPath, rt);
  console.log('listedAt order: routes enum patched (' + n + ' occurrences)');
}

// ----------------------------------------------------------------- 3. bundle
const bundlePath = require('child_process')
  .execSync('ls /app/public/main_*.js | grep -v "\\.LICENSE\\|\\.map"').toString().trim();
let c = fs.readFileSync(bundlePath, 'utf8');

const wlsStart = c.indexOf('_WLS=function(){');
// _WLS ends before its own <h2> title; every grid arg lives above it.
const wlsEnd = c.indexOf('"Lista de seguimiento"', wlsStart);
if (wlsStart < 0 || wlsEnd < 0) { console.error('listedAt order: _WLS anchors not found'); process.exit(1); }

const oldArgs = '{orderBy:"title",sortOrder:"asc"}';
const newArgs = '{orderBy:"listedAt",sortOrder:"desc"}';
let seg = c.slice(wlsStart, wlsEnd);
if (seg.includes(newArgs)) {
  console.log('listedAt order: _WLS already patched');
} else {
  const n = seg.split(oldArgs).length - 1;
  if (n === 0) { console.error('listedAt order: _WLS grid args anchor not found'); process.exit(1); }
  seg = seg.split(oldArgs).join(newArgs);
  c = c.slice(0, wlsStart) + seg + c.slice(wlsEnd);
  fs.writeFileSync(bundlePath, c);
  console.log('listedAt order: _WLS grids now order by listedAt desc (' + n + ' grids)');
}

console.log('patch_37: complete');
})();
