// patch_52_filmaffinity_rating.js
//
// "Quiero que en MediaToc me pongas la puntuacion de FilmAffinity en las
//  fichas de las peliculas y de las series [...] el logo y al lado la
//  puntuacion, para que no tenga que pinchar en ningun enlace."
//
// En la ficha de peliculas y series, a continuacion de los logos de IMDb,
// TMDB y compania, aparece una pastilla azul con el logo de FilmAffinity y su
// nota media (p.ej. "7,6"). Pasando el raton se ve el titulo con el que se ha
// emparejado y el numero de votos; pinchando se abre la ficha en FilmAffinity.
// Si no se encuentra la pelicula en FilmAffinity no se pinta nada.
//
// Tres piezas:
//
//   1. /app/public/logo/filmaffinity.png — el logo oficial (logo4.png de su
//      web, "film" amarillo + "affinity" blanco), recortado a 174x42. Es
//      blanco sobre transparente, por eso va sobre el azul de FilmAffinity
//      (#4682b4) en vez de suelto como los demas: sobre el tema claro media
//      palabra desapareceria.
//
//   2. GET /api/filmaffinity?mediaItemId=N (controllers/item.js + routes.js).
//      Detras del login como el resto de /api. Resuelve el ID de FilmAffinity
//      y lee la nota de su ficha:
//
//        a) Wikidata guarda el ID de FilmAffinity (P480). Se busca por IMDb
//           (P345) y por TMDB (P4947 peliculas / P4983 series). Probado con 40
//           items al azar de la biblioteca: 39 aciertos (el que faltaba era un
//           fan film), todos bien emparejados. 99% de las pelis/series de la
//           biblioteca tienen imdbId. Primera consulta de una ficha: ~1,5 s
//           (Wikidata ~0,7 + ficha de FA ~0,6); despues sale de cache.
//        b) Si Wikidata no lo tiene: buscador de FilmAffinity por titulo
//           original y luego por titulo, quedandose solo con un resultado
//           inequivoco por año (+-1, porque FA y TMDB discrepan a menudo en el
//           año de estreno: "Tuner" es 2025 en FA y 2026 en TMDB) y por tipo
//           (serie/pelicula). Si hay dudas, no se empareja.
//
//      La nota sale de la ficha (itemprop ratingValue / ratingCount). Todo se
//      cachea en /storage/filmaffinity-cache.json: la nota 2 dias si el
//      estreno es de los ultimos 6 meses y 14 si es mas viejo; "no esta en FA"
//      3 dias (o 30 si tiene mas de un año); un fallo de red, 1 hora. Una nota
//      caducada se sirve al momento y se refresca por detras; si FA falla, se
//      queda la guardada.
//
//      Precarga: al arrancar (a los 90 s) empieza a recorrer las pelis y
//      series de la biblioteca (vistas o en alguna lista), una cada 20 s, para
//      que la nota ya este al abrir la ficha. La primera vuelta son ~15 h
//      (unas 2.700); despues solo va refrescando lo caducado. Se para sola
//      mientras FA tenga el limite puesto. FILMAFFINITY_WARM=0 la desactiva.
//
//      OJO — por que curl y no https de Node: FilmAffinity esta detras del
//      bot management de Cloudflare, que mira la huella del saludo TLS. Node
//      recibe siempre el reto "Just a moment..." (403, cf-mitigated:
//      challenge) da igual las cabeceras o las opciones TLS (probado TLS 1.2,
//      ALPN, cipher list de OpenSSL). El curl de la imagen (Alpine, OpenSSL)
//      pasa si se limita a TLS 1.2; con TLS 1.3 tambien lo bloquean. No es la
//      IP: desde la IP de casa, sin Mullvad, pasa exactamente lo mismo.
//      Se lanza con execFile (sin shell), de una en una y con 1,5 s entre
//      peticiones. Si FA vuelve a retar, se deja de intentar 10 minutos; si
//      devuelve 429 (limite de peticiones de Cloudflare, salto al hacer ~150
//      seguidas en las pruebas), se espera lo que diga su retry-after.
//
//   3. En el bundle, un componente _FAB al final de la fila de logos de la
//      ficha (rg), solo para mediaType movie/tv.
//
// Debe ejecutarse ANTES de patch_10 (bundle_rename bumpea el hash) y despues
// de patch_07 (que es quien deja el ancla de fin de clase en item.js tal cual
// la usa este patch).

