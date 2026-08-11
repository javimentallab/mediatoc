// patch_41_youtube_watched_resilient.js
//
// "En /youtube, durante un rato los botones de 'Marcar visto' no marcan: se
//  quedan un instante y se desmarcan solos. Pasado un rato ya funcionan."
//
// Lo que pasaba de verdad (nginx access.log, 11-ago 03:42 vs 03:48):
//   POST /api/youtube/watched → 400 113 (x11)   ... y seis minutos después
//   POST /api/youtube/watched → 200             (x6, mismos vídeos)
// El 400 de 113 bytes es exactamente
//   {"error":"No se pudo obtener la duración del vídeo (OAuth: Google OAuth not connected (Settings → YouTube))"}
// es decir: NO se guardaba nada, porque youtubeMarkWatched aborta si no logra
// la duración. Con OAuth sin conectar (data.auth === undefined en
// /storage/youtube-1.json) la única vía es el scrape de la página de /watch, y
// ese scrape falla a ratos: el Mint sale a internet por Mullvad (AS9009 M247,
// exit compartido) y YouTube le sirve de vez en cuando la interstitial de
// consent/bot en vez del reproductor → el HTML llega con 200 pero sin
// `"lengthSeconds":"…"` → 400 → el botón vuelve a gris. Cuando el exit deja de
// estar marcado, el mismo vídeo se marca a la primera. De ahí el "pasado un
// rato ya va".
//
// Tres arreglos:
//
// (1) Duración vía Innertube (POST /youtubei/v1/player, cliente WEB) antes del
//     scrape. Son ~4 KB de JSON en vez de 1,3 MB de HTML y —comprobado contra
//     el propio contenedor— devuelve videoDetails.lengthSeconds incluso cuando
//     playabilityStatus es UNPLAYABLE, que es justo lo que responde YouTube a
//     la IP de Mullvad en sus ventanas malas. El scrape se queda de segunda
//     opción, ahora con cookie CONSENT y aceptando también approxDurationMs.
//
// (2) Marcar ya no depende de conseguir la duración. Si las dos vías fallan, el
//     vídeo se guarda igual con durationSeconds:0 y durationPending:true, y la
//     respuesta es 200. Las pendientes se resuelven solas en segundo plano
//     desde /api/youtube/watched-stats (máx. 8 por llamada), así que el total de
//     horas se cura solo sin que el usuario toque nada.
//
// (3) Write-after-read: mark/unmark leían el JSON, se iban 1-3 s a la red y
//     escribían su copia entera. Dos marcados seguidos (que es como se usa la
//     página) y el segundo pisaba al primero → otra forma de "se desmarca solo".
//     Ahora se relee el fichero justo antes de escribir y se fusiona.
//
// Frontend: el botón se pinta optimista y se revierte si el POST falla, y el
// error se muestra en la sección de vídeos. Antes el `msg` de error se
// renderizaba DENTRO del desplegable "Mis canales", que está plegado por
// defecto: el fallo era literalmente invisible.

