// patch_39_episode_progress_hours_minutes.js
//
// Extends patch_38 (hours+minutes progress) to TV episodes. Both entry points
// land on the same Rp branch (`_tvEp`):
//   * the progress bar on an in-progress series card → firstUnwatchedEpisode
//   * the per-episode "Progreso" button inside a series (table row + episode page)
// Until now that branch only had a percent slider.
//
//   Duración total: [ h ] [ min ]
//   ──────────●─────────────
//            0h 23min (46%)
//
// Where the duration comes from, in order: episode.runtime → show runtime →
// 45 min. Most episodes have no runtime (36.480 of 36.977 rows), so when both
// are missing the modal triggers the existing TMDB backfill
// (POST /api/episodes/fetch-runtimes, once per show per session) and adopts the
// real duration as soon as it lands. That endpoint now also answers with the
// runtime of the episode being asked about, and PUT /api/episode-progress
// accepts a runtime so a hand-edited duration sticks to the episode.

;(() => {
const fs = require('fs');

// ------------------------------------------------------------- backend: item
const itemPath = '/app/build/controllers/item.js';
let ic = fs.readFileSync(itemPath, 'utf8');

// 1) setEpisodeProgress persists a hand-edited runtime
if (ic.includes('EP_RUNTIME_V1')) {
  console.log('episode h/m: setEpisodeProgress already patched');
} else {
  const oldUpd = "    await _dbconfig.Database.knex('episode').update({ progress: p }).where('id', episodeId);\n" +
                 "    res.json({ ok: true, progress: p });";
  if (!ic.includes(oldUpd)) { console.error('episode h/m: setEpisodeProgress anchor not found'); process.exit(1); }
  const newUpd = "    /* EP_RUNTIME_V1 */\n" +
                 "    const _rt = req.query.runtime;\n" +
                 "    const _upd = { progress: p };\n" +
                 "    if (_rt !== undefined && _rt !== null && _rt !== '' && !Number.isNaN(Number(_rt))) {\n" +
                 "      _upd.runtime = Math.max(1, Math.round(Number(_rt)));\n" +
                 "    }\n" +
                 "    await _dbconfig.Database.knex('episode').update(_upd).where('id', episodeId);\n" +
                 "    res.json({ ok: true, progress: p, runtime: _upd.runtime });";
  ic = ic.replace(oldUpd, newUpd);
  console.log('episode h/m: setEpisodeProgress accepts runtime');
}

// 2) fetchEpisodeRuntimes reports back the runtime of one episode
if (ic.includes('EP_RUNTIME_ECHO_V1')) {
  console.log('episode h/m: fetchEpisodeRuntimes already patched');
} else {
  const oldRes = "    res.json({ ok: true, updated, totalSeasons });";
  if (!ic.includes(oldRes)) { console.error('episode h/m: fetchEpisodeRuntimes response anchor not found'); process.exit(1); }
  const newRes = "    /* EP_RUNTIME_ECHO_V1 */\n" +
                 "    let episodeRuntime = null;\n" +
                 "    if (req.query.episodeId) {\n" +
                 "      const _e = await _dbconfig.Database.knex('episode').select('runtime').where('id', req.query.episodeId).first();\n" +
                 "      episodeRuntime = _e ? _e.runtime : null;\n" +
                 "    }\n" +
                 "    res.json({ ok: true, updated, totalSeasons, episodeRuntime });";
  ic = ic.replace(oldRes, newRes);
  console.log('episode h/m: fetchEpisodeRuntimes echoes episodeRuntime');
}
fs.writeFileSync(itemPath, ic);

// ----------------------------------------------------------- backend: routes
const routesPath = '/app/build/generated/routes/routes.js';
let rt = fs.readFileSync(routesPath, 'utf8');
let routesDirty = false;

const oldEpProgress = "properties: { episodeId: { type: 'number' }, progress: { type: 'number' } }";
const newEpProgress = "properties: { episodeId: { type: 'number' }, progress: { type: 'number' }, runtime: { type: 'number' } }";
if (rt.includes(newEpProgress)) {
  console.log('episode h/m: episode-progress schema already patched');
} else {
  if (!rt.includes(oldEpProgress)) { console.error('episode h/m: episode-progress schema anchor not found'); process.exit(1); }
  rt = rt.replace(oldEpProgress, newEpProgress);
  routesDirty = true;
  console.log('episode h/m: episode-progress schema accepts runtime');
}

const oldFetchRt = "properties: { mediaItemId: { type: 'number' } },\n    required: ['mediaItemId']\n  }\n}), _MediaItemController.fetchEpisodeRuntimes);";
const newFetchRt = "properties: { mediaItemId: { type: 'number' }, episodeId: { type: 'number' } },\n    required: ['mediaItemId']\n  }\n}), _MediaItemController.fetchEpisodeRuntimes);";
if (rt.includes(newFetchRt)) {
  console.log('episode h/m: fetch-runtimes schema already patched');
} else {
  if (!rt.includes(oldFetchRt)) { console.error('episode h/m: fetch-runtimes schema anchor not found'); process.exit(1); }
  rt = rt.replace(oldFetchRt, newFetchRt);
  routesDirty = true;
  console.log('episode h/m: fetch-runtimes schema accepts episodeId');
}
if (routesDirty) fs.writeFileSync(routesPath, rt);

// ------------------------------------------------------------------- bundle
const bundlePath = require('child_process')
  .execSync('ls /app/public/main_*.js | grep -v "\\.LICENSE\\|\\.map"').toString().trim();
let c = fs.readFileSync(bundlePath, 'utf8');

if (c.includes('RP_EP_HM_V1')) { console.log('episode h/m: bundle already patched'); return; }

// 3) shared "1h 5min" / "23min" formatter, declared next to Rp so every
//    consumer in the module scope can use it.
const rpDecl = 'Rp=function(e){';
if (!c.includes(rpDecl)) { console.error('episode h/m: Rp declaration not found'); process.exit(1); }
c = c.replace(rpDecl,
  '_fmtHM=function(m){m=Math.max(0,Math.round(Number(m)||0));var h=Math.floor(m/60),_m=m%60;return h>0?(h+"h "+_m+"min"):(_m+"min")},' + rpDecl);
console.log('episode h/m: injected _fmtHM helper');

// 4) the duration state seeds from the episode when the modal targets one
const oldMaxD = 'var mu=s((0,r.useState)(t.runtime||600),2),maxD=mu[0],setMaxD=mu[1];';
if (!c.includes(oldMaxD)) { console.error('episode h/m: maxD state anchor not found'); process.exit(1); }
c = c.replace(oldMaxD,
  '/*RP_EP_HM_V1*/var mu=s((0,r.useState)((_tvEp&&(_tvEp.runtime||0))||t.runtime||(_tvEp?45:600)),2),maxD=mu[0],setMaxD=mu[1];');
console.log('episode h/m: maxD seeds from episode runtime');

// 5) no runtime anywhere → ask TMDB for the whole show, once per session
const hltbSeed = 'r.useEffect(function(){if(hltb&&!t.runtime&&!_durTouched){var _hv=hltb.normally||hltb.completely||hltb.hastily;if(_hv)setMaxD(Math.max(1,Math.round(_hv)))}},[hltb]);';
if (!c.includes(hltbSeed)) { console.error('episode h/m: hltb seed effect anchor not found (patch_38 missing?)'); process.exit(1); }
c = c.replace(hltbSeed, hltbSeed +
  'r.useEffect(function(){' +
    'if(!_tvEp||_tvEp.runtime||t.runtime)return;' +
    'var _k="rtm_"+t.id;' +
    'try{if(sessionStorage.getItem(_k))return;sessionStorage.setItem(_k,"1")}catch(_){}' +
    'fetch("/api/episodes/fetch-runtimes?mediaItemId="+t.id+"&episodeId="+_tvEp.id,{method:"POST",credentials:"same-origin"})' +
      '.then(function(r){return r.json()})' +
      '.then(function(d){' +
        'if(!d||!d.ok)return;' +
        'if(d.episodeRuntime&&!_durTouched)setMaxD(Math.max(1,Math.round(d.episodeRuntime)));' +
        'if(d.updated){HW.refetchQueries(en(t.id));HW.refetchQueries(["items"])}' +
      '})' +
      '.catch(function(){})' +
  '},[]);');
console.log('episode h/m: TMDB runtime backfill wired into the modal');

// 6) the h/min section now covers episodes; the percent slider is left for a
//    TV show with no target episode (no single duration to speak of)
const oldTimeCond = '(!_tvEp&&!Ro(t))&&r.createElement("div",{style:_sectionStyle},r.createElement("div",{className:"text-lg"},xo._("Set duration in hours and minutes")+":")';
if (!c.includes(oldTimeCond)) { console.error('episode h/m: time section condition anchor not found'); process.exit(1); }
c = c.replace(oldTimeCond, '(_tvEp||!Ro(t))&&r.createElement("div",{style:_sectionStyle},r.createElement("div",{className:"text-lg"},xo._("Set duration in hours and minutes")+":")');

const oldPctCond = '(_tvEp||Ro(t))&&r.createElement(r.Fragment,null,r.createElement("div",{className:"text-lg mt-2"},"Progreso:")';
if (!c.includes(oldPctCond)) { console.error('episode h/m: percent section condition anchor not found'); process.exit(1); }
c = c.replace(oldPctCond, '(!_tvEp&&Ro(t))&&r.createElement(r.Fragment,null,r.createElement("div",{className:"text-lg mt-2"},"Progreso:")');
console.log('episode h/m: episodes switched from percent slider to h/min section');

// 7) drop the now-duplicated "Duración: N min" line from the episode header
const oldDurLine = ',_tvEp.runtime&&r.createElement("div",{className:"text-sm text-gray-400"},xo._("Duration")+": "+_tvEp.runtime+" min")';
if (c.includes(oldDurLine)) {
  c = c.replace(oldDurLine, '');
  console.log('episode h/m: removed duplicated episode duration line');
} else {
  console.log('episode h/m: episode duration line already gone');
}

// 8) saving an episode also stores a hand-edited duration
const oldEpSave = 'fetch("/api/episode-progress?episodeId="+_tvEp.id+"&progress="+(i/100),{method:"PUT",credentials:"same-origin"})';
if (!c.includes(oldEpSave)) { console.error('episode h/m: episode _save anchor not found'); process.exit(1); }
c = c.replace(oldEpSave,
  'fetch("/api/episode-progress?episodeId="+_tvEp.id+"&progress="+(i/100)+(_durTouched?("&runtime="+Number(maxD||0)):""),{method:"PUT",credentials:"same-origin"})');
console.log('episode h/m: episode _save persists hand-edited duration');

// 9) episodes table: duration column in the same h/min format
const oldEpCol = 'i.runtime?i.runtime+" min":""';
if (c.includes(oldEpCol)) {
  c = c.replace(oldEpCol, 'i.runtime?_fmtHM(i.runtime):""');
  console.log('episode h/m: episodes table duration column uses h/min');
} else {
  console.log('episode h/m: episodes table duration column anchor not found (skipped)');
}

fs.writeFileSync(bundlePath, c);
console.log('patch_39: complete');
})();