;(() => {
const fs = require('fs');
const child = require('child_process');

const PUB = process.env.MT_PUBLIC || '/app/public';
const BUILD = process.env.MT_BUILD || '/app/build';
const MARKER = 'mt-fork:filmaffinity';

// ---------------------------------------------------------------------------
// 1. Logo
// ---------------------------------------------------------------------------
const LOGO_B64 = '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';
fs.writeFileSync(PUB + '/logo/filmaffinity.png', Buffer.from(LOGO_B64, 'base64'));
console.log('filmaffinity: logo written');

// ---------------------------------------------------------------------------
// 2. Backend
// ---------------------------------------------------------------------------
const ctrlPath = BUILD + '/controllers/item.js';
let ctrl = fs.readFileSync(ctrlPath, 'utf8');

if (ctrl.includes(MARKER)) {
  console.log('filmaffinity: controller already patched');
} else {
  const HELPERS = `
/* ${MARKER} — ver patch_52_filmaffinity_rating.js */
const _FA_CACHE_PATH = '/storage/filmaffinity-cache.json';
const _FA_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
const _FA_WD_UA = 'mediatoc/1.0 (https://github.com/javimentallab/mediatoc)';
const _FA_HOUR = 3600 * 1000;
const _FA_DAY = 24 * _FA_HOUR;
let _faCache = null;
let _faSaveTimer = null;
let _faQueue = Promise.resolve();
let _faBlockedUntil = 0;
const _faInflight = new Map();

function _faLoadCache() {
  if (_faCache) return _faCache;
  try { _faCache = JSON.parse(require('fs').readFileSync(_FA_CACHE_PATH, 'utf8')) || {}; } catch (_) { _faCache = {}; }
  return _faCache;
}
function _faSaveCache() {
  if (_faSaveTimer) return;
  _faSaveTimer = setTimeout(() => {
    _faSaveTimer = null;
    const fs = require('fs');
    const tmp = _FA_CACHE_PATH + '.tmp';
    try {
      fs.writeFileSync(tmp, JSON.stringify(_faCache));
      fs.renameSync(tmp, _FA_CACHE_PATH);
    } catch (e) {
      console.error('filmaffinity: cache write failed:', e.message);
    }
  }, 2000);
}
function _faDecode(s) {
  return String(s)
    .replace(/&#(\\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}
function _faFilmUrl(faId) {
  return 'https://www.filmaffinity.com/es/film' + faId + '.html';
}
// FilmAffinity esta detras del bot management de Cloudflare, que reta a
// cualquier cliente https de Node por su huella TLS; curl con TLS 1.2 pasa.
function _faCurl(url) {
  const run = () => new Promise((resolve, reject) => {
    if (Date.now() < _faBlockedUntil) { reject(new Error('filmaffinity blocked, backing off')); return; }
    require('child_process').execFile('curl', [
      '-sL', '--tls-max', '1.2', '--max-time', '15', '--compressed',
      '-A', _FA_UA, '-H', 'Accept-Language: es-ES,es;q=0.9',
      '-w', '\\n@@FA@@%{http_code}|%header{retry-after}|%{url_effective}', url,
    ], { maxBuffer: 16 * 1024 * 1024 }, (err, stdout) => {
      if (err) { reject(new Error('curl: ' + err.message)); return; }
      const i = stdout.lastIndexOf('\\n@@FA@@');
      if (i < 0) { reject(new Error('curl: no status line')); return; }
      const [code, retryAfter, ...rest] = stdout.slice(i + 7).split('|');
      const r = { status: Number(code), url: rest.join('|'), body: stdout.slice(0, i) };
      if (r.status === 403 || r.body.includes('<title>Just a moment')) {
        _faBlockedUntil = Date.now() + 10 * 60 * 1000;
        reject(new Error('filmaffinity: cloudflare challenge (HTTP ' + r.status + ')'));
        return;
      }
      // Limite de peticiones de FA (Cloudflare, retry-after ~1 min): se respeta
      // en vez de reintentar en cada ficha que se abra.
      if (r.status === 429) {
        const secs = Math.min(Math.max(Number(retryAfter) || 0, 60), 3600);
        _faBlockedUntil = Date.now() + secs * 1000;
        reject(new Error('filmaffinity: rate limited (HTTP 429), retry in ' + secs + ' s'));
        return;
      }
      resolve(r);
    });
  });
  // De una en una y con 1,5 s de respiro entre peticiones.
  const p = _faQueue.then(run, run);
  _faQueue = p.catch(() => {}).then(() => new Promise((ok) => setTimeout(ok, 1500)));
  return p;
}
function _faWdGet(params) {
  const url = 'https://www.wikidata.org/w/api.php?format=json&' + params;
  return new Promise((resolve, reject) => {
    const req = require('https').get(url, {
      headers: { 'user-agent': _FA_WD_UA, accept: 'application/json' },
      timeout: 8000,
    }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (d) => { body += d; });
      res.on('end', () => {
        if (res.statusCode !== 200) { reject(new Error('wikidata HTTP ' + res.statusCode)); return; }
        try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
      });
    });
    req.on('timeout', () => req.destroy(new Error('wikidata timeout')));
    req.on('error', reject);
  });
}
// ID de FilmAffinity (P480) via Wikidata, buscando el item por IMDb (P345) o
// por TMDB (P4947 peli / P4983 serie). Se usa el buscador de la API
// (haswbstatement) y no el SPARQL de query.wikidata.org: este tarda 1-3 s y
// da 502 a ratos; el buscador responde en ~0,7 s con los mismos aciertos.
async function _faWikidata(item) {
  const terms = [];
  if (item.imdbId && /^tt\\d+$/.test(item.imdbId)) terms.push('P345=' + item.imdbId);
  if (Number(item.tmdbId) > 0) terms.push((item.mediaType === 'tv' ? 'P4983' : 'P4947') + '=' + Number(item.tmdbId));
  for (const term of terms) {
    const s = await _faWdGet('action=query&list=search&srlimit=3&srprop=&srsearch='
      + encodeURIComponent('haswbstatement:' + term + ' haswbstatement:P480'));
    const qs = ((s.query && s.query.search) || []).map((x) => x.title).filter((q) => /^Q\\d+$/.test(q));
    if (!qs.length) continue;
    const e = await _faWdGet('action=wbgetentities&props=claims&ids=' + qs.join('|'));
    for (const q of qs) {
      const claims = (e.entities && e.entities[q] && e.entities[q].claims && e.entities[q].claims.P480) || [];
      const v = claims.map((c) => c.mainsnak && c.mainsnak.datavalue && c.mainsnak.datavalue.value)
        .find((x) => /^\\d+$/.test(x || ''));
      if (v) return v;
    }
  }
  return null;
}
function _faPageInfo(html) {
  const avg = html.match(/id="movie-rat-avg"[^>]*content="([\\d.]+)"/);
  const cnt = html.match(/itemprop="ratingCount"[^>]*content="(\\d+)"/);
  const title = html.match(/<meta property="og:title" content="([^"]*)"/);
  const t = title ? _faDecode(title[1]).replace(/\\s+/g, ' ').trim() : null;
  const y = t && t.match(/\\((\\d{4})\\)\\s*$/);
  return {
    isFilm: !!title || html.includes('id="movie-rat-avg"'),
    rating: avg ? Number(avg[1]) : null,
    votes: cnt ? Number(cnt[1]) : null,
    title: t,
    year: y ? Number(y[1]) : null,
    isTv: !!(t && /\\((?:Mini)?[Ss]erie de TV\\)/.test(t)),
  };
}
// Plan B: buscador de FA. Solo vale un resultado inequivoco.
async function _faSearch(item) {
  const year = item.releaseDate ? Number(String(item.releaseDate).slice(0, 4)) : null;
  if (!year) return null;
  const wantTv = item.mediaType === 'tv';
  const names = [...new Set([item.originalTitle, item.title].filter(Boolean).map((s) => String(s).trim()))];
  for (const name of names) {
    const r = await _faCurl('https://www.filmaffinity.com/es/search.php?stext=' + encodeURIComponent(name));
    if (r.status !== 200) continue;
    const direct = r.url.match(/\\/film(\\d+)\\.html/);
    if (direct) {
      const info = _faPageInfo(r.body);
      if (info.year && Math.abs(info.year - year) <= 1 && info.isTv === wantTv) return { faId: direct[1], page: r.body };
      continue;
    }
    const cards = [];
    for (const chunk of r.body.split('data-movie-id="').slice(1)) {
      const id = chunk.match(/^(\\d+)"/);
      const cy = chunk.match(/class="mc-year[^"]*">\\s*(\\d{4})/);
      if (!id || !cy || cards.some((c) => c.id === id[1])) continue;
      const head = chunk.split('mc-director')[0];
      cards.push({ id: id[1], year: Number(cy[1]), isTv: /(?:Mini)?[Ss]erie de TV/.test(head) });
    }
    const near = cards.filter((c) => Math.abs(c.year - year) <= 1 && c.isTv === wantTv);
    const exact = near.filter((c) => c.year === year);
    const pick = exact.length === 1 ? exact[0] : (exact.length === 0 && near.length === 1 ? near[0] : null);
    if (pick) return { faId: pick.id, page: null };
  }
  return null;
}
function _faOut(e) {
  if (!e || !e.faId) return { found: false };
  return { found: true, id: e.faId, url: _faFilmUrl(e.faId), rating: e.rating, votes: e.votes, title: e.title };
}
function _faKey(item) {
  return (item.mediaType === 'tv' ? 't' : 'm') + ':' + (Number(item.tmdbId) > 0 ? Number(item.tmdbId) : 'id' + item.id);
}
// Cuanto dura lo guardado: lo reciente cambia de nota cada dia, lo viejo casi nunca.
function _faTtl(item, found) {
  const rel = item.releaseDate ? Date.parse(item.releaseDate) : NaN;
  const age = Date.now() - rel;
  if (found) return (!isNaN(rel) && age < 180 * _FA_DAY ? 2 : 14) * _FA_DAY;
  return (isNaN(rel) || age < 365 * _FA_DAY ? 3 : 30) * _FA_DAY;
}
// Si lo guardado ha caducado pero tenia nota, se devuelve al momento y se
// refresca por detras. La precarga pasa { wait: true } para esperar al refresco.
function _faLookup(item, opts) {
  const key = _faKey(item);
  const cache = _faLoadCache();
  const hit = cache[key];
  if (hit && Date.now() < hit.exp) return Promise.resolve(_faOut(hit));
  let p = _faInflight.get(key);
  if (!p) {
    p = (async () => {
      const now = Date.now();
      try {
        let faId = hit && hit.faId;
        let page = null;
        let unsure = false;
        if (!faId) {
          try { faId = await _faWikidata(item); } catch (e) { unsure = true; }
          if (!faId) {
            const s = await _faSearch(item);
            if (s) { faId = s.faId; page = s.page; }
          }
        }
        if (!faId) {
          cache[key] = { exp: now + (unsure ? _FA_HOUR : _faTtl(item, false)), faId: null };
          _faSaveCache();
          return { found: false };
        }
        if (!page) {
          const r = await _faCurl(_faFilmUrl(faId));
          if (r.status === 404) {
            cache[key] = { exp: now + _FA_DAY, faId: null };
            _faSaveCache();
            return { found: false };
          }
          if (r.status !== 200) throw new Error('filmaffinity HTTP ' + r.status);
          page = r.body;
        }
        const info = _faPageInfo(page);
        if (!info.isFilm) throw new Error('filmaffinity: unexpected page for ' + faId);
        cache[key] = {
          exp: now + _faTtl(item, true), at: now, faId,
          rating: info.rating, votes: info.votes, title: info.title,
        };
        _faSaveCache();
        return _faOut(cache[key]);
      } catch (e) {
        if (hit && hit.faId) return Object.assign(_faOut(hit), { stale: true });
        return { found: false, error: e.message };
      }
    })();
    _faInflight.set(key, p);
    const mine = p;
    p.then(() => { if (_faInflight.get(key) === mine) _faInflight.delete(key); });
  }
  if (hit && hit.faId && !(opts && opts.wait)) return Promise.resolve(Object.assign(_faOut(hit), { stale: true }));
  return p;
}

// Precarga: recorre poco a poco las pelis y series de la biblioteca (vistas o
// en alguna lista) para que la nota ya este guardada al abrir la ficha. Una
// cada 20 s (~15 h la primera vuelta completa); mientras FA tenga puesto el
// limite, no hace nada. FILMAFFINITY_WARM=0 la desactiva.
const _FA_WARM_EVERY = 20 * 1000;
let _faWarmList = [];
let _faWarmListAt = 0;
async function _faWarmTick() {
  if (Date.now() < _faBlockedUntil) return;
  if (!_faWarmList.length || Date.now() - _faWarmListAt > _FA_HOUR) {
    _faWarmList = await _dbconfig.Database.knex.raw(
      "SELECT m.id, m.mediaType, m.title, m.originalTitle, m.releaseDate, m.imdbId, m.tmdbId FROM mediaItem m " +
      "WHERE m.mediaType IN ('movie', 'tv') AND (EXISTS (SELECT 1 FROM seen s WHERE s.mediaItemId = m.id) " +
      "OR EXISTS (SELECT 1 FROM listItem li WHERE li.mediaItemId = m.id)) ORDER BY m.id DESC");
    _faWarmListAt = Date.now();
  }
  // Primero lo que nunca se ha buscado; despues lo caducado hace mas tiempo.
  const cache = _faLoadCache();
  const now = Date.now();
  let next = null;
  let nextExp = Infinity;
  for (const it of _faWarmList) {
    const hit = cache[_faKey(it)];
    if (!hit) { next = it; break; }
    if (hit.exp <= now && hit.exp < nextExp) { next = it; nextExp = hit.exp; }
  }
  if (next) await _faLookup(next, { wait: true });
}
if (process.env.FILMAFFINITY_WARM !== '0' && !global.__mtFaWarm) {
  global.__mtFaWarm = true;
  const loop = () => {
    _faWarmTick()
      .catch((e) => console.error('filmaffinity warm:', e.message))
      .then(() => { const t = setTimeout(loop, _FA_WARM_EVERY); if (t.unref) t.unref(); });
  };
  const t0 = setTimeout(loop, 90 * 1000);
  if (t0.unref) t0.unref();
}
`;

  const METHOD = `  /* ${MARKER} */
  filmaffinityRating = (0, _typescriptRoutesToOpenapiServer.createExpressRoute)(async (req, res) => {
    const id = Number(req.query.mediaItemId);
    if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: 'mediaItemId required' }); return; }
    const item = await _dbconfig.Database.knex('mediaItem')
      .select('id', 'mediaType', 'title', 'originalTitle', 'releaseDate', 'imdbId', 'tmdbId')
      .where('id', id).first();
    if (!item) { res.status(404).json({ error: 'mediaItem not found' }); return; }
    if (item.mediaType !== 'movie' && item.mediaType !== 'tv') { res.json({ found: false }); return; }
    res.json(await _faLookup(item));
  });
`;

  const classAnchor = '\nclass MediaItemController {';
  const endAnchor = '}\nexports.MediaItemController = MediaItemController;';
  for (const [name, a] of [['class', classAnchor], ['end-of-class', endAnchor]]) {
    const n = ctrl.split(a).length - 1;
    if (n !== 1) throw new Error('filmaffinity: expected 1 ' + name + ' anchor in item.js, found ' + n);
  }
  ctrl = ctrl.replace(classAnchor, () => HELPERS + classAnchor);
  ctrl = ctrl.replace(endAnchor, () => METHOD + endAnchor);
  fs.writeFileSync(ctrlPath, ctrl);
  child.execFileSync(process.execPath, ['--check', ctrlPath], { stdio: 'inherit' });
  console.log('filmaffinity: controller method + helpers installed');
}

const routesPath = BUILD + '/generated/routes/routes.js';
let routes = fs.readFileSync(routesPath, 'utf8');
if (routes.includes("'/api/filmaffinity'")) {
  console.log('filmaffinity: route already registered');
} else {
  const anchor = "router.get('/api/youtube/feed'";
  if (routes.split(anchor).length - 1 !== 1) throw new Error('filmaffinity: routes anchor not found exactly once');
  routes = routes.replace(anchor, () =>
    "router.get('/api/filmaffinity', validatorHandler({}), _MediaItemController.filmaffinityRating);\n" + anchor);
  fs.writeFileSync(routesPath, routes);
  child.execFileSync(process.execPath, ['--check', routesPath], { stdio: 'inherit' });
  console.log('filmaffinity: GET /api/filmaffinity registered');
}

// ---------------------------------------------------------------------------
// 3. Frontend
// ---------------------------------------------------------------------------
const bundlePath = child
  .execSync("ls " + PUB + "/main_*.js | grep -v '\\.LICENSE\\|\\.map'")
  .toString().trim();
let js = fs.readFileSync(bundlePath, 'utf8');

if (js.includes('/*' + MARKER + '*/')) {
  console.log('filmaffinity: bundle already patched');
  return;
}

// Componente: pastilla azul con el logo y la nota. Estilos inline porque el
// CSS de Tailwind esta purgado (gap, items-center, rounded... no existen).
const FAB = '_FAB=function(props){/*' + MARKER + '*/'
  + 'var t=props.mediaItem;var s=r.useState(null),fa=s[0],setFa=s[1];'
  + 'r.useEffect(function(){var alive=true;setFa(null);'
  +   'fetch("/api/filmaffinity?mediaItemId="+t.id,{credentials:"same-origin"})'
  +   '.then(function(x){return x.ok?x.json():null})'
  +   '.then(function(d){if(alive)setFa(d)})'
  +   '.catch(function(){});'
  +   'return function(){alive=false}},[t.id]);'
  + 'if(!fa||!fa.found)return null;'
  + 'var txt=typeof fa.rating==="number"?fa.rating.toFixed(1).replace(".",","):"--";'
  + 'var tip="FilmAffinity"+(fa.title?" \\u00b7 "+fa.title:"")'
  +   '+(fa.votes?" \\u00b7 "+fa.votes.toLocaleString("es-ES")+" votos":"");'
  + 'return r.createElement("a",{href:fa.url,title:tip,className:"flex mr-2",'
  +   'style:{alignItems:"center",gap:"5px",height:"100%",padding:"0 6px",borderRadius:"4px",'
  +   'background:"#4682b4",color:"#fff",textDecoration:"none",whiteSpace:"nowrap"}},'
  +   'r.createElement("img",{src:"logo/filmaffinity.png",alt:"FilmAffinity",style:{height:"14px",width:"auto"}}),'
  +   'r.createElement("span",{style:{fontWeight:700,fontSize:"13px",lineHeight:"1"}},txt))'
  + '},';

const DEF_ANCHOR = 'rg=function(e){var t,n=e.mediaItem,a=Ap().configuration,';
const ROW_OLD = 'n.audibleId&&r.createElement(eg,{href:"https://audible.".concat(i,"/pd/").concat(n.audibleId,'
  + '"?overrideBaseCountry=true&ipRedirectOverride=true"),src:"logo/audible.png"}))},ag=function(){';
const ROW_NEW = 'n.audibleId&&r.createElement(eg,{href:"https://audible.".concat(i,"/pd/").concat(n.audibleId,'
  + '"?overrideBaseCountry=true&ipRedirectOverride=true"),src:"logo/audible.png"}),'
  + '("movie"===n.mediaType||"tv"===n.mediaType)&&r.createElement(_FAB,{mediaItem:n}))},ag=function(){';

for (const [name, a] of [['rg definition', DEF_ANCHOR], ['logo row', ROW_OLD]]) {
  const n = js.split(a).length - 1;
  if (n !== 1) {
    throw new Error('filmaffinity: expected 1 hit for the ' + name + ' anchor, found ' + n
      + ' (did the details page change upstream?)');
  }
}
// rg vive en una cadena "var a=...,b=...": _FAB entra como una declaracion mas.
if (!js.includes('},' + DEF_ANCHOR)) {
  throw new Error('filmaffinity: rg is not part of a comma-separated var chain, aborting');
}

js = js.replace(DEF_ANCHOR, () => FAB + DEF_ANCHOR);
js = js.replace(ROW_OLD, () => ROW_NEW);
fs.writeFileSync(bundlePath, js);
child.execFileSync(process.execPath, ['--check', bundlePath], { stdio: 'inherit' });
console.log('filmaffinity: badge added to the details logo row (' + bundlePath + ')');

})();
