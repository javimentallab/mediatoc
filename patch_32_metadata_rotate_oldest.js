// patch_32_metadata_rotate_oldest.js
//
// The metadata throttle (patch_06) capped each refresh cycle at
// allItems.slice(0, 10) — but itemsToPossiblyUpdate() returns a STABLE order,
// so every cycle refreshed the SAME 10 items and the other ~3.100 never got
// a turn. House of the Dragon sat un-refreshed since 2025-05-07: season 3
// existed with zero episodes/dates, so neither the ficha nor the calendar
// showed the premiere.
//
// Fix: sort oldest-first by lastTimeUpdated before slicing. Refreshed items
// get a fresh timestamp and move to the back of the queue, so the batch
// rotates through the whole library. Cap stays at 10 per cycle (the nightly
// overnight-maintenance.sh does the bulk work).

;(() => {
const fs = require('fs');
const path = '/app/build/updateMetadata.js';
let c = fs.readFileSync(path, 'utf8');

if (c.includes('// rotate-oldest-first')) {
  console.log('metadata rotate: already patched');
  return;
}

const old = 'const mediaItems = allItems.slice(0, 10);';
const fresh = 'const mediaItems = allItems.sort((a, b) => (Number(a.lastTimeUpdated) || 0) - (Number(b.lastTimeUpdated) || 0)).slice(0, 10); // rotate-oldest-first';

if (c.split(old).length - 1 !== 1) {
  console.error('metadata rotate: anchor count != 1');
  process.exit(1);
}
c = c.replace(old, fresh);
fs.writeFileSync(path, c);
try {
  delete require.cache[require.resolve(path)];
  require(path);
  console.log('metadata rotate: throttled batch now rotates oldest-first, syntax OK');
} catch (e) {
  console.error('metadata rotate: SYNTAX ERROR -> ' + String(e.message || '').slice(0, 400));
  process.exit(1);
}
})();
