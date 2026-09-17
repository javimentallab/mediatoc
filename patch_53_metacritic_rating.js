// patch_53_metacritic_rating.js
//
// "Quiero de la misma manera la nota de Metacritic de los juegos."
//
// Igual que patch_52 (FilmAffinity) pero para videojuegos: en la ficha de un
// juego, detras del logo de IGDB, aparece el icono de Metacritic y al lado el
// Metascore en su cuadrito de color (verde >= 75, amarillo >= 50, rojo por
// debajo; gris con "tbd" si Metacritic aun no tiene nota). Pasando el raton se
// ve con que juego se ha emparejado; pinchando se abre su pagina.
//
// Piezas:
//
//   1. /app/public/logo/metacritic.svg — el favicon oficial (circulo azul
//      marino con borde amarillo y la "m" blanca); se ve igual en tema claro
//      y oscuro.
//
//   2. GET /api/metacritic?mediaItemId=N (controllers/item.js + routes.js),
//      detras del login. Usa la API que usa la propia web de Metacritic:
//
//        https://backend.metacritic.com/finder/metacritic/search/<titulo>/web
//          ?apiKey=...&mcoTypeId=13
//
//      que devuelve titulo, slug, año y criticScoreSummary.score en una sola
//      llamada (~0,3 s). La apiKey es publica (va incrustada en el HTML de
//      metacritic.com); si la rotan y la API contesta 401/403, se vuelve a
//      leer de la web y se reintenta.
//
//      Wikidata NO sirve aqui (a diferencia de FilmAffinity): el ID numerico
//      de IGDB (P9043) solo aparece como calificador y no se puede buscar, y
//      el ID de Metacritic (P1712) de los juegos va en un formato antiguo con
//      plataforma. Probado con 30 juegos de la biblioteca: 0 resultados.
//
//      Emparejado estricto:
//        - titulo normalizado identico (sin acentos ni puntuacion, "&" = "and"
//          y numeros romanos = arabigos: IGDB dice "Baldur's Gate III" y
//          Metacritic "Baldur's Gate 3");
//        - año a +-3 como mucho, el mas cercano y sin empate. El margen es
//          ancho a proposito: el acceso anticipado y los ports desfasan el
//          año (Darkwood 2017 en IGDB / 2019 en Metacritic, Hell Let Loose
//          2019 / 2021) y los remakes con el mismo titulo quedan mucho mas
//          lejos (Doom 1993 / 2016);
//        - Metacritic pone 2097 a lo que no tiene fecha: solo vale si el juego
//          tampoco ha salido y es el unico candidato;
//        - juego sin fecha en MediaToc: no se empareja.
//      Probado con 30 juegos al azar: 25 emparejados, todos correctos; los 5
//      que no, o no estan en Metacritic con ese titulo (Metal Gear: Ghost
//      Babel, Dying Light: The Beast Restored Land) o tienen fecha dudosa.
//
//      Una nota 0 o null en la API es "sin nota" (tbd). Cache en
//      /storage/metacritic-cache.json: 2 dias si el juego es de los ultimos 6
//      meses (o no ha salido) y 14 si es mas viejo; sin emparejar 3 dias (30
//      si tiene mas de un año). Lo caducado se sirve al momento y se refresca
//      por detras; los errores de red no se cachean. Ante un 429 se para 10
//      minutos.
//
//      Precarga: a los 2 min de arrancar recorre los juegos de la biblioteca
//      (jugados o en alguna lista), uno cada 10 s (~1 h para unos 390).
//      METACRITIC_WARM=0 la desactiva.
//
//   3. En el bundle, un componente _MCB al final de la fila de logos de la
//      ficha, solo para mediaType video_game, justo detras del _FAB de
//      patch_52.
//
// Debe ejecutarse DESPUES de patch_52 (usa su componente como ancla) y ANTES
// de patch_10 (bundle_rename bumpea el hash).