;(() => {
const fs = require('fs');

// =========================================================== BACKEND
const path = '/app/build/controllers/item.js';
let c = fs.readFileSync(path, 'utf8');

if (c.includes('mt-fork:yt-duration-resilient')) {
  console.log('yt watched resilient: item.js already patched');
} else {
  // --- (1) helpers: _ytLookupDuration + _ytResolvePending -------------------
  // Strip prior versions so re-applies are idempotent.
  c = c.replace(/  _ytLookupDuration = [\s\S]*?\n  \};\n/g, '');
  c = c.replace(/  _ytResolvePending = [\s\S]*?\n  \};\n/g, '');

  const helpers = `  /*mt-fork:yt-duration-resilient*/
  _ytLookupDuration = async (videoId) => {
    // Innertube player endpoint. Small payload and it still carries
    // videoDetails.lengthSeconds when playabilityStatus is UNPLAYABLE/LOGIN_REQUIRED,
    // which is what YouTube answers our egress IP during its bot-check windows.
    try {
      const r = await fetch('https://www.youtube.com/youtubei/v1/player?key=AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
        body: JSON.stringify({
          videoId,
          context: { client: { clientName: 'WEB', clientVersion: '2.20240726.00.00', hl: 'es', gl: 'ES' } }
        })
      });
      const j = await r.json();
      const n = Number(j && j.videoDetails && j.videoDetails.lengthSeconds);
      if (n > 0) return n;
      console.log('[yt-duration] innertube sin lengthSeconds para ' + videoId +
        ' (http ' + r.status + ', playability ' + ((j && j.playabilityStatus && j.playabilityStatus.status) || '?') + ')');
    } catch (e) {
      console.log('[yt-duration] innertube ha fallado para ' + videoId + ': ' + e.message);
    }
    // Fallback: scrape the watch page.
    try {
      const r = await fetch('https://www.youtube.com/watch?v=' + encodeURIComponent(videoId), {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9',
          'Cookie': 'CONSENT=YES+cb'
        }
      });
      const html = await r.text();
      const m = html.match(/"lengthSeconds":"(\\d+)"/);
      if (m) return Number(m[1]);
      const ms = html.match(/"approxDurationMs":"(\\d+)"/);
      if (ms) return Math.round(Number(ms[1]) / 1000);
      console.log('[yt-duration] scrape sin duracion para ' + videoId +
        ' (http ' + r.status + ', ' + html.length + ' bytes, botcheck=' +
        /consent\\.youtube\\.com|not a bot|unusual traffic/i.test(html) + ')');
    } catch (e) {
      console.log('[yt-duration] scrape ha fallado para ' + videoId + ': ' + e.message);
    }
    return 0;
  };
  _ytResolvePending = async (file) => {
    // Background top-up for entries saved without a duration. Bounded per run and
    // guarded by a global flag so overlapping requests don't fan out to YouTube.
    if (global._ytPendingBusy) return;
    global._ytPendingBusy = true;
    try {
      const fs = require('fs').promises;
      let data;
      try { data = JSON.parse(await fs.readFile(file, 'utf8')); } catch (_) { return; }
      const arr = Array.isArray(data.watched) ? data.watched : [];
      const pending = arr.filter(w => !Number(w.durationSeconds)).slice(0, 8);
      if (pending.length === 0) return;
      const resolved = {};
      for (const w of pending) {
        const s = await this._ytLookupDuration(w.videoId);
        if (s > 0) resolved[w.videoId] = s;
      }
      if (Object.keys(resolved).length === 0) return;
      // Re-read before writing: every writer here persists a full snapshot, and we
      // just spent seconds on the network.
      let fresh;
      try { fresh = JSON.parse(await fs.readFile(file, 'utf8')); } catch (_) { return; }
      if (!Array.isArray(fresh.watched)) return;
      for (const w of fresh.watched) {
        if (resolved[w.videoId]) { w.durationSeconds = resolved[w.videoId]; delete w.durationPending; }
      }
      const _wTmp = file + '.tmp.' + process.pid;
      await fs.writeFile(_wTmp, JSON.stringify(fresh, null, 2));
      await fs.rename(_wTmp, file);
      console.log('[yt-duration] duraciones resueltas en segundo plano: ' + Object.keys(resolved).length);
    } catch (e) {
      console.log('[yt-duration] resolver pendientes ha fallado: ' + e.message);
    } finally {
      global._ytPendingBusy = false;
    }
  };
`;

  const helperAnchor = '  youtubeMarkWatched = (0, _typescriptRoutesToOpenapiServer.createExpressRoute)';
  if (!c.includes(helperAnchor)) { console.error('yt watched resilient: helper anchor not found'); process.exit(1); }
  c = c.replace(helperAnchor, helpers + helperAnchor);

  // --- (2) mark no longer aborts when the duration lookup fails -------------
  const oldScrape =
    "    if (!durationSeconds) {\n" +
    "      try {\n" +
    "        const r = await fetch('https://www.youtube.com/watch?v=' + encodeURIComponent(videoId), {\n" +
    "          headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'en-US,en;q=0.9' }\n" +
    "        });\n" +
    "        const html = await r.text();\n" +
    "        const m = html.match(/\"lengthSeconds\":\"(\\d+)\"/);\n" +
    "        if (m) durationSeconds = Number(m[1]);\n" +
    "      } catch (_) {}\n" +
    "    }\n" +
    "    if (!durationSeconds) {\n" +
    "      res.status(400).json({ error: 'No se pudo obtener la duraci\\u00f3n del v\\u00eddeo' + (oauthErr ? ' (OAuth: ' + oauthErr + ')' : '') });\n" +
    "      return;\n" +
    "    }\n";
  if (!c.includes(oldScrape)) { console.error('yt watched resilient: mark scrape/abort block not found'); process.exit(1); }
  const newScrape =
    "    if (!durationSeconds) durationSeconds = await this._ytLookupDuration(videoId);\n" +
    "    // A duration we cannot resolve right now is not a reason to refuse the mark:\n" +
    "    // save it as pending and let _ytResolvePending fill it in later.\n" +
    "    if (!durationSeconds) console.log('[yt-duration] ' + videoId + ' guardado sin duracion (pendiente)' + (oauthErr ? ' [OAuth: ' + oauthErr + ']' : ''));\n";
  c = c.replace(oldScrape, newScrape);

  // --- (3) re-read + merge instead of writing a stale full snapshot ---------
  const oldPush =
    "    data.watched.push({\n" +
    "      videoId,\n" +
    "      channelId: body.channelId ? String(body.channelId) : null,\n" +
    "      channelName: body.channelName ? String(body.channelName) : null,\n" +
    "      title: body.title ? String(body.title) : null,\n" +
    "      thumbnail: body.thumbnail ? String(body.thumbnail) : null,\n" +
    "      url: body.url ? String(body.url) : ('https://www.youtube.com/watch?v=' + videoId),\n" +
    "      durationSeconds,\n" +
    "      watchedAt: Date.now()\n" +
    "    });\n" +
    "    try { { const _wTmp = file + '.tmp.' + process.pid; await fs.writeFile(_wTmp, JSON.stringify(data, null, 2)); await fs.rename(_wTmp, file); } }\n" +
    "    catch (e) { res.status(500).json({ error: 'persist failed: ' + e.message }); return; }\n" +
    "    res.json({ ok: true, durationSeconds });\n";
  if (!c.includes(oldPush)) { console.error('yt watched resilient: mark push/write block not found'); process.exit(1); }
  const newPush =
    "    const entry = {\n" +
    "      videoId,\n" +
    "      channelId: body.channelId ? String(body.channelId) : null,\n" +
    "      channelName: body.channelName ? String(body.channelName) : null,\n" +
    "      title: body.title ? String(body.title) : null,\n" +
    "      thumbnail: body.thumbnail ? String(body.thumbnail) : null,\n" +
    "      url: body.url ? String(body.url) : ('https://www.youtube.com/watch?v=' + videoId),\n" +
    "      durationSeconds,\n" +
    "      watchedAt: Date.now()\n" +
    "    };\n" +
    "    if (!durationSeconds) entry.durationPending = true;\n" +
    "    // Re-read: the duration lookup above took seconds, and another mark (or the\n" +
    "    // token refresh) may have rewritten the file meanwhile — writing `data` as it\n" +
    "    // was read would drop those entries. No await between read and write, so this\n" +
    "    // is atomic for the single-threaded event loop.\n" +
    "    try { data = JSON.parse(await fs.readFile(file, 'utf8')); } catch (_) {}\n" +
    "    if (!Array.isArray(data.watched)) data.watched = [];\n" +
    "    if (!data.watched.find(w => w.videoId === videoId)) data.watched.push(entry);\n" +
    "    try { { const _wTmp = file + '.tmp.' + process.pid; await fs.writeFile(_wTmp, JSON.stringify(data, null, 2)); await fs.rename(_wTmp, file); } }\n" +
    "    catch (e) { res.status(500).json({ error: 'persist failed: ' + e.message }); return; }\n" +
    "    res.json({ ok: true, durationSeconds, durationPending: !durationSeconds });\n";
  c = c.replace(oldPush, newPush);

  // --- (4) watched-stats kicks the background resolver ----------------------
  const oldStats =
    "    res.json({ count: arr.length, totalSeconds, totalMinutes: Math.round(totalSeconds / 60), videoIds: arr.map(w => w.videoId) });\n";
  if (!c.includes(oldStats)) { console.error('yt watched resilient: stats response not found'); process.exit(1); }
  c = c.replace(oldStats, oldStats +
    "    if (arr.some(w => !Number(w.durationSeconds))) this._ytResolvePending(file).catch(() => {});\n");

  fs.writeFileSync(path, c);
  console.log('yt watched resilient: item.js — innertube duration + non-blocking mark + merge-on-write');
}

