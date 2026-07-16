// patch_30_sidebar_complete_atomic.js
//
// The detail-page sidebar "Marcar como completado" (patch_04 sidebar grid)
// had three defects for non-TV items:
//   1. It fired un({progress:1}) (unawaited) AND a PUT /api/seen — the
//      backend progress=1 path ALSO inserts a seen row, so every click
//      produced a duplicate seen entry ("Visto 2 veces"). Confirmed in DB
//      (Ick, Freaks: two rows in the same second).
//   2. The refetch ran after only the /api/seen call resolved, racing the
//      un() request that clears progress/watchlist — the UI (and react-query
//      cache) kept showing the item on Progreso/Pendiente after completing.
//   3. It never cleared the actively-in-progress flag (patch_21 fixed only
//      the Rp modal), so AIP-pinned items stayed in /in-progress.
//
// Fix: drop un(progress:1) entirely; _doMark now awaits seen + progress=0 +
// watchlist DELETE + AIP DELETE (non-TV only) before refetching. The
// "Quitar completado" branch gets the same treatment (progress=0 awaited
// inside the Promise.all instead of an unawaited un() afterwards).
//
// Also: the Rp modal fired the watchlist DELETE for TV shows whose
// firstUnwatchedEpisode was null (fully-watched-so-far returning shows,
// e.g. Silo) — completing them silently dropped the show from Pendiente.
// Gate that path with the same status check the episode path already uses.

;(() => {
const fs = require('fs');
const child = require('child_process');
const bundlePath = child.execSync('ls /app/public/main_*.js | grep -v "\\.LICENSE\\|\\.map"').toString().trim();
let c = fs.readFileSync(bundlePath, 'utf8');

if (c.includes('/*mt-fork:sidebar-complete-atomic*/')) {
  console.log('sidebar complete atomic: already patched');
  return;
}

let edits = 0;

// (1)+(2)+(3): sidebar mark branch
const markOld =
  'un({mediaItemId:a.id,progress:1});var _doMark=function(dur){' +
  'var url="/api/seen?mediaItemId="+a.id+"&lastSeenAt=now"+(dur?"&duration="+dur:"");' +
  'return fetch(url,{method:"PUT",credentials:"same-origin"})' +
  '.then(function(){HW.refetchQueries(en(a.id));HW.refetchQueries(["items"])});' +
  '};';
const markNew =
  '/*mt-fork:sidebar-complete-atomic*/var _doMark=function(dur){' +
  'var url="/api/seen?mediaItemId="+a.id+"&lastSeenAt=now"+(dur?"&duration="+dur:"");' +
  'var _ps=[fetch(url,{method:"PUT",credentials:"same-origin"})];' +
  'if(a.mediaType!=="tv"){' +
    '_ps.push(fetch("/api/progress?mediaItemId="+a.id+"&date="+Date.now()+"&progress=0",{method:"PUT",credentials:"same-origin"}).catch(function(){}));' +
    '_ps.push(fetch("/api/watchlist?mediaItemId="+a.id,{method:"DELETE",credentials:"same-origin"}).catch(function(){}));' +
    '_ps.push(fetch("/api/actively-in-progress/"+a.id,{method:"DELETE",credentials:"same-origin"}).catch(function(){}));' +
  '}' +
  'return Promise.all(_ps).then(function(){HW.refetchQueries(en(a.id));HW.refetchQueries(["items"])});' +
  '};';
if (c.split(markOld).length - 1 !== 1) {
  console.error('sidebar complete atomic: mark anchor count != 1');
  process.exit(1);
}
c = c.replace(markOld, markNew); edits++;

// (2) for the "Quitar completado" branch: move progress=0 into the awaited set
const quitarOld =
  '.then(function(){un({mediaItemId:a.id,progress:0,duration:0});HW.refetchQueries(en(a.id));HW.refetchQueries(["items"])});';
const quitarNew =
  '.then(function(){return fetch("/api/progress?mediaItemId="+a.id+"&date="+Date.now()+"&progress=0",{method:"PUT",credentials:"same-origin"}).catch(function(){})})' +
  '.then(function(){HW.refetchQueries(en(a.id));HW.refetchQueries(["items"])});';
if (c.split(quitarOld).length - 1 !== 1) {
  console.error('sidebar complete atomic: quitar anchor count != 1');
  process.exit(1);
}
c = c.replace(quitarOld, quitarNew); edits++;

// Rp modal: don't drop still-airing TV shows from the watchlist when
// _tvEp is null (all released episodes already seen).
const modalOld = 'if(!_tvEp){promises.push(_wlDel());}else if(';
const modalNew = 'if(!_tvEp){if(t.mediaType!=="tv"||["Returning Series","In Production","Planned"].indexOf(t.status)<0){promises.push(_wlDel());}}else if(';
if (c.split(modalOld).length - 1 !== 1) {
  console.error('sidebar complete atomic: modal wlDel anchor count != 1');
  process.exit(1);
}
c = c.replace(modalOld, modalNew); edits++;

fs.writeFileSync(bundlePath, c);
try {
  child.execSync('node --check ' + bundlePath, { stdio: 'pipe' });
  console.log('sidebar complete atomic: ' + edits + ' edits, bundle syntax OK');
} catch (e) {
  console.error('sidebar complete atomic: SYNTAX ERROR -> ' + String(e.message || '').slice(0, 300));
  process.exit(1);
}
})();