;(() => {
const fs = require('fs');
const child = require('child_process');

const PUB = process.env.MT_PUBLIC || '/app/public';
const BUILD = process.env.MT_BUILD || '/app/build';
const MARKER = 'mt-fork:metacritic';

// ---------------------------------------------------------------------------
// 1. Logo
// ---------------------------------------------------------------------------
const LOGO_B64 = 'PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiPz4KPHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4OCIgaGVpZ2h0PSI4OCI+CjxjaXJjbGUgZmlsbD0iIzAwMUIzNiIgc3Ryb2tlPSIjRkMwIiBzdHJva2Utd2lkdGg9IjQuNiIgY3g9IjQ0IiBjeT0iNDQiIHI9IjQxLjYiLz4KPHBhdGggdHJhbnNmb3JtPSJ0cmFuc2xhdGUoLTEwLTk2MSkgbWF0cml4KDEuMjc1NjYyOSwtMS4zNDg3NzMzLDEuMzY4NTcxNywxLjI2MzQ5ODcsLTI2Ny4wNDcwNiwxMDY2LjA3NDMpIiBmaWxsPSIjRkZGIgpkPSJtMTI2LjczNDM4LDkyLjA4NzAwMiA1LjA1ODU5LDAgMCwyLjgzMjAzMSBjIDEuODA5ODktMi4yMDA1MDEgMy45NjQ4My0zLjMwMDc2IDYuNDY0ODQtMy4zMDA3ODEgMS4zMjgxMSwyLjFlLTUgMi40ODA0NSwuMjczNDU4IDMuNDU3MDMsLjgyMDMxMiAuOTc2NTUsLjU0Njg5NSAxLjc3NzMzLDEuMzczNzE3IDIuNDAyMzUsMi40ODA0NjkgLjkxMTQ0LTEuMTA2NzUyIDEuODk0NTEtMS45MzM1NzQgMi45NDkyMi0yLjQ4MDQ2OSAxLjA1NDY2LTAuNTQ2ODU0IDIuMTgwOTYtMC44MjAyOTEgMy4zNzg5LTAuODIwMzEyIDEuNTIzNDEsMi4xZS01IDIuODEyNDcsLjMwOTI2NSAzLjg2NzE5LC45Mjc3MzQgMS4wNTQ2NiwuNjE4NTA5IDEuODQyNDIsMS41MjY3MTEgMi4zNjMyOCwyLjcyNDYwOSAuMzc3NTcsLjg4NTQzNCAuNTY2MzcsMi4zMTc3MjQgLjU2NjQxLDQuMjk2ODc1IGwgMCwxMy4yNjE3Mi01LjQ4ODI4LDAgMC0xMS44NTU0NyBjLTNlLTUtMi4wNTcyNzctMC4xODg4My0zLjM4NTQwMS0wLjU2NjQxLTMuOTg0Mzc1LTAuNTA3ODQtMC43ODEyMzMtMS4yODkwOS0xLjE3MTg1OC0yLjM0Mzc1LTEuMTcxODc1LTAuNzY4MjUsMS43ZS01LTEuNDkwOTEsLjIzNDM5Mi0yLjE2Nzk3LC43MDMxMjUtMC42NzcxLC40Njg3NjYtMS4xNjUzOCwxLjE1NTYxNC0xLjQ2NDg0LDIuMDYwNTQ3LTAuMjk5NSwuOTA0OTYxLTAuNDQ5MjQsMi4zMzM5OTgtMC40NDkyMiw0LjI4NzEwOCBsIDAsOS45NjA5NC01LjQ4ODI4LDAgMC0xMS4zNjcxOSBjLTJlLTUtMi4wMTgyMTQtMC4wOTc3LTMuMzIwMjk2LTAuMjkyOTctMy45MDYyNDgtMC4xOTUzMy0wLjU4NTkyMi0wLjQ5ODA2LTEuMDIyMTItMC45MDgyLTEuMzA4NTk0LTAuNDEwMTctMC4yODY0NDItMC45NjY4MS0wLjQyOTY3MS0xLjY2OTkzLTAuNDI5Njg4LTAuODQ2MzYsMS43ZS01LTEuNjA4MDgsLjIyNzg4Mi0yLjI4NTE1LC42ODM1OTQtMC42NzcxLC40NTU3NDUtMS4xNjIxMiwxLjExMzI5Ny0xLjQ1NTA4LDEuOTcyNjU2LTAuMjkyOTgsLjg1OTM4OS0wLjQzOTQ2LDIuMjg1MTctMC40Mzk0NSw0LjI3NzM0IGwgMCwxMC4wNzgxMy01LjQ4ODI4LDB6Ii8+Cjwvc3ZnPg==';
fs.writeFileSync(PUB + '/logo/metacritic.svg', Buffer.from(LOGO_B64, 'base64'));
console.log('metacritic: logo written');

// ---------------------------------------------------------------------------
// 2. Backend
// ---------------------------------------------------------------------------
const ctrlPath = BUILD + '/controllers/item.js';
let ctrl = fs.readFileSync(ctrlPath, 'utf8');

if (ctrl.includes(MARKER)) {
  console.log('metacritic: controller already patched');
} else {
  const HELPERS = `
/* ${MARKER} — ver patch_53_metacritic_rating.js */
const _MC_CACHE_PATH = '/storage/metacritic-cache.json';
const _MC_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
const _MC_DAY = 24 * 3600 * 1000;
const _MC_ROMAN = { i: '1', ii: '2', iii: '3', iv: '4', v: '5', vi: '6', vii: '7', viii: '8', ix: '9', x: '10', xi: '11', xii: '12', xiii: '13' };
let _mcKey = '1MOZgmNFxvmljaQR1X9KAij9Mo4xAY3u';
let _mcCache = null;
let _mcSaveTimer = null;
let _mcBlockedUntil = 0;
const _mcInflight = new Map();

function _mcLoadCache() {
  if (_mcCache) return _mcCache;
  try { _mcCache = JSON.parse(require('fs').readFileSync(_MC_CACHE_PATH, 'utf8')) || {}; } catch (_) { _mcCache = {}; }
  return _mcCache;
}
function _mcSaveCache() {
  if (_mcSaveTimer) return;
  _mcSaveTimer = setTimeout(() => {
    _mcSaveTimer = null;
    const fs = require('fs');
    const tmp = _MC_CACHE_PATH + '.tmp';
    try {
      fs.writeFileSync(tmp, JSON.stringify(_mcCache));
      fs.renameSync(tmp, _MC_CACHE_PATH);
    } catch (e) {
      console.error('metacritic: cache write failed:', e.message);
    }
  }, 2000);
}
function _mcGet(url) {
  return new Promise((resolve, reject) => {
    const req = require('https').get(url, {
      headers: { 'user-agent': _MC_UA, accept: 'application/json,text/html' },
      timeout: 10000,
    }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (d) => { body += d; });
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('timeout', () => req.destroy(new Error('metacritic timeout')));
    req.on('error', reject);
  });
}
// La apiKey es la que la web de Metacritic lleva incrustada. Si la rotan, se relee.
async function _mcRefreshKey() {
  const r = await _mcGet('https://www.metacritic.com/game/');
  const m = r.body.match(/apiKey=([A-Za-z0-9]{16,64})/);
  if (!m) throw new Error('metacritic: api key not found on the web page');
  _mcKey = m[1];
}
async function _mcSearch(title) {
  const q = encodeURIComponent(String(title).replace(/[\\/?#%]+/g, ' ').replace(/\\s+/g, ' ').trim());
  const url = () => 'https://backend.metacritic.com/finder/metacritic/search/' + q
    + '/web?apiKey=' + _mcKey + '&offset=0&limit=20&mcoTypeId=13';
  if (Date.now() < _mcBlockedUntil) throw new Error('metacritic rate limited, backing off');
  let r = await _mcGet(url());
  if (r.status === 401 || r.status === 403) {
    await _mcRefreshKey();
    r = await _mcGet(url());
  }
  if (r.status === 429) {
    _mcBlockedUntil = Date.now() + 10 * 60 * 1000;
    throw new Error('metacritic: rate limited (HTTP 429)');
  }
  if (r.status !== 200) throw new Error('metacritic HTTP ' + r.status);
  const d = JSON.parse(r.body);
  return (d.data && d.data.items) || [];
}
function _mcNorm(s) {
  return String(s || '').normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase()
    .replace(/&/g, ' and ').replace(/['\\u2019\`]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()
    .split(' ').map((w) => _MC_ROMAN[w] || w).join(' ');
}
function _mcYear(x) {
  const y = Number(x.premiereYear) || Number(String(x.releaseDate || '').slice(0, 4));
  return y > 1950 && y < 2090 ? y : null;
}
function _mcPick(item, items) {
  const year = item.releaseDate ? Number(String(item.releaseDate).slice(0, 4)) : null;
  if (!year) return null;
  const want = _mcNorm(item.title);
  const same = items.filter((x) => x.typeId === 13 && x.slug && _mcNorm(x.title) === want);
  if (!same.length) return null;
  const close = same
    .map((x) => ({ x, d: _mcYear(x) == null ? null : Math.abs(_mcYear(x) - year) }))
    .filter((c) => c.d != null && c.d <= 3)
    .sort((a, b) => a.d - b.d);
  if (close.length === 1 || (close.length > 1 && close[0].d < close[1].d)) return close[0].x;
  if (close.length) return null;
  const unreleased = new Date(item.releaseDate) > new Date();
  if (unreleased && same.length === 1 && _mcYear(same[0]) == null) return same[0];
  return null;
}
function _mcOut(e) {
  if (!e || !e.slug) return { found: false };
  return {
    found: true,
    url: 'https://www.metacritic.com/game/' + e.slug + '/',
    score: e.score,
    title: e.title,
    year: e.year,
  };
}
function _mcCacheKey(item) {
  return 'g:' + (Number(item.igdbId) > 0 ? Number(item.igdbId) : 'id' + item.id);
}
// Cuanto dura lo guardado: lo reciente (o por salir) cambia a menudo, lo viejo casi nunca.
function _mcTtl(item, found) {
  const rel = item.releaseDate ? Date.parse(item.releaseDate) : NaN;
  const age = Date.now() - rel;
  if (found) return (isNaN(rel) || age < 180 * _MC_DAY ? 2 : 14) * _MC_DAY;
  return (isNaN(rel) || age < 365 * _MC_DAY ? 3 : 30) * _MC_DAY;
}
// Si lo guardado ha caducado se devuelve al momento y se refresca por detras.
// La precarga pasa { wait: true } para esperar al refresco.
function _mcLookup(item, opts) {
  const key = _mcCacheKey(item);
  const cache = _mcLoadCache();
  const hit = cache[key];
  if (hit && Date.now() < hit.exp) return Promise.resolve(_mcOut(hit));
  let p = _mcInflight.get(key);
  if (!p) {
    p = (async () => {
      const now = Date.now();
      try {
        const names = [...new Set([item.title, item.originalTitle].filter(Boolean).map((s) => String(s).trim()))];
        let pick = null;
        for (const name of names) {
          pick = _mcPick(item, await _mcSearch(name));
          if (pick) break;
        }
        if (!pick) {
          cache[key] = { exp: now + _mcTtl(item, false), slug: null };
          _mcSaveCache();
          return { found: false };
        }
        const raw = pick.criticScoreSummary && pick.criticScoreSummary.score;
        const score = Number(raw) > 0 ? Math.round(Number(raw)) : null;
        cache[key] = {
          exp: now + _mcTtl(item, true),
          at: now, slug: pick.slug, score, title: pick.title || null, year: _mcYear(pick),
        };
        _mcSaveCache();
        return _mcOut(cache[key]);
      } catch (e) {
        if (hit && hit.slug) return Object.assign(_mcOut(hit), { stale: true });
        return { found: false, error: e.message };
      }
    })();
    _mcInflight.set(key, p);
    const mine = p;
    p.then(() => { if (_mcInflight.get(key) === mine) _mcInflight.delete(key); });
  }
  if (hit && hit.slug && !(opts && opts.wait)) return Promise.resolve(Object.assign(_mcOut(hit), { stale: true }));
  return p;
}

// Precarga: recorre los juegos de la biblioteca (jugados o en alguna lista),
// uno cada 10 s (~1 h la primera vuelta). METACRITIC_WARM=0 la desactiva.
const _MC_WARM_EVERY = 10 * 1000;
let _mcWarmList = [];
let _mcWarmListAt = 0;
async function _mcWarmTick() {
  if (Date.now() < _mcBlockedUntil) return;
  if (!_mcWarmList.length || Date.now() - _mcWarmListAt > 3600 * 1000) {
    _mcWarmList = await _dbconfig.Database.knex.raw(
      "SELECT m.id, m.mediaType, m.title, m.originalTitle, m.releaseDate, m.igdbId FROM mediaItem m " +
      "WHERE m.mediaType = 'video_game' AND (EXISTS (SELECT 1 FROM seen s WHERE s.mediaItemId = m.id) " +
      "OR EXISTS (SELECT 1 FROM listItem li WHERE li.mediaItemId = m.id)) ORDER BY m.id DESC");
    _mcWarmListAt = Date.now();
  }
  const cache = _mcLoadCache();
  const now = Date.now();
  let next = null;
  let nextExp = Infinity;
  for (const it of _mcWarmList) {
    const hit = cache[_mcCacheKey(it)];
    if (!hit) { next = it; break; }
    if (hit.exp <= now && hit.exp < nextExp) { next = it; nextExp = hit.exp; }
  }
  if (next) await _mcLookup(next, { wait: true });
}
if (process.env.METACRITIC_WARM !== '0' && !global.__mtMcWarm) {
  global.__mtMcWarm = true;
  const loop = () => {
    _mcWarmTick()
      .catch((e) => console.error('metacritic warm:', e.message))
      .then(() => { const t = setTimeout(loop, _MC_WARM_EVERY); if (t.unref) t.unref(); });
  };
  const t0 = setTimeout(loop, 120 * 1000);
  if (t0.unref) t0.unref();
}
`;

  const METHOD = `  /* ${MARKER} */
  metacriticRating = (0, _typescriptRoutesToOpenapiServer.createExpressRoute)(async (req, res) => {
    const id = Number(req.query.mediaItemId);
    if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: 'mediaItemId required' }); return; }
    const item = await _dbconfig.Database.knex('mediaItem')
      .select('id', 'mediaType', 'title', 'originalTitle', 'releaseDate', 'igdbId')
      .where('id', id).first();
    if (!item) { res.status(404).json({ error: 'mediaItem not found' }); return; }
    if (item.mediaType !== 'video_game') { res.json({ found: false }); return; }
    res.json(await _mcLookup(item));
  });
`;

  const classAnchor = '\nclass MediaItemController {';
  const endAnchor = '}\nexports.MediaItemController = MediaItemController;';
  for (const [name, a] of [['class', classAnchor], ['end-of-class', endAnchor]]) {
    const n = ctrl.split(a).length - 1;
    if (n !== 1) throw new Error('metacritic: expected 1 ' + name + ' anchor in item.js, found ' + n);
  }
  ctrl = ctrl.replace(classAnchor, () => HELPERS + classAnchor);
  ctrl = ctrl.replace(endAnchor, () => METHOD + endAnchor);
  fs.writeFileSync(ctrlPath, ctrl);
  child.execFileSync(process.execPath, ['--check', ctrlPath], { stdio: 'inherit' });
  console.log('metacritic: controller method + helpers installed');
}

const routesPath = BUILD + '/generated/routes/routes.js';
let routes = fs.readFileSync(routesPath, 'utf8');
if (routes.includes("'/api/metacritic'")) {
  console.log('metacritic: route already registered');
} else {
  const anchor = "router.get('/api/youtube/feed'";
  if (routes.split(anchor).length - 1 !== 1) throw new Error('metacritic: routes anchor not found exactly once');
  routes = routes.replace(anchor, () =>
    "router.get('/api/metacritic', validatorHandler({}), _MediaItemController.metacriticRating);\n" + anchor);
  fs.writeFileSync(routesPath, routes);
  child.execFileSync(process.execPath, ['--check', routesPath], { stdio: 'inherit' });
  console.log('metacritic: GET /api/metacritic registered');
}

// ---------------------------------------------------------------------------
// 3. Frontend
// ---------------------------------------------------------------------------
const bundlePath = child
  .execSync("ls " + PUB + "/main_*.js | grep -v '\\.LICENSE\\|\\.map'")
  .toString().trim();
let js = fs.readFileSync(bundlePath, 'utf8');

if (js.includes('/*' + MARKER + '*/')) {
  console.log('metacritic: bundle already patched');
  return;
}

// Icono + cuadrito de color con la nota. Estilos inline (Tailwind purgado).
const MCB = '_MCB=function(props){/*' + MARKER + '*/'
  + 'var t=props.mediaItem;var s=r.useState(null),mc=s[0],setMc=s[1];'
  + 'r.useEffect(function(){var alive=true;setMc(null);'
  +   'fetch("/api/metacritic?mediaItemId="+t.id,{credentials:"same-origin"})'
  +   '.then(function(x){return x.ok?x.json():null})'
  +   '.then(function(d){if(alive)setMc(d)})'
  +   '.catch(function(){});'
  +   'return function(){alive=false}},[t.id]);'
  + 'if(!mc||!mc.found)return null;'
  + 'var sc=typeof mc.score==="number"?mc.score:null;'
  + 'var bg=sc==null?"#8c8c8c":sc>=75?"#00ce7a":sc>=50?"#ffbd3f":"#ff6874";'
  + 'var tip="Metacritic"+(mc.title?" \\u00b7 "+mc.title+(mc.year?" ("+mc.year+")":""):"")'
  +   '+(sc==null?" \\u00b7 sin nota todav\\u00eda":"");'
  + 'return r.createElement("a",{href:mc.url,title:tip,className:"flex mr-2",'
  +   'style:{alignItems:"center",gap:"4px",height:"100%",textDecoration:"none",whiteSpace:"nowrap"}},'
  +   'r.createElement("img",{src:"logo/metacritic.svg",alt:"Metacritic",style:{height:"100%",width:"auto"}}),'
  +   'r.createElement("span",{style:{display:"inline-flex",alignItems:"center",justifyContent:"center",'
  +   'minWidth:"24px",height:"100%",padding:"0 4px",borderRadius:"4px",background:bg,'
  +   'color:sc==null?"#fff":"#000",fontWeight:700,fontSize:"12px",lineHeight:"1"}},sc==null?"tbd":String(sc)))'
  + '},';

const DEF_ANCHOR = '_FAB=function(props){/*mt-fork:filmaffinity*/';
const ROW_OLD = 'r.createElement(_FAB,{mediaItem:n}))},ag=function(){';
const ROW_NEW = 'r.createElement(_FAB,{mediaItem:n}),'
  + '"video_game"===n.mediaType&&r.createElement(_MCB,{mediaItem:n}))},ag=function(){';

for (const [name, a] of [['_FAB definition (patch_52)', DEF_ANCHOR], ['logo row (patch_52)', ROW_OLD]]) {
  const n = js.split(a).length - 1;
  if (n !== 1) {
    throw new Error('metacritic: expected 1 hit for the ' + name + ' anchor, found ' + n
      + ' (patch_52 must run first)');
  }
}

js = js.replace(DEF_ANCHOR, () => MCB + DEF_ANCHOR);
js = js.replace(ROW_OLD, () => ROW_NEW);
fs.writeFileSync(bundlePath, js);
child.execFileSync(process.execPath, ['--check', bundlePath], { stdio: 'inherit' });
console.log('metacritic: badge added to the details logo row (' + bundlePath + ')');

})();