// =========================================================== FRONTEND
const bundlePath = require('child_process')
  .execSync('ls /app/public/main_*.js | grep -v "\\.LICENSE\\|\\.map"').toString().trim();
let b = fs.readFileSync(bundlePath, 'utf8');

if (b.includes('/*mt-fork:yt-optimistic*/')) {
  console.log('yt watched resilient: bundle already patched');
} else {
  // Extra state for the (previously invisible) error message.
  const stateAnchor = 'var _markBusyState=r.useState({}),markBusy=_markBusyState[0],setMarkBusy=_markBusyState[1];';
  if (!b.includes(stateAnchor)) { console.error('yt watched resilient: markBusy state anchor not found'); process.exit(1); }
  b = b.replace(stateAnchor, stateAnchor +
    '/*mt-fork:yt-optimistic*/var _markMsgState=r.useState(null),markMsg=_markMsgState[0],setMarkMsg=_markMsgState[1];');

  // Optimistic toggle + revert on failure. Every setState goes through the
  // functional form: the old code closed over stale `markBusy`, so two clicks in
  // a row left a phantom spinner behind.
  const oldMark = b.indexOf('var markWatched=function(v){');
  const endMark = b.indexOf('var formatDate=function', oldMark);
  if (oldMark === -1 || endMark === -1) { console.error('yt watched resilient: markWatched block not found'); process.exit(1); }
  const newMark =
    'var _setBusy=function(id,on){setMarkBusy(function(p){var n=Object.assign({},p);if(on){n[id]=true}else{delete n[id]}return n})};' +
    'var _setSeen=function(v,on){setWatched(function(p){var s=Object.assign({},p.set);if(on){s[v.videoId]=true}else{delete s[v.videoId]}' +
      'return {set:s,count:Math.max(0,p.count+(on?1:-1)),totalSeconds:p.totalSeconds}})};' +
    'var markWatched=function(v){' +
      '_setBusy(v.videoId,true);setMarkMsg(null);_setSeen(v,true);' +
      'var b={videoId:v.videoId,channelId:v.channelId||null,channelName:v.channelName||null,title:v.title||null,thumbnail:v.thumbnail||null,url:v.url||null};' +
      'fetch("/api/youtube/watched",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify(b)})' +
        '.then(function(r){return r.json()})' +
        '.then(function(d){_setBusy(v.videoId,false);if(d.error){_setSeen(v,false);setMarkMsg(d.error)}else{loadWatched()}})' +
        '.catch(function(e){_setBusy(v.videoId,false);_setSeen(v,false);setMarkMsg(String(e.message||e))})' +
    '};' +
    'var unmarkWatched=function(v){' +
      '_setBusy(v.videoId,true);setMarkMsg(null);_setSeen(v,false);' +
      'fetch("/api/youtube/watched/"+encodeURIComponent(v.videoId),{method:"DELETE",credentials:"same-origin"})' +
        '.then(function(r){return r.json()})' +
        '.then(function(d){_setBusy(v.videoId,false);if(d.error){_setSeen(v,true);setMarkMsg(d.error)}else{loadWatched()}})' +
        '.catch(function(e){_setBusy(v.videoId,false);_setSeen(v,true);setMarkMsg(String(e.message||e))})' +
    '};';
  b = b.slice(0, oldMark) + newMark + b.slice(endMark);

  // Show the error where the buttons are, not inside the collapsed channels panel.
  const badgeAnchor = 'r.createElement("div",{className:"mb-3 px-2 text-sm text-gray-600 dark:text-gray-300"},r.createElement("i",{className:"material-icons text-base align-middle mr-1"},"visibility")';
  if (b.indexOf(badgeAnchor) === -1) { console.error('yt watched resilient: watched badge anchor not found'); process.exit(1); }
  b = b.replace(badgeAnchor,
    'markMsg?r.createElement("div",{className:"mb-3 mx-2 p-2 rounded text-sm bg-red-700 text-white"},markMsg):null,' + badgeAnchor);

  fs.writeFileSync(bundlePath, b);
  console.log('yt watched resilient: bundle — optimistic mark/unmark + visible error');
}

})();
