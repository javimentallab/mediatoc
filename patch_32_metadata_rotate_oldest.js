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

// A permanently-failing item (e.g. UNIQUE tmdbId collision after a TMDB
// reshuffle, as House of the Dragon was) never advances lastTimeUpdated, so
// with oldest-first it would hog a batch slot forever. Push failures to the
// back of the queue too; the nightly force-refresh retries them anyway.
const catchOld =
  "    } catch (error) {\n" +
  "      if (!String(error.message || '').includes('UNIQUE constraint failed: episode.tmdbId')) _logger.logger.error(_chalk.default.red(error.toString()));\n" +
  "      numberOfFailures++;\n" +
  "    }";
const catchNew =
  "    } catch (error) {\n" +
  "      if (!String(error.message || '').includes('UNIQUE constraint failed: episode.tmdbId')) _logger.logger.error(_chalk.default.red(error.toString()));\n" +
  "      numberOfFailures++;\n" +
  "      // rotate-failed-to-back\n" +
  "      try { await require('/app/build/dbconfig').Database.knex('mediaItem').where('id', mediaItem.id).update({ lastTimeUpdated: new Date().getTime() }); } catch (_) {}\n" +
  "    }";
if (c.split(catchOld).length - 1 !== 1) {
  console.error('metadata rotate: catch anchor count != 1');
  process.exit(1);
}
c = c.replace(catchOld, catchNew);
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
