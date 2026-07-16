// patch_31_items_basefilter_progress.js
//
// Same hole patch_21 §A fixed for `abandoned`, but for `progress` and
// `activelyInProgress`: the items.js base filter only accepts items that are
// on the watchlist OR have a seen row OR an abandoned row. An item whose only
// user interaction is a progress row (started reading a book straight from
// search, never watchlisted — e.g. "Jasón y los argonautas" at 8%) or an AIP
// row is filtered out of EVERY items query: it can't show up in /in-progress
// nor anywhere else, while its ficha says it's being read.
//
// Fix: two more OR branches in the base filter. Inner subqueries alias the
// progress table (progressBase) so they can't collide with the outer
// leftJoin alias `progress`.

;(() => {
const fs = require('fs');
const path = '/app/build/knex/queries/items.js';
const marker = '/*mt-fork:base-filter-includes-progress-aip*/';
let c = fs.readFileSync(path, 'utf8');

if (c.includes(marker)) {
  console.log('base-filter progress/aip: already applied');
  return;
}

const oldTail = ".orWhereExists(function() { this.from('abandoned').where('abandoned.userId', userId).whereRaw('abandoned.mediaItemId = mediaItem.id'); }));";
const newTail =
  ".orWhereExists(function() { this.from('abandoned').where('abandoned.userId', userId).whereRaw('abandoned.mediaItemId = mediaItem.id'); })" +
  ".orWhereExists(function() { this.from('progress as progressBase').where('progressBase.userId', userId).whereRaw('progressBase.mediaItemId = mediaItem.id'); })" +
  ".orWhereExists(function() { this.from('activelyInProgress as aipBase').where('aipBase.userId', userId).whereRaw('aipBase.mediaItemId = mediaItem.id'); }));" +
  marker;

if (c.split(oldTail).length - 1 !== 1) {
  console.error('base-filter progress/aip: anchor count != 1');
  process.exit(1);
}
c = c.replace(oldTail, newTail);
fs.writeFileSync(path, c);
try {
  delete require.cache[require.resolve(path)];
  require(path);
  console.log('base-filter progress/aip: applied + syntax OK');
} catch (e) {
  console.error('base-filter progress/aip: SYNTAX ERROR -> ' + String(e.message || '').slice(0, 400));
  process.exit(1);
}
})();
