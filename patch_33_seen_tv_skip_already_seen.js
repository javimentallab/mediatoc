// patch_33_seen_tv_skip_already_seen.js
//
// PUT /api/seen without episodeId on a TV show ("Marcar como completado" from
// a card whose firstUnwatchedEpisode is null) bulk-inserts a seen row for
// EVERY released episode — including ones already seen. Result observed in
// the DB: Silo +22 duplicate rows in one second, Euphoria 3×24, AHS several
// batches. The user ends up with a phantom second (or third) pass of the
// whole show when the intent was "mark what's missing".
//
// The season and mark-until-episode branches LOOK protected by
// TvEpisodeFilters.unwatchedEpisodes, but that filter reads
// episode.seenHistory — which tvEpisodeRepository.find() (a plain SELECT)
// never populates — so it is a no-op there too: every bulk branch dupes.
//
// Fix: compute the set of already-seen episodeIds once per request and
// exclude them in all three bulk branches (whole-show, season,
// mark-until-episode). Marking a SPECIFIC episode again (explicit episodeId)
// still works — that's the intentional-rewatch path.

;(() => {
const fs = require('fs');
const path = '/app/build/controllers/seen.js';
const marker = '/* SEEN_TV_SKIP_ALREADY_SEEN_V1 */';
let c = fs.readFileSync(path, 'utf8');

if (c.includes(marker)) {
  console.log('seen tv skip: already patched');
  return;
}

// 1. Compute the prior-seen set right before the branch dispatch.
const dispatchOld = '    if (lastSeenEpisodeId) {';
const dispatchNew =
  '    ' + marker + 'const _priorSeen = new Set((await _seen.seenRepository.find({\n' +
  '      userId: userId,\n' +
  '      mediaItemId: mediaItemId\n' +
  '    })).map(s => s.episodeId).filter(id => id != null));\n' +
  '    if (lastSeenEpisodeId) {';
if (c.split(dispatchOld).length - 1 !== 1) {
  console.error('seen tv skip: dispatch anchor count != 1');
  process.exit(1);
}
c = c.replace(dispatchOld, dispatchNew);

// 2. mark-until-episode branch
const untilOld = 'const seenEpisodes = episodes.filter(_tvepisode.TvEpisodeFilters.unwatchedEpisodes).filter(_tvepisode.TvEpisodeFilters.releasedEpisodes).filter(_tvepisode.TvEpisodeFilters.nonSpecialEpisodes)';
const untilNew = 'const seenEpisodes = episodes.filter(episode => !_priorSeen.has(episode.id)).filter(_tvepisode.TvEpisodeFilters.releasedEpisodes).filter(_tvepisode.TvEpisodeFilters.nonSpecialEpisodes)';
if (c.split(untilOld).length - 1 !== 1) {
  console.error('seen tv skip: until-episode anchor count != 1');
  process.exit(1);
}
c = c.replace(untilOld, untilNew);

// 3. season branch
const seasonOld = 'createMany(episodes.filter(_tvepisode.TvEpisodeFilters.unwatchedEpisodes).filter(_tvepisode.TvEpisodeFilters.nonSpecialEpisodes).filter(_tvepisode.TvEpisodeFilters.releasedEpisodes).map(episode => {';
const seasonNew = 'createMany(episodes.filter(episode => !_priorSeen.has(episode.id)).filter(_tvepisode.TvEpisodeFilters.nonSpecialEpisodes).filter(_tvepisode.TvEpisodeFilters.releasedEpisodes).map(episode => {';
if (c.split(seasonOld).length - 1 !== 1) {
  console.error('seen tv skip: season anchor count != 1');
  process.exit(1);
}
c = c.replace(seasonOld, seasonNew);

// 4. whole-show branch (had NO unwatched filter at all)
const showOld = 'await _seen.seenRepository.createMany(episodes.filter(_tvepisode.TvEpisodeFilters.nonSpecialEpisodes).filter(_tvepisode.TvEpisodeFilters.releasedEpisodes).map(episode => {';
const showNew = 'await _seen.seenRepository.createMany(episodes.filter(episode => !_priorSeen.has(episode.id)).filter(_tvepisode.TvEpisodeFilters.nonSpecialEpisodes).filter(_tvepisode.TvEpisodeFilters.releasedEpisodes).map(episode => {';
if (c.split(showOld).length - 1 !== 1) {
  console.error('seen tv skip: whole-show anchor count != 1');
  process.exit(1);
}
c = c.replace(showOld, showNew);

fs.writeFileSync(path, c);
try {
  delete require.cache[require.resolve(path)];
  require(path);
  console.log('seen tv skip: 4 edits (prior-seen set + 3 bulk branches), syntax OK');
} catch (e) {
  console.error('seen tv skip: SYNTAX ERROR -> ' + String(e.message || '').slice(0, 400));
  process.exit(1);
}
})();
