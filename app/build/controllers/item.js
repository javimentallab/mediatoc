"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.MediaItemController = void 0;
var _typescriptRoutesToOpenapiServer = require("typescript-routes-to-openapi-server");
var _mediaItem = require("../repository/mediaItem");
var _updateMetadata = require("../updateMetadata");
var _dbconfig = require("../dbconfig");
/**
 * @openapi_tags MediaItem
 */

function _jfCfg() {
  const _e = process.env;
  let f = {};
  try { f = JSON.parse(require('fs').readFileSync('/storage/jellyfin-config.json', 'utf8')); } catch (_) {}
  const _norm = function(u){ try { return u ? new URL(u).origin : ''; } catch (_) { return u || ''; } };
  return {
    url: f.url || _e.JELLYFIN_URL || '',
    apiKey: f.apiKey || _e.JELLYFIN_API_KEY || '',
    userId: f.userId || _e.JELLYFIN_USER_ID || '',
    publicUrl: _norm(f.publicUrl || _e.JELLYFIN_PUBLIC_URL),
    reverseSync: (f.reverseSync !== undefined ? !!f.reverseSync : _e.JELLYFIN_REVERSE_SYNC === 'true'),
  };
}

/* mediaocd:filmaffinity */
const _FA_CACHE_PATH = '/storage/filmaffinity-cache.json';
const _FA_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
const _FA_WD_UA = 'MediaOCD/1.0 (https://github.com/javimentallab/mediaocd)';
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
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
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
      '-w', '\n@@FA@@%{http_code}|%header{retry-after}|%{url_effective}', url,
    ], { maxBuffer: 16 * 1024 * 1024 }, (err, stdout) => {
      if (err) { reject(new Error('curl: ' + err.message)); return; }
      const i = stdout.lastIndexOf('\n@@FA@@');
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
  if (item.imdbId && /^tt\d+$/.test(item.imdbId)) terms.push('P345=' + item.imdbId);
  if (Number(item.tmdbId) > 0) terms.push((item.mediaType === 'tv' ? 'P4983' : 'P4947') + '=' + Number(item.tmdbId));
  for (const term of terms) {
    const s = await _faWdGet('action=query&list=search&srlimit=3&srprop=&srsearch='
      + encodeURIComponent('haswbstatement:' + term + ' haswbstatement:P480'));
    const qs = ((s.query && s.query.search) || []).map((x) => x.title).filter((q) => /^Q\d+$/.test(q));
    if (!qs.length) continue;
    const e = await _faWdGet('action=wbgetentities&props=claims&ids=' + qs.join('|'));
    for (const q of qs) {
      const claims = (e.entities && e.entities[q] && e.entities[q].claims && e.entities[q].claims.P480) || [];
      const v = claims.map((c) => c.mainsnak && c.mainsnak.datavalue && c.mainsnak.datavalue.value)
        .find((x) => /^\d+$/.test(x || ''));
      if (v) return v;
    }
  }
  return null;
}
function _faPageInfo(html) {
  const avg = html.match(/id="movie-rat-avg"[^>]*content="([\d.]+)"/);
  const cnt = html.match(/itemprop="ratingCount"[^>]*content="(\d+)"/);
  const title = html.match(/<meta property="og:title" content="([^"]*)"/);
  const t = title ? _faDecode(title[1]).replace(/\s+/g, ' ').trim() : null;
  const y = t && t.match(/\((\d{4})\)\s*$/);
  return {
    isFilm: !!title || html.includes('id="movie-rat-avg"'),
    rating: avg ? Number(avg[1]) : null,
    votes: cnt ? Number(cnt[1]) : null,
    title: t,
    year: y ? Number(y[1]) : null,
    isTv: !!(t && /\((?:Mini)?[Ss]erie de TV\)/.test(t)),
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
    const direct = r.url.match(/\/film(\d+)\.html/);
    if (direct) {
      const info = _faPageInfo(r.body);
      if (info.year && Math.abs(info.year - year) <= 1 && info.isTv === wantTv) return { faId: direct[1], page: r.body };
      continue;
    }
    const cards = [];
    for (const chunk of r.body.split('data-movie-id="').slice(1)) {
      const id = chunk.match(/^(\d+)"/);
      const cy = chunk.match(/class="mc-year[^"]*">\s*(\d{4})/);
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

/* mediaocd:metacritic */
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
  const q = encodeURIComponent(String(title).replace(/[\/?#%]+/g, ' ').replace(/\s+/g, ' ').trim());
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
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/&/g, ' and ').replace(/['\u2019`]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()
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

class MediaItemController {
  /**
   * @openapi_operationId get
   */
  details = (0, _typescriptRoutesToOpenapiServer.createExpressRoute)(async (req, res) => {
    const userId = Number(req.user);
    const {
      mediaItemId
    } = req.params;
    const mediaItem = await _mediaItem.mediaItemRepository.findOne({
      id: mediaItemId
    });
    if (!mediaItem) {
      res.status(404).send();
      return;
    }
    if (mediaItem.needsDetails == true) {
      await (0, _updateMetadata.updateMediaItem)(mediaItem);
    }
    /* mediaocd: details-includes-flags */
    const details = await _mediaItem.mediaItemRepository.details({
      mediaItemId: mediaItemId,
      userId: userId
    });
    if (details) {
      const _knex = _dbconfig.Database.knex;
      const [_ab, _aip, _sw] = await Promise.all([
        _knex('abandoned').where({ userId, mediaItemId }).first(),
        _knex('activelyInProgress').where({ userId, mediaItemId }).first(),
        _knex('seen').where({ userId, mediaItemId, kind: 'watched' }).first()
      ]);
      details.abandoned = !!_ab;
      details.activelyInProgress = !!_aip && !_aip.excluded;
      details.activelyInProgressExcluded = !!_aip && !!_aip.excluded;
      details.seenWatched = !!_sw;
      /*mediaocd:details-inprogress-flag*/
      {
        const _aipEx = !!_aip && !!_aip.excluded;
        const _aipAc = !!_aip && !_aip.excluded;
        const _unseen = Number(details.unseenEpisodesCount) || 0;
        const _aired = Number(details.numberOfEpisodes) || 0;
        const _seenEps = Math.max(0, _aired - _unseen);
        const _onWl = !!details.onWatchlist;
        const _fue = details.firstUnwatchedEpisode;
        const _fueProg = (_fue && Number(_fue.progress)) || 0;
        if (mediaItem.mediaType === 'tv') {
          /*mediaocd:inprogress-respects-abandoned*/
          const _ab = !!details.abandoned;
          details.inProgress = !_aipEx && !_ab && (
            (_seenEps > 0 && _unseen > 0) ||
            (_fue && _fueProg > 0) ||
            (_onWl && !!_fue) ||
            _aipAc
          );
        } else {
          /*mediaocd:loose-aip-inprogress-details*/
          const _prog = Number(details.progress) || 0;
          const _aprog = Number(details.audioProgress) || 0;
          const _hasSeen = Boolean(details.seen) || (Array.isArray(details.seenHistory) && details.seenHistory.length > 0);
          const _abNonTv = !!details.abandoned;
          details.inProgress = !_aipEx && !_abNonTv && ((_prog > 0 && _prog < 1 && !_hasSeen) || (_aprog > 0 && _aprog < 1 && !_hasSeen) || _aipAc);
        }
      }
    }
    res.send(details);
  });

  /**
   * @openapi_operationId updateMetadata
   */
  updateMetadata = (0, _typescriptRoutesToOpenapiServer.createExpressRoute)(async (req, res) => {
    const {
      mediaItemId
    } = req.params;
    const mediaItem = await _mediaItem.mediaItemRepository.findOne({
      id: mediaItemId
    });
    if (!mediaItem) {
      res.status(404).send();
      return;
    }
    await (0, _updateMetadata.updateMediaItem)(mediaItem);
    res.sendStatus(200);
  });
  toggleDownloaded = (0, _typescriptRoutesToOpenapiServer.createExpressRoute)(async (req, res) => {
    const { mediaItemId } = req.query;
    const item = await _dbconfig.Database.knex('mediaItem').select('downloaded').where('id', mediaItemId).first();
    if (!item) { res.status(404).send(); return; }
    await _dbconfig.Database.knex('mediaItem').update({ downloaded: item.downloaded ? 0 : 1 }).where('id', mediaItemId);
    res.sendStatus(200);
  });
  updateLinks = (0, _typescriptRoutesToOpenapiServer.createExpressRoute)(async (req, res) => {
    const { mediaItemId } = req.query;
    const { links } = req.body;
    if (!Array.isArray(links)) { res.status(400).send(); return; }
    const safe = links.map(l => ({ label: String(l.label || l.url || ''), url: String(l.url || '') })).filter(l => l.url);
    await _dbconfig.Database.knex('mediaItem').update({ links: JSON.stringify(safe) }).where('id', mediaItemId);
    res.sendStatus(200);
  });
  watchProviders = (0, _typescriptRoutesToOpenapiServer.createExpressRoute)(async (req, res) => {
    const { mediaItemId } = req.query;
    const item = await _dbconfig.Database.knex('mediaItem').select('tmdbId','igdbId','openlibraryId','audibleId','mediaType','title').where('id', mediaItemId).first();
    if (!item) { res.status(404).send(); return; }
    // Resolve TMDB key: env var first, then user-stored UI key in /storage/tmdb-key.json.
    let TMDB_KEY = process.env.TMDB_API_KEY;
    if (!TMDB_KEY) {
      try { TMDB_KEY = (JSON.parse(require('fs').readFileSync('/storage/tmdb-key.json','utf8')).apiKey || '').trim() || null; } catch(_) { TMDB_KEY = null; }
    }
    if (!TMDB_KEY) {
      res.status(503).json({ error: 'TMDB API key no configurada. Pégala en Tokens de aplicación (Tokens TMDB) o define TMDB_API_KEY en docker-compose.yml.' });
      return;
    }
    const results = [];
    try {
      if ((item.mediaType === 'movie' || item.mediaType === 'tv') && item.tmdbId) {
        const type = item.mediaType === 'tv' ? 'tv' : 'movie';
        const url = `https://api.themoviedb.org/3/${type}/${item.tmdbId}/watch/providers?api_key=${TMDB_KEY}`;
        const r = await fetch(url);
        if (r.ok) {
          const data = await r.json();
          const region = (data && data.results && (data.results.ES || data.results.US)) || (data && data.results && Object.values(data.results)[0]);
          if (region) {
            const link = region.link || `https://www.justwatch.com/es/buscar?q=${encodeURIComponent(item.title)}`;
            const seen = new Set();
            const pushAll = (list, kind) => (list || []).forEach(p => {
              if (seen.has(p.provider_id)) return;
              seen.add(p.provider_id);
              results.push({ name: p.provider_name, logo: `https://image.tmdb.org/t/p/original${p.logo_path}`, url: link, kind });
            });
            pushAll(region.flatrate, 'streaming');
            pushAll(region.free, 'gratis');
            pushAll(region.ads, 'gratis-con-anuncios');
            pushAll(region.rent, 'alquiler');
            pushAll(region.buy, 'compra');
          }
        }
      }
      if (item.mediaType === 'video_game') {
        results.push({ name: 'Steam', logo: null, url: `https://store.steampowered.com/search/?term=${encodeURIComponent(item.title)}` });
        results.push({ name: 'GOG', logo: null, url: `https://www.gog.com/games?search=${encodeURIComponent(item.title)}` });
      }
      if (item.mediaType === 'book' && item.openlibraryId) {
        results.push({ name: 'OpenLibrary', logo: null, url: `https://openlibrary.org/works/${item.openlibraryId}` });
        results.push({ name: 'Google Books', logo: null, url: `https://books.google.es/books?q=${encodeURIComponent(item.title)}` });
      }
      if (item.mediaType === 'audiobook') {
        results.push({ name: 'Audible', logo: null, url: `https://www.audible.es/search?keywords=${encodeURIComponent(item.title)}` });
        results.push({ name: 'Storytel', logo: null, url: `https://www.storytel.com/es/es/search#q=${encodeURIComponent(item.title)}` });
      }
    } catch(e) {}
    res.json(results);
  });
  downloadBackup = (0, _typescriptRoutesToOpenapiServer.createExpressRoute)(async (req, res) => {
    if (!(await this.jellyfinIsAdmin(req, res))) return;
    const dbPath = '/storage/data.db';
    const date = new Date().toISOString().slice(0, 10);
    res.download(dbPath, `mediaocd-backup-${date}.db`, (err) => {
      if (err && !res.headersSent) { res.status(500).send('backup failed'); }
    });
  });
  exportJson = (0, _typescriptRoutesToOpenapiServer.createExpressRoute)(async (req, res) => {
    if (!(await this.jellyfinIsAdmin(req, res))) return;
    const userId = Number(req.user);
    const knex = _dbconfig.Database.knex;
    const [user, lists, listItems, seen, ratings, progress, items] = await Promise.all([
      knex('user').select('id','name','admin').where('id', userId).first(),
      knex('list').select('*').where('userId', userId),
      knex('listItem').select('listItem.*').leftJoin('list','list.id','listItem.listId').where('list.userId', userId),
      knex('seen').select('*').where('userId', userId),
      knex('userRating').select('*').where('userId', userId),
      knex('progress').select('*').where('userId', userId),
      knex('mediaItem').select('id','title','mediaType','releaseDate','tmdbId','imdbId','igdbId','tvdbId','traktId','openlibraryId','audibleId','goodreadsId','audioProgress','downloaded','links')
    ]);
    const referencedIds = new Set();
    listItems.forEach(li => li.mediaItemId && referencedIds.add(li.mediaItemId));
    seen.forEach(s => s.mediaItemId && referencedIds.add(s.mediaItemId));
    ratings.forEach(r => r.mediaItemId && referencedIds.add(r.mediaItemId));
    progress.forEach(p => p.mediaItemId && referencedIds.add(p.mediaItemId));
    const referencedItems = items.filter(it => referencedIds.has(it.id));
    const tvShowIds = referencedItems.filter(it => it.mediaType === 'tv').map(it => it.id);
    // Episodes for TV shows that have user activity (so the import can map old episodeIds → new ones)
    let episodes = [];
    if (tvShowIds.length > 0) {
      episodes = await knex('episode').select('id','tvShowId','seasonNumber','episodeNumber','title','isSpecialEpisode').whereIn('tvShowId', tvShowIds);
    }
    const out = {
      exportedAt: new Date().toISOString(),
      schemaVersion: 2,
      user, lists, listItems, seen, ratings, progress,
      mediaItems: referencedItems,
      episodes
    };
    const date = new Date().toISOString().slice(0,10);
    res.setHeader('Content-Disposition', 'attachment; filename="mediaocd-export-' + date + '.json"');
    res.setHeader('Content-Type', 'application/json');
    res.send(JSON.stringify(out, null, 2));
  });
  importJson = (0, _typescriptRoutesToOpenapiServer.createExpressRoute)(async (req, res) => {
    if (!(await this.jellyfinIsAdmin(req, res))) return;
    const userId = Number(req.user);
    const knex = _dbconfig.Database.knex;
    // Read raw body (express.json default limit is too small for these exports)
    let body = '';
    try {
      await new Promise((resolve, reject) => {
        req.setEncoding('utf8');
        req.on('data', chunk => { body += chunk; if (body.length > 100 * 1024 * 1024) { reject(new Error('Archivo demasiado grande (>100MB)')); } });
        req.on('end', resolve);
        req.on('error', reject);
      });
    } catch (e) { res.status(400).json({ error: e.message }); return; }
    let data;
    try { data = JSON.parse(body); } catch (e) { res.status(400).json({ error: 'JSON inválido: ' + e.message }); return; }
    if (!data || !Array.isArray(data.mediaItems)) { res.status(400).json({ error: 'JSON sin campo mediaItems' }); return; }
    // createMissing: when an external ID isn't found in MT, insert a minimal row so
    // its seen/ratings/progress can attach. MT's metadata refresh fills in the rest later.
    // Default true; set { createMissing: false } in the request body to disable.
    const createMissing = data.createMissing !== false;

    const stats = { mediaItemsMatched: 0, mediaItemsCreated: 0, mediaItemsMissing: 0, episodesMatched: 0, listsCreated: 0, listsExisting: 0, listItemsImported: 0, listItemsSkipped: 0, seenImported: 0, seenSkipped: 0, seenMissing: 0, ratingsImported: 0, ratingsSkipped: 0, progressImported: 0, progressSkipped: 0 };

    // 1. Match mediaItems by external IDs (fall through TMDB → IMDB → TVDB → IGDB → audible → goodreads → openlibrary)
    const mediaItemMap = new Map();
    for (const mi of data.mediaItems) {
      const where = { mediaType: mi.mediaType };
      let match = null;
      const tryMatch = async (key, val) => {
        if (match || !val) return;
        match = await knex('mediaItem').where({ ...where, [key]: val }).first();
      };
      await tryMatch('tmdbId', mi.tmdbId);
      await tryMatch('imdbId', mi.imdbId);
      await tryMatch('tvdbId', mi.tvdbId);
      await tryMatch('igdbId', mi.igdbId);
      await tryMatch('audibleId', mi.audibleId);
      await tryMatch('goodreadsId', mi.goodreadsId);
      await tryMatch('openlibraryId', mi.openlibraryId);
      await tryMatch('traktId', mi.traktId);
      if (match) { mediaItemMap.set(mi.id, match.id); stats.mediaItemsMatched++; continue; }
      if (createMissing && (mi.tmdbId || mi.imdbId || mi.tvdbId || mi.igdbId || mi.audibleId || mi.goodreadsId || mi.openlibraryId)) {
        try {
          const inserted = await knex('mediaItem').insert({
            title: mi.title || '(unknown)',
            mediaType: mi.mediaType,
            tmdbId: mi.tmdbId || null,
            imdbId: mi.imdbId || null,
            tvdbId: mi.tvdbId || null,
            igdbId: mi.igdbId || null,
            audibleId: mi.audibleId || null,
            goodreadsId: mi.goodreadsId || null,
            openlibraryId: mi.openlibraryId || null,
            traktId: mi.traktId || null,
            releaseDate: mi.releaseDate || null,
            source: mi.tmdbId || mi.tvdbId ? 'tmdb' : (mi.igdbId ? 'igdb' : (mi.audibleId ? 'audible' : (mi.goodreadsId ? 'goodreads' : 'openlibrary'))),
            needsDetails: 1,
            lastTimeUpdated: 0
          }).returning('id');
          const newId = inserted[0] && (inserted[0].id !== undefined ? inserted[0].id : inserted[0]);
          mediaItemMap.set(mi.id, newId);
          stats.mediaItemsCreated++;
        } catch (e) {
          stats.mediaItemsMissing++;
        }
      } else {
        stats.mediaItemsMissing++;
      }
    }

    // 2. Match episodes via mapped tvShowId + seasonNumber + episodeNumber
    const episodeMap = new Map();
    for (const ep of (data.episodes || [])) {
      const newShowId = mediaItemMap.get(ep.tvShowId);
      if (!newShowId) continue;
      const existing = await knex('episode').where({ tvShowId: newShowId, seasonNumber: ep.seasonNumber, episodeNumber: ep.episodeNumber }).first();
      if (existing) { episodeMap.set(ep.id, existing.id); stats.episodesMatched++; }
    }

    // 3. Lists: match watchlist by isWatchlist, others by name. Create missing.
    const listMap = new Map();
    for (const list of (data.lists || [])) {
      let existing = list.isWatchlist
        ? await knex('list').where({ userId, isWatchlist: true }).first()
        : await knex('list').where({ userId, name: list.name }).first();
      if (existing) { listMap.set(list.id, existing.id); stats.listsExisting++; }
      else {
        const inserted = await knex('list').insert({
          userId, name: list.name, description: list.description || null,
          isWatchlist: list.isWatchlist ? 1 : 0,
          privacy: list.privacy || 'private',
          createdAt: list.createdAt || Date.now(),
          updatedAt: list.updatedAt || Date.now()
        }).returning('id');
        const newId = inserted[0] && (inserted[0].id || inserted[0]);
        listMap.set(list.id, newId);
        stats.listsCreated++;
      }
    }

    // Steps 4-7 refactored: bulk dedup-and-insert for listItem/seen/userRating/progress.
    // Was N×.first() + N inserts per table; now 1 bulk SELECT + 1 chunked INSERT
    // per table. SQLite param limit is 999 so we chunk inserts at 100 rows.
    const _bulkInsert = async (table, rows) => {
      const CHUNK = 100;
      for (let i = 0; i < rows.length; i += CHUNK) {
        await knex(table).insert(rows.slice(i, i + CHUNK));
      }
    };

    // 4. List items
    {
      const valid = [];
      let skipped = 0;
      for (const li of (data.listItems || [])) {
        const newMI = mediaItemMap.get(li.mediaItemId);
        const newList = listMap.get(li.listId);
        if (!newMI || !newList) { skipped++; continue; }
        valid.push({ li, newMI, newList });
      }
      if (valid.length > 0) {
        const listIds = [...new Set(valid.map(v => v.newList))];
        const miIds = [...new Set(valid.map(v => v.newMI))];
        const existing = await knex('listItem').whereIn('listId', listIds).whereIn('mediaItemId', miIds).select('listId','mediaItemId','seasonId','episodeId');
        const existingSet = new Set(existing.map(e => e.listId+'|'+e.mediaItemId+'|'+(e.seasonId||'')+'|'+(e.episodeId||'')));
        const toInsert = [];
        for (const v of valid) {
          const key = v.newList+'|'+v.newMI+'|'+(v.li.seasonId||'')+'|'+(v.li.episodeId||'');
          if (existingSet.has(key)) { skipped++; continue; }
          existingSet.add(key);
          toInsert.push({ listId: v.newList, mediaItemId: v.newMI, seasonId: v.li.seasonId || null, episodeId: v.li.episodeId || null, addedAt: v.li.addedAt || Date.now() });
        }
        if (toInsert.length) await _bulkInsert('listItem', toInsert);
        stats.listItemsImported = toInsert.length;
      }
      stats.listItemsSkipped = skipped;
    }

    // 5. Seen
    {
      const valid = [];
      let missing = 0;
      for (const s of (data.seen || [])) {
        const newMI = mediaItemMap.get(s.mediaItemId);
        if (!newMI) { missing++; continue; }
        let newEp = null;
        if (s.episodeId) {
          newEp = episodeMap.get(s.episodeId);
          if (!newEp) { missing++; continue; }
        }
        valid.push({ s, newMI, newEp });
      }
      let skipped = 0;
      if (valid.length > 0) {
        const miIds = [...new Set(valid.map(v => v.newMI))];
        const existing = await knex('seen').where('userId', userId).whereIn('mediaItemId', miIds).select('mediaItemId','episodeId','date');
        const existingSet = new Set(existing.map(e => e.mediaItemId+'|'+(e.episodeId||'')+'|'+e.date));
        const toInsert = [];
        for (const v of valid) {
          const key = v.newMI+'|'+(v.newEp||'')+'|'+v.s.date;
          if (existingSet.has(key)) { skipped++; continue; }
          existingSet.add(key);
          toInsert.push({ userId, mediaItemId: v.newMI, episodeId: v.newEp || null, date: v.s.date, duration: v.s.duration || null });
        }
        if (toInsert.length) await _bulkInsert('seen', toInsert);
        stats.seenImported = toInsert.length;
      }
      stats.seenSkipped = skipped;
      stats.seenMissing = missing;
    }

    // 6. Ratings
    {
      const valid = [];
      for (const r of (data.ratings || [])) {
        const newMI = mediaItemMap.get(r.mediaItemId);
        if (!newMI) continue;
        valid.push({ r, newMI });
      }
      let skipped = 0;
      if (valid.length > 0) {
        const miIds = [...new Set(valid.map(v => v.newMI))];
        const existing = await knex('userRating').where('userId', userId).whereIn('mediaItemId', miIds).select('mediaItemId','seasonId','episodeId');
        const existingSet = new Set(existing.map(e => e.mediaItemId+'|'+(e.seasonId||'')+'|'+(e.episodeId||'')));
        const toInsert = [];
        for (const v of valid) {
          const key = v.newMI+'|'+(v.r.seasonId||'')+'|'+(v.r.episodeId||'');
          if (existingSet.has(key)) { skipped++; continue; }
          existingSet.add(key);
          toInsert.push({ userId, mediaItemId: v.newMI, seasonId: v.r.seasonId || null, episodeId: v.r.episodeId || null, rating: v.r.rating, review: v.r.review || null, date: v.r.date || Date.now() });
        }
        if (toInsert.length) await _bulkInsert('userRating', toInsert);
        stats.ratingsImported = toInsert.length;
      }
      stats.ratingsSkipped = skipped;
    }

    // 7. Progress
    {
      const valid = [];
      for (const p of (data.progress || [])) {
        const newMI = mediaItemMap.get(p.mediaItemId);
        if (!newMI) continue;
        const newEp = p.episodeId ? episodeMap.get(p.episodeId) : null;
        if (p.episodeId && !newEp) continue;
        valid.push({ p, newMI, newEp });
      }
      let skipped = 0;
      if (valid.length > 0) {
        const miIds = [...new Set(valid.map(v => v.newMI))];
        const existing = await knex('progress').where('userId', userId).whereIn('mediaItemId', miIds).select('mediaItemId','episodeId');
        const existingSet = new Set(existing.map(e => e.mediaItemId+'|'+(e.episodeId||'')));
        const toInsert = [];
        for (const v of valid) {
          const key = v.newMI+'|'+(v.newEp||'');
          if (existingSet.has(key)) { skipped++; continue; }
          existingSet.add(key);
          toInsert.push({ userId, mediaItemId: v.newMI, episodeId: v.newEp || null, progress: v.p.progress, date: v.p.date || Date.now(), duration: v.p.duration || null, action: v.p.action || null });
        }
        if (toInsert.length) await _bulkInsert('progress', toInsert);
        stats.progressImported = toInsert.length;
      }
      stats.progressSkipped = skipped;
    }

    res.json({ ok: true, ...stats });
  });
  exportLetterboxd = (0, _typescriptRoutesToOpenapiServer.createExpressRoute)(async (req, res) => {
    if (!(await this.jellyfinIsAdmin(req, res))) return;
    const userId = Number(req.user);
    const knex = _dbconfig.Database.knex;
    // Letterboxd diary-import format columns:
    //   Date,Name,Year,Rating,Rewatch,Watched Date,Tags
    // Letterboxd is movies-only — export only seen entries that map to mediaType=movie.
    // Aggregate into one row per (movie, watched date), with Rewatch flagged on duplicates per movie.
    const rows = await knex('seen')
      .join('mediaItem', 'mediaItem.id', 'seen.mediaItemId')
      .leftJoin('userRating', qb => qb.on('userRating.mediaItemId', 'mediaItem.id').andOnVal('userRating.userId', userId).andOnNull('userRating.seasonId').andOnNull('userRating.episodeId'))
      .where('seen.userId', userId)
      .where('mediaItem.mediaType', 'movie')
      .whereNotNull('seen.date')
      .select(knex.raw('mediaItem.title AS title'), knex.raw("substr(mediaItem.releaseDate, 1, 4) AS year"), 'seen.date AS watchedAt', 'userRating.rating AS rating')
      .orderBy('seen.date', 'asc');
    const csvEscape = (v) => {
      if (v === null || v === undefined) return '';
      const s = String(v);
      if (s.includes(',') || s.includes('"') || s.includes('\n')) return '"' + s.replace(/"/g, '""') + '"';
      return s;
    };
    const seenTitles = new Map(); // title|year -> count, to flag rewatches
    const lines = ['Date,Name,Year,Rating,Rewatch,WatchedDate'];
    for (const r of rows) {
      const watchDate = new Date(Number(r.watchedAt));
      const dateStr = watchDate.toISOString().slice(0, 10);
      const key = (r.title || '') + '|' + (r.year || '');
      const isRewatch = seenTitles.has(key);
      seenTitles.set(key, (seenTitles.get(key) || 0) + 1);
      // Letterboxd rating is 0.5–5; MT rating is typically 0–10 (scale by /2)
      const lbRating = r.rating ? (Math.round((r.rating / 2) * 2) / 2) : '';
      lines.push([
        dateStr,
        csvEscape(r.title),
        r.year || '',
        lbRating,
        isRewatch ? 'true' : '',
        dateStr
      ].join(','));
    }
    const date = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Disposition', 'attachment; filename="letterboxd-' + date + '.csv"');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.send(lines.join('\n'));
  });
  restoreBackup = (0, _typescriptRoutesToOpenapiServer.createExpressRoute)(async (req, res) => {
    if (!(await this.jellyfinIsAdmin(req, res))) return;
    const fs = require('fs');
    const dest = '/storage/data.db.uploaded';
    try {
      await new Promise((resolve, reject) => {
        const w = fs.createWriteStream(dest);
        req.on('error', reject);
        w.on('error', reject);
        w.on('finish', resolve);
        req.pipe(w);
      });
      const stat = fs.statSync(dest);
      // Sanity check: SQLite files start with 'SQLite format 3\u0000'
      const fd = fs.openSync(dest, 'r');
      const header = Buffer.alloc(16);
      fs.readSync(fd, header, 0, 16, 0);
      fs.closeSync(fd);
      if (header.toString('utf8', 0, 15) !== 'SQLite format 3') {
        fs.unlinkSync(dest);
        res.status(400).json({ error: 'El archivo subido no es una base SQLite válida' });
        return;
      }
      res.json({ ok: true, size: stat.size, message: 'Archivo subido. Reinicia el contenedor para aplicar.' });
    } catch (e) {
      try { fs.unlinkSync(dest); } catch(_) {}
      res.status(500).json({ error: e.message });
    }
  });
  /* AUDIO_PROGRESS_DUR_V2 */
  setAudioProgress = (0, _typescriptRoutesToOpenapiServer.createExpressRoute)(async (req, res) => {
    const { mediaItemId } = req.query;
    const progress = req.query.progress !== undefined ? req.query.progress : (req.body && req.body.progress);
    const runtime = req.query.runtime;
    const numberOfPages = req.query.numberOfPages;
    const numberOfChapters = req.query.numberOfChapters;
    const item = await _dbconfig.Database.knex('mediaItem').select('id').where('id', mediaItemId).first();
    if (!item) { res.status(404).send(); return; }
    const patch = {};
    let pOut = undefined;
    if (progress !== null && progress !== undefined) {
      pOut = Math.max(0, Math.min(1, Number(progress)));
      patch.audioProgress = pOut;
    }
    if (runtime !== undefined && runtime !== null && runtime !== '' && !Number.isNaN(Number(runtime))) {
      const r = Math.max(1, Math.round(Number(runtime)));
      patch.runtime = r;
    }
    if (numberOfPages !== undefined && numberOfPages !== null && numberOfPages !== '' && !Number.isNaN(Number(numberOfPages))) {
      const n = Math.max(1, Math.round(Number(numberOfPages)));
      patch.numberOfPages = n;
    }
    if (numberOfChapters !== undefined && numberOfChapters !== null && numberOfChapters !== '' && !Number.isNaN(Number(numberOfChapters))) {
      patch.numberOfChapters = Math.max(1, Math.round(Number(numberOfChapters)));
    }
    if (Object.keys(patch).length > 0) {
      await _dbconfig.Database.knex('mediaItem').update(patch).where('id', mediaItemId);
    }
    res.json({ ok: true, audioProgress: pOut, runtime: patch.runtime, numberOfPages: patch.numberOfPages });
  });
  setEpisodeProgress = (0, _typescriptRoutesToOpenapiServer.createExpressRoute)(async (req, res) => {
    const { episodeId } = req.query;
    const progress = req.query.progress !== undefined ? req.query.progress : (req.body && req.body.progress);
    const ep = await _dbconfig.Database.knex('episode').select('id').where('id', episodeId).first();
    if (!ep) { res.status(404).send(); return; }
    const p = (progress === null || progress === undefined) ? null : Math.max(0, Math.min(1, Number(progress)));
    /* EP_RUNTIME_V1 */
    const _rt = req.query.runtime;
    const _upd = { progress: p };
    if (_rt !== undefined && _rt !== null && _rt !== '' && !Number.isNaN(Number(_rt))) {
      _upd.runtime = Math.max(1, Math.round(Number(_rt)));
    }
    await _dbconfig.Database.knex('episode').update(_upd).where('id', episodeId);
    res.json({ ok: true, progress: p, runtime: _upd.runtime });
  });
  fetchEpisodeRuntimes = (0, _typescriptRoutesToOpenapiServer.createExpressRoute)(async (req, res) => {
    const { mediaItemId } = req.query;
    const item = await _dbconfig.Database.knex('mediaItem').select('id','tmdbId','mediaType').where('id', mediaItemId).first();
    if (!item || item.mediaType !== 'tv' || !item.tmdbId) { res.status(400).json({error:'Item must be a TV show with tmdbId'}); return; }
    // Resolve TMDB key: env var first, then user-stored UI key in /storage/tmdb-key.json.
    let TMDB_KEY = process.env.TMDB_API_KEY;
    if (!TMDB_KEY) {
      try { TMDB_KEY = (JSON.parse(require('fs').readFileSync('/storage/tmdb-key.json','utf8')).apiKey || '').trim() || null; } catch(_) { TMDB_KEY = null; }
    }
    if (!TMDB_KEY) {
      res.status(503).json({ error: 'TMDB API key no configurada. Pégala en Tokens de aplicación (Tokens TMDB) o define TMDB_API_KEY en docker-compose.yml.' });
      return;
    }
    const https = require('https');
    const fetchSeason = (sn) => new Promise((ok, fail) => {
      const url = `https://api.themoviedb.org/3/tv/${item.tmdbId}/season/${sn}?api_key=${TMDB_KEY}`;
      let data = '';
      https.get(url, r => {
        r.on('data', d => data += d);
        r.on('end', () => { try { ok(JSON.parse(data)); } catch(e) { ok(null); } });
      }).on('error', () => ok(null));
    });
    const seasonNumbers = (await _dbconfig.Database.knex('episode').distinct('seasonNumber').where('tvShowId', item.id)).map(r => r.seasonNumber);
    let updated = 0, totalSeasons = 0;
    for (const sn of seasonNumbers) {
      const data = await fetchSeason(sn);
      if (!data || !Array.isArray(data.episodes)) continue;
      totalSeasons++;
      for (const ep of data.episodes) {
        if (typeof ep.runtime !== 'number') continue;
        const result = await _dbconfig.Database.knex('episode')
          .update({ runtime: ep.runtime })
          .where('tvShowId', item.id)
          .where('seasonNumber', sn)
          .where('episodeNumber', ep.episode_number);
        if (result > 0) updated++;
      }
    }
    /* EP_RUNTIME_ECHO_V1 */
    let episodeRuntime = null;
    if (req.query.episodeId) {
      const _e = await _dbconfig.Database.knex('episode').select('runtime').where('id', req.query.episodeId).first();
      episodeRuntime = _e ? _e.runtime : null;
    }
    res.json({ ok: true, updated, totalSeasons, episodeRuntime });
  });
  hltb = (0, _typescriptRoutesToOpenapiServer.createExpressRoute)(async (req, res) => {
    const { mediaItemId } = req.query;
    const item = await _dbconfig.Database.knex('mediaItem').select('igdbId','title').where('id', mediaItemId).first();
    if (!item || !item.igdbId) { res.json({hastily:null,normally:null,completely:null,count:0}); return; }
    try {
      const { IGDB } = require('../metadata/provider/igdb');
      const igdb = new IGDB();
      const data = await igdb.get('game_time_to_beats', `fields hastily,normally,completely,count; where game_id = ${item.igdbId};`);
      if (data && data.length > 0) {
        const t = data[0];
        res.json({
          hastily: t.hastily ? Math.round(t.hastily/60) : null,
          normally: t.normally ? Math.round(t.normally/60) : null,
          completely: t.completely ? Math.round(t.completely/60) : null,
          count: t.count || 0
        });
      } else {
        res.json({hastily:null,normally:null,completely:null,count:0});
      }
    } catch (e) {
      res.status(500).json({error: e.message});
    }
  });
  cleanupCatalog = (0, _typescriptRoutesToOpenapiServer.createExpressRoute)(async (req, res) => {
    if (!(await this.jellyfinIsAdmin(req, res))) return;
    const knex = _dbconfig.Database.knex;
    const orphans = await knex('mediaItem')
      .select('id','title','mediaType')
      .whereNotIn('id', knex.select('mediaItemId').from('listItem').whereNotNull('mediaItemId'))
      .whereNotIn('id', knex.select('mediaItemId').from('seen').whereNotNull('mediaItemId'))
      .whereNotIn('id', knex.select('mediaItemId').from('userRating').whereNotNull('mediaItemId'))
      .whereNotIn('id', knex.select('mediaItemId').from('progress').whereNotNull('mediaItemId'));
    const ids = orphans.map(r => r.id);
    if (ids.length === 0) { res.json({ ok: true, deleted: 0, items: [] }); return; }
    // Cascade: episode + season for any TV shows being purged
    await knex('episode').whereIn('tvShowId', ids).delete();
    await knex('season').whereIn('tvShowId', ids).delete();
    await knex('mediaItem').whereIn('id', ids).delete();
    res.json({ ok: true, deleted: ids.length, items: orphans });
  });
  findDupes = (0, _typescriptRoutesToOpenapiServer.createExpressRoute)(async (req, res) => {
    if (!(await this.jellyfinIsAdmin(req, res))) return;
    const knex = _dbconfig.Database.knex;
    // Group items by (lowercased title, releaseYear, mediaType). Pairs with >1 row are candidates.
    const rows = await knex('mediaItem')
      .select('id','title','mediaType','releaseDate','tmdbId','imdbId','tvdbId','igdbId','goodreadsId','openlibraryId','audibleId')
      .whereNotNull('title');
    const groups = new Map();
    for (const r of rows) {
      const key = (r.title || '').toLowerCase().trim() + '|' + (r.releaseDate ? String(r.releaseDate).slice(0,4) : '') + '|' + r.mediaType;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(r);
    }
    const dupes = [];
    for (const [key, items] of groups.entries()) {
      if (items.length < 2) continue;
      // Skip if all items share the same tmdbId (just a query oddity)
      const distinctTmdb = new Set(items.map(i => i.tmdbId).filter(Boolean));
      const distinctImdb = new Set(items.map(i => i.imdbId).filter(Boolean));
      // True dupes have at least one distinct external ID
      if (distinctTmdb.size <= 1 && distinctImdb.size <= 1 && items.every(i => !i.tmdbId && !i.imdbId)) continue;
      dupes.push({ key, items });
    }
    // Bulk-load usage counts for ALL dupe items in 4 grouped queries (was 4×N).
    const allIds = dupes.flatMap(d => d.items.map(i => i.id));
    const usage = new Map();
    if (allIds.length > 0) {
      const fetchCounts = async (table) => knex(table).whereIn('mediaItemId', allIds).groupBy('mediaItemId').select('mediaItemId').count('* as c');
      const [s, r, p, l] = await Promise.all([fetchCounts('seen'), fetchCounts('userRating'), fetchCounts('progress'), fetchCounts('listItem')]);
      const add = (rows) => { for (const r of rows) usage.set(r.mediaItemId, (usage.get(r.mediaItemId) || 0) + Number(r.c || 0)); };
      add(s); add(r); add(p); add(l);
    }
    for (const d of dupes) {
      for (const it of d.items) it.usage = usage.get(it.id) || 0;
      d.items.sort((a, b) => b.usage - a.usage);
    }
    res.json({ count: dupes.length, dupes });
  });
  mergeDupes = (0, _typescriptRoutesToOpenapiServer.createExpressRoute)(async (req, res) => {
    if (!(await this.jellyfinIsAdmin(req, res))) return;
    const knex = _dbconfig.Database.knex;
    const { winnerId, loserId } = req.body || {};
    if (!winnerId || !loserId || winnerId === loserId) { res.status(400).json({ error: 'winnerId y loserId requeridos y distintos' }); return; }
    const w = await knex('mediaItem').where('id', winnerId).first();
    const l = await knex('mediaItem').where('id', loserId).first();
    if (!w || !l) { res.status(404).json({ error: 'mediaItem no encontrado' }); return; }
    if (w.mediaType !== l.mediaType) { res.status(400).json({ error: 'mediaTypes distintos — no se puede fusionar' }); return; }
    const stats = { seen: 0, ratings: 0, progress: 0, listItems: 0 };
    // Helper: bulk-merge a child table — load loser/winner rows once, classify
    // each loser row as conflict (delete) or unique (re-assign), then batch
    // delete + batch update. 2 reads + 2 writes per table instead of N reads + N writes.
    const _bulkMerge = async (trx, table, keyFn) => {
      const loserRows = await trx(table).where('mediaItemId', loserId);
      if (loserRows.length === 0) return 0;
      const winnerRows = await trx(table).where('mediaItemId', winnerId);
      const winnerKeys = new Set(winnerRows.map(keyFn));
      const toDelete = [], toReassign = [];
      for (const r of loserRows) {
        if (winnerKeys.has(keyFn(r))) toDelete.push(r.id);
        else toReassign.push(r.id);
      }
      if (toDelete.length) await trx(table).whereIn('id', toDelete).delete();
      if (toReassign.length) await trx(table).whereIn('id', toReassign).update({ mediaItemId: winnerId });
      return toReassign.length;
    };
    await knex.transaction(async trx => {
      stats.seen      = await _bulkMerge(trx, 'seen',       r => r.userId + '|' + (r.episodeId || '') + '|' + r.date);
      stats.ratings   = await _bulkMerge(trx, 'userRating', r => r.userId + '|' + (r.seasonId || '') + '|' + (r.episodeId || ''));
      stats.progress  = await _bulkMerge(trx, 'progress',   r => r.userId + '|' + (r.episodeId || ''));
      stats.listItems = await _bulkMerge(trx, 'listItem',   r => r.listId + '|' + (r.seasonId || '') + '|' + (r.episodeId || ''));
      // Drop loser's children (episodes/seasons) and the loser itself
      await trx('episode').where('tvShowId', loserId).delete();
      await trx('season').where('tvShowId', loserId).delete();
      await trx('mediaItem').where('id', loserId).delete();
    });
    res.json({ ok: true, winnerId, loserId, ...stats });
  });
  refreshGameRuntimes = (0, _typescriptRoutesToOpenapiServer.createExpressRoute)(async (req, res) => {
    if (!(await this.jellyfinIsAdmin(req, res))) return;
    const knex = _dbconfig.Database.knex;
    const { metadataProviders } = require('../metadata/metadataProviders');
    const igdb = metadataProviders.get('video_game', 'IGDB');
    if (!igdb) { res.status(500).json({ error: 'IGDB provider not available' }); return; }
    const games = await knex('mediaItem').where({ mediaType: 'video_game' }).whereNotNull('igdbId').select('id','igdbId','runtime','title');
    let updated = 0, unchanged = 0, missing = 0, failed = 0;
    for (const g of games) {
      let ttb = null;
      try { ttb = await igdb.gameTimeToBeat(g.igdbId); }
      catch (_) { failed++; continue; }
      if (!ttb) { missing++; continue; }
      if (g.runtime === ttb) { unchanged++; continue; }
      try {
        await knex('mediaItem').where('id', g.id).update({ runtime: ttb });
        updated++;
      } catch (_) { failed++; }
    }
    res.json({ ok: true, total: games.length, updated, unchanged, missing, failed });
  });
  refreshGameRuntimeOne = (0, _typescriptRoutesToOpenapiServer.createExpressRoute)(async (req, res) => {
    const userId = Number(req.user);
    if (!userId) { res.status(401).json({ error: 'unauthenticated' }); return; }
    const id = Number(req.params.mediaItemId);
    if (!id) { res.status(400).json({ error: 'mediaItemId requerido' }); return; }
    const knex = _dbconfig.Database.knex;
    const { metadataProviders } = require('../metadata/metadataProviders');
    const igdb = metadataProviders.get('video_game', 'IGDB');
    if (!igdb) { res.status(500).json({ error: 'IGDB provider not available' }); return; }
    const g = await knex('mediaItem').where({ id, mediaType: 'video_game' }).whereNotNull('igdbId').first();
    if (!g) { res.status(404).json({ error: 'game not found or has no igdbId' }); return; }
    let ttb = null;
    try { ttb = await igdb.gameTimeToBeat(g.igdbId); }
    catch (e) { res.status(502).json({ error: 'IGDB error: ' + e.message }); return; }
    if (!ttb) { res.json({ ok: true, updated: false, reason: 'no time-to-beat from IGDB', runtime: g.runtime }); return; }
    if (g.runtime === ttb) { res.json({ ok: true, updated: false, reason: 'unchanged', runtime: ttb }); return; }
    await knex('mediaItem').where('id', id).update({ runtime: ttb });
    res.json({ ok: true, updated: true, runtime: ttb });
  });
  jellyfinIsAdmin = async (req, res) => {
    const userId = Number(req.user);
    if (!userId) { res.status(401).json({ error: 'login required' }); return false; }
    const u = await _dbconfig.Database.knex('user').where('id', userId).first();
    if (!u || !u.admin) { res.status(403).json({ error: 'admin only' }); return false; }
    return true;
  };
  jellyfinGetConfig = (0, _typescriptRoutesToOpenapiServer.createExpressRoute)(async (req, res) => {
    if (!(await this.jellyfinIsAdmin(req, res))) return;
    const fs = require('fs');
    let f = {};
    try { f = JSON.parse(fs.readFileSync('/storage/jellyfin-config.json', 'utf8')); } catch (_) {}
    res.json({
      url: f.url || '',
      apiKey: '',
      apiKeySet: !!f.apiKey,
      userId: f.userId || '',
      publicUrl: f.publicUrl || '',
      reverseSync: !!f.reverseSync,
      envFallback: { url: !!process.env.JELLYFIN_URL, apiKey: !!process.env.JELLYFIN_API_KEY, userId: !!process.env.JELLYFIN_USER_ID, publicUrl: !!process.env.JELLYFIN_PUBLIC_URL }
    });
  });
  jellyfinSaveConfig = (0, _typescriptRoutesToOpenapiServer.createExpressRoute)(async (req, res) => {
    if (!(await this.jellyfinIsAdmin(req, res))) return;
    const fs = require('fs');
    const body = req.body || {};
    let current = {};
    try { current = JSON.parse(fs.readFileSync('/storage/jellyfin-config.json', 'utf8')); } catch (_) {}
    // Normalize publicUrl to origin only — strips any /web/, /#/..., trailing
    // path/hash so the deeplink concatenation in jellyfinLookup can't be poisoned
    // by a value pasted straight from the JF address bar.
    const _normOrigin = function(u){ try { return u ? new URL(u).origin : ''; } catch (_) { return String(u || '').trim(); } };
    // apiKey: empty string means 'leave existing'; explicit null means 'clear'.
    const merged = {
      url: body.url !== undefined ? String(body.url || '').trim() : (current.url || ''),
      apiKey: body.apiKey === null ? '' : (body.apiKey ? String(body.apiKey).trim() : (current.apiKey || '')),
      userId: body.userId !== undefined ? String(body.userId || '').trim() : (current.userId || ''),
      publicUrl: body.publicUrl !== undefined ? _normOrigin(String(body.publicUrl || '').trim()) : (current.publicUrl || ''),
      reverseSync: body.reverseSync !== undefined ? !!body.reverseSync : !!current.reverseSync,
    };
    try { fs.writeFileSync('/storage/jellyfin-config.json', JSON.stringify(merged, null, 2), { mode: 0o600 }); }
    catch (e) { res.status(500).json({ error: e.message }); return; }
    if (global._jfLookupCache) global._jfLookupCache.clear();
    if (global._jfLibCache) global._jfLibCache.clear();
    if (global._jfReverseCache) global._jfReverseCache.clear();
    res.json({ ok: true });
  });
  jellyfinFetch = async (subpath) => {
    const fs = require('fs').promises;
    const url = _jfCfg().url;
    const token = _jfCfg().apiKey;
    if (!url || !token) throw new Error('Jellyfin not configured (set JELLYFIN_URL and JELLYFIN_API_KEY in docker-compose.yml)');
    const base = url.replace(/\/+$/, '');
    const r = await fetch(base + subpath, { headers: { 'X-Emby-Token': token, 'Accept': 'application/json' } });
    if (!r.ok) throw new Error('Jellyfin HTTP ' + r.status + ' on ' + subpath);
    return r.json();
  };
  jellyfinUserId = async () => {
    if (_jfCfg().userId) return _jfCfg().userId;
    const users = await this.jellyfinFetch('/Users');
    if (!users || !users[0]) throw new Error('No users on Jellyfin server');
    return users[0].Id;
  };
  jellyfinStatus = (0, _typescriptRoutesToOpenapiServer.createExpressRoute)(async (req, res) => {
    if (!(await this.jellyfinIsAdmin(req, res))) return;
    const fs = require('fs').promises;
    const url = _jfCfg().url;
    const token = _jfCfg().apiKey;
    if (!url || !token) { res.json({ configured: false }); return; }
    let state = {};
    try { state = JSON.parse(await fs.readFile('/storage/jellyfin-state.json', 'utf8')); } catch (_) {}
    try {
      const info = await this.jellyfinFetch('/System/Info');
      const userId = await this.jellyfinUserId();
      res.json(Object.assign({ configured: true, connected: true, serverName: info.ServerName, version: info.Version, userId }, state));
    } catch (e) {
      res.json(Object.assign({ configured: true, connected: false, error: e.message }, state));
    }
  });
  jellyfinSync = (0, _typescriptRoutesToOpenapiServer.createExpressRoute)(async (req, res) => {
    if (!(await this.jellyfinIsAdmin(req, res))) return;
    const fs = require('fs').promises;
    const userId = Number(req.user);
    const knex = _dbconfig.Database.knex;
    try {
      const jfUserId = await this.jellyfinUserId();
      const playedRes = await this.jellyfinFetch('/Users/' + jfUserId + '/Items?Filters=IsPlayed&Recursive=true&IncludeItemTypes=Movie,Episode&Fields=ProviderIds,UserData&Limit=10000');
      const items = (playedRes && playedRes.Items) || [];
      const seriesCache = new Map();
      let imported = 0, skipped = 0, unmatched = 0;
      for (const it of items) {
        const ud = it.UserData || {};
        const date = ud.LastPlayedDate ? new Date(ud.LastPlayedDate).getTime() : Date.now();
        if (it.Type === 'Movie') {
          const pids = it.ProviderIds || {};
          const tmdb = pids.Tmdb ? Number(pids.Tmdb) : null;
          const imdb = pids.Imdb || null;
          let media = null;
          if (tmdb) media = await knex('mediaItem').where({ mediaType: 'movie', tmdbId: tmdb }).first();
          if (!media && imdb) media = await knex('mediaItem').where({ mediaType: 'movie', imdbId: imdb }).first();
          if (!media) { unmatched++; continue; }
          const exists = await knex('seen').where({ userId, mediaItemId: media.id, date }).first();
          if (exists) { skipped++; continue; }
          await knex('seen').insert({ userId, mediaItemId: media.id, episodeId: null, date });
          imported++;
        } else if (it.Type === 'Episode' && it.SeriesId && it.ParentIndexNumber != null && it.IndexNumber != null) {
          let series = seriesCache.get(it.SeriesId);
          if (series === undefined) {
            try { const s = await this.jellyfinFetch('/Users/' + jfUserId + '/Items/' + it.SeriesId + '?Fields=ProviderIds'); series = (s && s.ProviderIds) || {}; }
            catch (_) { series = {}; }
            seriesCache.set(it.SeriesId, series);
          }
          const tvdb = series.Tvdb ? Number(series.Tvdb) : null;
          const tmdb = series.Tmdb ? Number(series.Tmdb) : null;
          const imdb = series.Imdb || null;
          let show = null;
          if (tvdb) show = await knex('mediaItem').where({ mediaType: 'tv', tvdbId: tvdb }).first();
          if (!show && tmdb) show = await knex('mediaItem').where({ mediaType: 'tv', tmdbId: tmdb }).first();
          if (!show && imdb) show = await knex('mediaItem').where({ mediaType: 'tv', imdbId: imdb }).first();
          if (!show) { unmatched++; continue; }
          const ep = await knex('episode').where({ tvShowId: show.id, seasonNumber: it.ParentIndexNumber, episodeNumber: it.IndexNumber }).first();
          if (!ep) { unmatched++; continue; }
          const exists = await knex('seen').where({ userId, mediaItemId: show.id, episodeId: ep.id, date }).first();
          if (exists) { skipped++; continue; }
          await knex('seen').insert({ userId, mediaItemId: show.id, episodeId: ep.id, date });
          imported++;
        } else { unmatched++; }
      }
      const state = { lastSync: new Date().toISOString(), lastImported: imported, lastSkipped: skipped, lastUnmatched: unmatched, lastTotal: items.length };
      try { { const _t='/storage/jellyfin-state.json.tmp.'+process.pid; await fs.writeFile(_t,JSON.stringify(state)); await fs.rename(_t,'/storage/jellyfin-state.json'); }; } catch (_) {}
      res.json(Object.assign({ ok: true }, state));
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
  jellyfinSyncDownloaded = (0, _typescriptRoutesToOpenapiServer.createExpressRoute)(async (req, res) => {
    if (!(await this.jellyfinIsAdmin(req, res))) return;
    if (!_jfCfg().url || !_jfCfg().apiKey) { res.json({ ok: false, configured: false }); return; }
    const knex = _dbconfig.Database.knex;
    try {
      const userId = await this.jellyfinUserId();
      const list = await this.jellyfinFetch('/Users/' + userId + '/Items?Recursive=true&IncludeItemTypes=Movie,Series&Fields=ProviderIds&Limit=20000');
      const items = list.Items || [];
      let marked = 0, alreadyMarked = 0, unmatched = 0;
      const foundIds = new Set();
      for (const it of items) {
        const p = it.ProviderIds || {};
        const mt = it.Type === 'Movie' ? 'movie' : it.Type === 'Series' ? 'tv' : null;
        if (!mt) continue;
        let media = null;
        if (p.Tmdb) media = await knex('mediaItem').where({ mediaType: mt, tmdbId: Number(p.Tmdb) }).first();
        if (!media && p.Imdb) media = await knex('mediaItem').where({ mediaType: mt, imdbId: p.Imdb }).first();
        if (!media && p.Tvdb && mt === 'tv') media = await knex('mediaItem').where({ mediaType: mt, tvdbId: Number(p.Tvdb) }).first();
        if (!media) { unmatched++; continue; }
        foundIds.add(media.id);
        if (media.downloaded) { alreadyMarked++; continue; }
        await knex('mediaItem').where('id', media.id).update('downloaded', true);
        marked++;
      }
      // Bidirectional: clear the downloaded flag for movies/tv currently marked
      // but no longer present in JF (treat JF as authoritative for those types).
      // Skip if JF returned zero items — likely an API hiccup, don't mass-clear.
      // Two-pass match: (1) ProviderIds (already done above into foundIds),
      // (2) normalized-title substring against ANY JF Name, to catch JF library
      // items with garbled filenames whose metadata never matched against TMDB.
      let unmarked = 0;
      if (items.length > 0) {
        const _norm = function(s){ return String(s||'').toLowerCase().replace(/[^a-z0-9]/g,''); };
        const _words = function(s){ return String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').split(' ').filter(w => w.length >= 4); };
        const jfNames = items.filter(it => it.Type === 'Movie' || it.Type === 'Series').map(it => _norm(it.Name));
        const staleQ = knex('mediaItem').where('downloaded', true).whereIn('mediaType', ['movie','tv']);
        if (foundIds.size > 0) staleQ.whereNotIn('id', Array.from(foundIds));
        const candidates = await staleQ.select('id', 'title', 'originalTitle');
        const toUnmark = candidates.filter(r => {
          const ws = [..._words(r.title), ..._words(r.originalTitle)];
          if (ws.length === 0) return true;
          // Match if any significant word appears in any JF normalized name.
          return !jfNames.some(name => ws.some(w => name.includes(w)));
        }).map(r => r.id);
        if (toUnmark.length > 0) unmarked = await knex('mediaItem').whereIn('id', toUnmark).update('downloaded', false);
      }
      res.json({ ok: true, jellyfinItems: items.length, newlyMarked: marked, alreadyMarked, unmatched, newlyUnmarked: unmarked });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
  jellyfinLibraryIds = (0, _typescriptRoutesToOpenapiServer.createExpressRoute)(async (req, res) => {
    if (!(await this.jellyfinIsAdmin(req, res))) return;
    if (!_jfCfg().url || !_jfCfg().apiKey) { res.json({ tmdb: [], imdb: [], tvdb: [] }); return; }
    try {
      const userId = await this.jellyfinUserId();
      const cacheKey = 'lib:' + userId;
      const now = Date.now();
      if (!global._jfLibCache) global._jfLibCache = new Map();
      let entry = global._jfLibCache.get(cacheKey);
      if (!entry || (now - entry.at) > 5 * 60 * 1000) {
        const list = await this.jellyfinFetch('/Users/' + userId + '/Items?Recursive=true&IncludeItemTypes=Movie,Series&Fields=ProviderIds&Limit=20000');
        const tmdb = [], imdb = [], tvdb = [];
        (list.Items || []).forEach(it => {
          const p = it.ProviderIds || {};
          if (p.Tmdb) tmdb.push(String(p.Tmdb));
          if (p.Imdb) imdb.push(String(p.Imdb));
          if (p.Tvdb) tvdb.push(String(p.Tvdb));
        });
        entry = { at: now, ids: { tmdb, imdb, tvdb } };
        global._jfLibCache.set(cacheKey, entry); if (global._jfLibCache.size > 1000) global._jfLibCache.delete(global._jfLibCache.keys().next().value);
      }
      res.json(entry.ids);
    } catch (e) {
      res.json({ tmdb: [], imdb: [], tvdb: [], error: e.message });
    }
  });
  jellyfinLookup = (0, _typescriptRoutesToOpenapiServer.createExpressRoute)(async (req, res) => {
    if (!(await this.jellyfinIsAdmin(req, res))) return;
    const url = _jfCfg().url;
    if (!url || !_jfCfg().apiKey) { res.json({ found: false, configured: false }); return; }
    try {
      const userId = await this.jellyfinUserId();
      const tmdbId = req.query.tmdbId ? String(req.query.tmdbId) : null;
      const imdbId = req.query.imdbId ? String(req.query.imdbId) : null;
      const tvdbId = req.query.tvdbId ? String(req.query.tvdbId) : null;
      const mediaType = req.query.mediaType;
      if (!tmdbId && !imdbId && !tvdbId) { res.status(400).json({ error: 'tmdbId, imdbId or tvdbId required' }); return; }
      // Jellyfin's AnyProviderIdEquals filter is unreliable on 10.10.x — list all items
      // of the right type once (cached in-memory for 5 min) and filter client-side.
      const types = mediaType === 'movie' ? 'Movie' : mediaType === 'tv' ? 'Series' : 'Movie,Series';
      const cacheKey = userId + ':' + types;
      const now = Date.now();
      if (!global._jfLookupCache) global._jfLookupCache = new Map();
      let entry = global._jfLookupCache.get(cacheKey);
      if (!entry || (now - entry.at) > 5 * 60 * 1000) {
        const list = await this.jellyfinFetch('/Users/' + userId + '/Items?Recursive=true&IncludeItemTypes=' + types + '&Fields=ProviderIds&Limit=10000');
        entry = { at: now, items: list.Items || [] };
        global._jfLookupCache.set(cacheKey, entry); if (global._jfLookupCache.size > 1000) global._jfLookupCache.delete(global._jfLookupCache.keys().next().value);
      }
      const item = entry.items.find(it => {
        const p = it.ProviderIds || {};
        if (tmdbId && p.Tmdb && String(p.Tmdb) === tmdbId) return true;
        if (imdbId && p.Imdb && String(p.Imdb) === imdbId) return true;
        if (tvdbId && p.Tvdb && String(p.Tvdb) === tvdbId) return true;
        return false;
      });
      if (!item) { res.json({ found: false }); return; }
      const publicUrl = _jfCfg().publicUrl || url;
      const base = publicUrl.replace(/\/+$/, '');
      res.json({ found: true, itemId: item.Id, name: item.Name, type: item.Type, deeplink: base + '/web/#/details?id=' + item.Id + '&serverId=' + (item.ServerId || '') });
    } catch (e) {
      res.json({ found: false, error: e.message });
    }
  });
  youtubeChannels = (0, _typescriptRoutesToOpenapiServer.createExpressRoute)(async (req, res) => {
    const fs = require('fs').promises;
    const userId = Number(req.user);
    const file = '/storage/youtube-' + userId + '.json';
    let data = { channels: [] };
    try { data = JSON.parse(await fs.readFile(file, 'utf8')); } catch (_) {}
    res.json(data.channels || []);
  });
  youtubeAddChannel = (0, _typescriptRoutesToOpenapiServer.createExpressRoute)(async (req, res) => {
    const fs = require('fs').promises;
    const userId = Number(req.user);
    const file = '/storage/youtube-' + userId + '.json';
    const input = (req.body && req.body.input || '').trim();
    if (!input) { res.status(400).json({ error: 'input requerido' }); return; }
    // Resolve to channel ID + name
    let channelId = null, name = null;
    const m = input.match(/(?:channel\/)?(UC[A-Za-z0-9_-]{20,24})/);
    if (m) channelId = m[1];
    if (!channelId) {
      // Try to resolve @handle or username via fetch.
      // SSRF mitigation: only allow URLs to youtube.com/youtu.be — otherwise an attacker
      // could pivot to internal services on the docker network (http://jellyfin:8096, etc.)
      let url = input;
      if (!url.startsWith('http')) {
        if (url.startsWith('@')) url = 'https://www.youtube.com/' + url;
        else url = 'https://www.youtube.com/@' + url;
      } else {
        try {
          const u = new URL(url);
          const host = u.hostname.toLowerCase();
          const allowed = host === 'youtube.com' || host === 'www.youtube.com' || host === 'm.youtube.com' || host === 'youtu.be';
          if (!allowed || u.protocol !== 'https:') {
            res.status(400).json({ error: 'Solo se aceptan URLs de youtube.com / youtu.be' }); return;
          }
        } catch (_) {
          res.status(400).json({ error: 'URL inválida' }); return;
        }
      }
      let fetchStatus = null;
      try {
        const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        fetchStatus = r.status;
        const html = await r.text();
        // Prefer the canonical link (always points to the page's own channel)
        const canon = html.match(/<link rel="canonical" href="https?:\/\/www\.youtube\.com\/channel\/(UC[A-Za-z0-9_-]{20,24})"/);
        if (canon) channelId = canon[1];
        if (!channelId) {
          const cm = html.match(/"externalId":"(UC[A-Za-z0-9_-]{20,24})"/);
          if (cm) channelId = cm[1];
        }
        const tm = html.match(/<title>([^<]+) - YouTube<\/title>/);
        if (tm) name = tm[1];
      } catch (_) {}
      if (!channelId && fetchStatus === 404) {
        res.status(404).json({ error: 'El canal o el handle no existe en YouTube (404). Comprueba el @handle o pega el ID UCxxxx.' }); return;
      }
    }
    if (!channelId) { res.status(400).json({ error: 'No se pudo resolver el canal. Pega el ID UCxxxx o la URL completa.' }); return; }
    if (!name) {
      // Fetch RSS to get channel title
      try {
        const r = await fetch('https://www.youtube.com/feeds/videos.xml?channel_id=' + channelId);
        const xml = await r.text();
        const tm = xml.match(/<title>([^<]+)<\/title>/);
        if (tm) name = tm[1];
      } catch (_) {}
    }
    let data = { channels: [] };
    try { data = JSON.parse(await fs.readFile(file, 'utf8')); } catch (_) {}
    if ((data.channels || []).find(c => c.id === channelId)) { res.json({ ok: true, alreadyAdded: true, channel: { id: channelId, name } }); return; }
    data.channels = [...(data.channels || []), { id: channelId, name: name || channelId, addedAt: Date.now() }];
    // Atomic write — tempfile + rename so a crash mid-write can't corrupt the JSON.
    const tmp = file + '.tmp.' + process.pid;
    await fs.writeFile(tmp, JSON.stringify(data, null, 2));
    await fs.rename(tmp, file);
    res.json({ ok: true, channel: data.channels[data.channels.length - 1] });
  });
  youtubeDeleteChannel = (0, _typescriptRoutesToOpenapiServer.createExpressRoute)(async (req, res) => {
    const fs = require('fs').promises;
    const userId = Number(req.user);
    const file = '/storage/youtube-' + userId + '.json';
    const id = req.params.id;
    let data = { channels: [] };
    try { data = JSON.parse(await fs.readFile(file, 'utf8')); } catch (_) {}
    const before = (data.channels || []).length;
    data.channels = (data.channels || []).filter(c => c.id !== id);
    const tmp = file + '.tmp.' + process.pid;
    await fs.writeFile(tmp, JSON.stringify(data, null, 2));
    await fs.rename(tmp, file);
    res.json({ ok: true, removed: before - data.channels.length });
  });
  youtubeFeed = (0, _typescriptRoutesToOpenapiServer.createExpressRoute)(async (req, res) => {
    const fs = require('fs').promises;
    const userId = Number(req.user);
    const file = '/storage/youtube-' + userId + '.json';
    let data = { channels: [] };
    try { data = JSON.parse(await fs.readFile(file, 'utf8')); } catch (_) {}
    const channels = data.channels || [];
    if (channels.length === 0) { res.json({ videos: [] }); return; }
    // Per-channel cache (5 min TTL). Keyed by channelId — global, shared across users
    // because RSS content is the same for everyone. Adding/removing channels does
    // NOT invalidate the others (vs. the previous "key = sorted list of channels"
    // which caused every channel to be re-fetched on add/remove → if any single
    // RSS hit was rate-limited, that channel's videos vanished from the feed).
    //
    // Persisted to disk (/storage/youtube-feed-cache.json) so it survives container
    // restarts — important because YouTube's RSS endpoint has been throwing 404s
    // for hours at a time since Dec-2025; without persistence, every restart would
    // empty the cache and leave the feed at 0 videos until YouTube recovered.
    const cacheFile = '/storage/youtube-feed-cache.json';
    const CACHE_MAX = 1000;
    const CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
    if (!global._ytChannelCache) {
      global._ytChannelCache = new Map();
      try {
        const raw = JSON.parse(await fs.readFile(cacheFile, 'utf8'));
        const cutoff = Date.now() - CACHE_MAX_AGE_MS;
        // Sort entries newest-first so trimming to CACHE_MAX keeps the freshest.
        const sorted = Object.entries(raw || {})
          .filter(([, v]) => v && Array.isArray(v.entries) && typeof v.at === 'number' && v.at >= cutoff)
          .sort((a, b) => b[1].at - a[1].at)
          .slice(0, CACHE_MAX);
        for (const [id, v] of sorted) global._ytChannelCache.set(id, v);
      } catch (_) {}
    }
    const persistCache = async () => {
      try {
        const obj = {};
        for (const [id, v] of global._ytChannelCache) obj[id] = v;
        const tmp = cacheFile + '.tmp.' + process.pid;
        await fs.writeFile(tmp, JSON.stringify(obj));
        await fs.rename(tmp, cacheFile);
      } catch (_) {}
    };
    const TTL = 5 * 60 * 1000;
    const now = Date.now();
    const fresh = req.query && req.query.fresh === '1';
    let cacheDirty = false;
    const fetchChannel = async (ch) => {
      const cached = global._ytChannelCache.get(ch.id);
      if (!fresh && cached && (now - cached.at) < TTL) return cached.entries;
      try {
        const r = await fetch('https://www.youtube.com/feeds/videos.xml?channel_id=' + ch.id, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        if (!r.ok) {
          // Rate-limit / 5xx / YouTube's recurring 404 outage: fall back to last-known-good
          // entries for this channel instead of returning [] (which would make the channel
          // disappear from the feed during the outage).
          return cached ? cached.entries : [];
        }
        const xml = await r.text();
        const channelTitleMatch = xml.match(/<title>([^<]+)<\/title>/);
        const channelTitle = channelTitleMatch ? channelTitleMatch[1] : ch.name;
        const entries = [];
        const re = /<entry>([\s\S]*?)<\/entry>/g;
        let m;
        while ((m = re.exec(xml)) !== null) {
          const block = m[1];
          const idM = block.match(/<yt:videoId>([^<]+)<\/yt:videoId>/);
          const titleM = block.match(/<title>([^<]+)<\/title>/);
          const pubM = block.match(/<published>([^<]+)<\/published>/);
          const thumbM = block.match(/<media:thumbnail url="([^"]+)"/);
          if (idM && titleM && pubM) {
            entries.push({
              videoId: idM[1],
              title: titleM[1].replace(/&amp;/g, '&'),
              published: pubM[1],
              thumbnail: thumbM ? thumbM[1] : 'https://i.ytimg.com/vi/' + idM[1] + '/hqdefault.jpg',
              channelName: channelTitle,
              channelId: ch.id,
              url: 'https://www.youtube.com/watch?v=' + idM[1]
            });
          }
        }
        // Cap per-channel to the 4 most-recent videos so the feed doesn't drown in
        // one prolific channel's uploads.
        const sorted = entries.sort((a, b) => new Date(b.published) - new Date(a.published)).slice(0, 4);
        // Only refresh the cache entry if we got something — an empty parse on a
        // 200 response (rare, but happens when YouTube serves an HTML error page
        // with status 200) would otherwise overwrite good data with [].
        if (sorted.length > 0) {
          global._ytChannelCache.set(ch.id, { at: now, entries: sorted });
          // LRU trim: insertion-order Map → drop the oldest when over cap.
          if (global._ytChannelCache.size > CACHE_MAX) {
            global._ytChannelCache.delete(global._ytChannelCache.keys().next().value);
          }
          cacheDirty = true;
          return sorted;
        }
        return cached ? cached.entries : [];
      } catch (e) {
        return cached ? cached.entries : [];
      }
    };
    // Concurrency-limited fan-out: with N channels, only run K=5 in parallel
    // at any moment so we don't fan out 50+ requests against YouTube RSS at
    // once (which sometimes triggers 429s during their flaky-RSS windows).
    // Worker-pool — each of K workers picks the next available channel.
    const _CONCURRENCY = 5;
    const results = new Array(channels.length);
    let _next = 0;
    const _workers = Array.from({ length: Math.min(_CONCURRENCY, channels.length) }, async () => {
      while (_next < channels.length) {
        const idx = _next++;
        results[idx] = await fetchChannel(channels[idx]);
      }
    });
    await Promise.all(_workers);
    if (cacheDirty) await persistCache();
    const videos = [].concat(...results).sort((a, b) => new Date(b.published) - new Date(a.published)).slice(0, 100);
    res.json({ videos });
  });
  youtubeOauthStart = (0, _typescriptRoutesToOpenapiServer.createExpressRoute)(async (req, res) => {
    const userId = Number(req.user);
    if (!userId) { res.status(401).json({ error: 'unauthenticated' }); return; }
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI;
    if (!clientId || !redirectUri) { res.status(500).json({ error: 'GOOGLE_CLIENT_ID or GOOGLE_REDIRECT_URI not configured' }); return; }
    if (!global._ytOauthStates) global._ytOauthStates = new Map();
    // GC stale states (>10 min)
    const cutoff = Date.now() - 600000;
    for (const [k, v] of global._ytOauthStates) { if (v.ts < cutoff) global._ytOauthStates.delete(k); }
    const state = require('crypto').randomBytes(16).toString('hex');
    global._ytOauthStates.set(state, { userId: userId, ts: Date.now() });
    const url = 'https://accounts.google.com/o/oauth2/v2/auth?' +
      'client_id=' + encodeURIComponent(clientId) +
      '&redirect_uri=' + encodeURIComponent(redirectUri) +
      '&response_type=code' +
      '&scope=' + encodeURIComponent('https://www.googleapis.com/auth/youtube.readonly') +
      '&access_type=offline' +
      // prompt=consent forces re-consent so we always get a refresh_token even if the user
      // already authorized this app once before (Google only issues refresh_token on first consent otherwise).
      // prompt=select_account shows the account picker so users with multiple Google accounts can pick.
      '&prompt=' + encodeURIComponent('consent select_account') +
      '&state=' + state;
    res.redirect(url);
  });
  youtubeOauthCallback = (0, _typescriptRoutesToOpenapiServer.createExpressRoute)(async (req, res) => {
    const fs = require('fs').promises;
    const reqUserId = Number(req.user);
    if (!reqUserId) { res.status(401).send('unauthenticated — log in to MediaOCD first and retry'); return; }
    const code = req.query.code;
    const state = req.query.state;
    const err = req.query.error;
    if (err) { res.status(400).send('Google authorization denied: ' + err); return; }
    if (!code || !state) { res.status(400).send('missing code or state'); return; }
    if (!global._ytOauthStates) global._ytOauthStates = new Map();
    const stateEntry = global._ytOauthStates.get(state);
    if (!stateEntry) { res.status(400).send('invalid or expired state'); return; }
    global._ytOauthStates.delete(state);
    if (Date.now() - stateEntry.ts > 600000) { res.status(400).send('expired state'); return; }
    if (stateEntry.userId !== reqUserId) { res.status(403).send('state user mismatch'); return; }
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI;
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: code, client_id: clientId, client_secret: clientSecret,
        redirect_uri: redirectUri, grant_type: 'authorization_code'
      })
    });
    const tokens = await tokenRes.json();
    if (tokens.error) { res.status(400).send('token exchange failed: ' + tokens.error_description || tokens.error); return; }
    let email = null;
    try {
      const u = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: 'Bearer ' + tokens.access_token } });
      const info = await u.json();
      email = info.email || null;
    } catch (_) {}
    const file = '/storage/youtube-' + reqUserId + '.json';
    let data = { channels: [] };
    try { data = JSON.parse(await fs.readFile(file, 'utf8')); } catch (_) {}
    data.auth = {
      accessToken: tokens.access_token,
      // Keep prior refresh_token if Google didn't issue a new one (e.g. re-consent without prompt=consent)
      refreshToken: tokens.refresh_token || (data.auth && data.auth.refreshToken) || null,
      expiresAt: Date.now() + (tokens.expires_in || 3600) * 1000,
      email: email,
      connectedAt: Date.now()
    };
    { const _wTmp = file + '.tmp.' + process.pid; await fs.writeFile(_wTmp, JSON.stringify(data, null, 2)); await fs.rename(_wTmp, file); }
    res.redirect('/#/youtube');
  });
  youtubeOauthStatus = (0, _typescriptRoutesToOpenapiServer.createExpressRoute)(async (req, res) => {
    const fs = require('fs').promises;
    const userId = Number(req.user);
    const file = '/storage/youtube-' + userId + '.json';
    let data = {};
    try { data = JSON.parse(await fs.readFile(file, 'utf8')); } catch (_) {}
    if (!data.auth || !data.auth.refreshToken) { res.json({ connected: false }); return; }
    res.json({ connected: true, email: data.auth.email || null, connectedAt: data.auth.connectedAt || null });
  });
  youtubeOauthSync = (0, _typescriptRoutesToOpenapiServer.createExpressRoute)(async (req, res) => {
    const fs = require('fs').promises;
    const userId = Number(req.user);
    const file = '/storage/youtube-' + userId + '.json';
    let data = { channels: [] };
    try { data = JSON.parse(await fs.readFile(file, 'utf8')); } catch (_) {}
    if (!data.auth || !data.auth.refreshToken) { res.status(400).json({ error: 'not connected' }); return; }
    let accessToken = data.auth.accessToken;
    // Refresh if expired (or about to in <60s)
    if (Date.now() >= (data.auth.expiresAt - 60000)) {
      const r = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          refresh_token: data.auth.refreshToken,
          client_id: process.env.GOOGLE_CLIENT_ID,
          client_secret: process.env.GOOGLE_CLIENT_SECRET,
          grant_type: 'refresh_token'
        })
      });
      const t = await r.json();
      if (t.error) { res.status(400).json({ error: 'refresh failed: ' + (t.error_description || t.error) }); return; }
      accessToken = t.access_token;
      data.auth.accessToken = accessToken;
      data.auth.expiresAt = Date.now() + (t.expires_in || 3600) * 1000;
      { const _wTmp = file + '.tmp.' + process.pid; await fs.writeFile(_wTmp, JSON.stringify(data, null, 2)); await fs.rename(_wTmp, file); }
    }
    // Paginate subscriptions (50 per page, cap at 1000 total = 20 pages)
    const subs = [];
    let pageToken = '';
    for (let i = 0; i < 20; i++) {
      const url = 'https://www.googleapis.com/youtube/v3/subscriptions?part=snippet&mine=true&maxResults=50&order=alphabetical' + (pageToken ? '&pageToken=' + pageToken : '');
      const r = await fetch(url, { headers: { Authorization: 'Bearer ' + accessToken } });
      const j = await r.json();
      if (j.error) { res.status(400).json({ error: 'subscriptions: ' + (j.error.message || JSON.stringify(j.error)) }); return; }
      for (const item of (j.items || [])) {
        const channelId = item.snippet && item.snippet.resourceId && item.snippet.resourceId.channelId;
        const name = item.snippet && item.snippet.title;
        if (channelId) subs.push({ id: channelId, name: name });
      }
      if (!j.nextPageToken) break;
      pageToken = j.nextPageToken;
    }
    const existing = new Set((data.channels || []).map(c => c.id));
    let added = 0;
    for (const s of subs) {
      if (!existing.has(s.id)) {
        data.channels.push({ id: s.id, name: s.name || s.id, addedAt: Date.now() });
        added++;
      }
    }
    { const _wTmp = file + '.tmp.' + process.pid; await fs.writeFile(_wTmp, JSON.stringify(data, null, 2)); await fs.rename(_wTmp, file); }
    res.json({ ok: true, total: subs.length, added: added, skipped: subs.length - added });
  });
  youtubeOauthDelete = (0, _typescriptRoutesToOpenapiServer.createExpressRoute)(async (req, res) => {
    const fs = require('fs').promises;
    const userId = Number(req.user);
    const file = '/storage/youtube-' + userId + '.json';
    let data = {};
    try { data = JSON.parse(await fs.readFile(file, 'utf8')); } catch (_) {}
    if (data.auth && data.auth.refreshToken) {
      try { await fetch('https://oauth2.googleapis.com/revoke?token=' + encodeURIComponent(data.auth.refreshToken), { method: 'POST' }); } catch (_) {}
    }
    delete data.auth;
    { const _wTmp = file + '.tmp.' + process.pid; await fs.writeFile(_wTmp, JSON.stringify(data, null, 2)); await fs.rename(_wTmp, file); }
    res.json({ ok: true });
  });
  _ytParseDuration = (iso) => {
    // ISO 8601 duration: PT#H#M#S (any field optional). Returns seconds.
    if (!iso || typeof iso !== 'string') return 0;
    const m = iso.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
    if (!m) return 0;
    const h = Number(m[1] || 0), mn = Number(m[2] || 0), s = Number(m[3] || 0);
    return h * 3600 + mn * 60 + s;
  };
  _ytRefreshToken = async (data, file) => {
    // Refresh the OAuth access token if it's expired (or expires in <60s).
    // Mutates and persists `data.auth`. Returns the access token.
    const fs = require('fs').promises;
    if (!data.auth || !data.auth.refreshToken) throw new Error('Google OAuth not connected (Settings → YouTube)');
    if (Date.now() < (data.auth.expiresAt - 60000)) return data.auth.accessToken;
    const r = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: data.auth.refreshToken,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        grant_type: 'refresh_token'
      })
    });
    const t = await r.json();
    if (t.error) throw new Error('refresh failed: ' + (t.error_description || t.error));
    data.auth.accessToken = t.access_token;
    data.auth.expiresAt = Date.now() + (t.expires_in || 3600) * 1000;
    { const _wTmp = file + '.tmp.' + process.pid; await fs.writeFile(_wTmp, JSON.stringify(data, null, 2)); await fs.rename(_wTmp, file); }
    return t.access_token;
  };
  /*mediaocd:yt-duration-resilient*/
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
      const m = html.match(/"lengthSeconds":"(\d+)"/);
      if (m) return Number(m[1]);
      const ms = html.match(/"approxDurationMs":"(\d+)"/);
      if (ms) return Math.round(Number(ms[1]) / 1000);
      console.log('[yt-duration] scrape sin duracion para ' + videoId +
        ' (http ' + r.status + ', ' + html.length + ' bytes, botcheck=' +
        /consent\.youtube\.com|not a bot|unusual traffic/i.test(html) + ')');
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
  youtubeMarkWatched = (0, _typescriptRoutesToOpenapiServer.createExpressRoute)(async (req, res) => {
    const fs = require('fs').promises;
    const userId = Number(req.user);
    if (!userId) { res.status(401).json({ error: 'unauthenticated' }); return; }
    const file = '/storage/youtube-' + userId + '.json';
    const body = req.body || {};
    const videoId = String(body.videoId || '').trim();
    if (!videoId || !/^[A-Za-z0-9_-]{11}$/.test(videoId)) { res.status(400).json({ error: 'videoId requerido (11 chars)' }); return; }
    let data = { channels: [], watched: [] };
    try { data = JSON.parse(await fs.readFile(file, 'utf8')); } catch (_) {}
    if (!Array.isArray(data.watched)) data.watched = [];
    if (data.watched.find(w => w.videoId === videoId)) {
      res.json({ ok: true, alreadyMarked: true });
      return;
    }
    let durationSeconds = 0;
    // Try OAuth-based YouTube Data API first (more reliable, has rate limits but
    // returns clean ISO 8601 duration). Fall back to scraping the watch page for
    // `lengthSeconds` so users without an OAuth-linked Google account can still
    // use the feature.
    let oauthErr = null;
    try {
      const accessToken = await this._ytRefreshToken(data, file);
      const r = await fetch('https://www.googleapis.com/youtube/v3/videos?id=' + encodeURIComponent(videoId) + '&part=contentDetails', {
        headers: { Authorization: 'Bearer ' + accessToken }
      });
      const j = await r.json();
      if (j.error) throw new Error('YouTube API: ' + (j.error.message || JSON.stringify(j.error)));
      const item = (j.items || [])[0];
      if (!item) throw new Error('video no encontrado en YouTube');
      durationSeconds = this._ytParseDuration(item.contentDetails && item.contentDetails.duration);
    } catch (e) {
      oauthErr = e.message;
    }
    if (!durationSeconds) durationSeconds = await this._ytLookupDuration(videoId);
    // A duration we cannot resolve right now is not a reason to refuse the mark:
    // save it as pending and let _ytResolvePending fill it in later.
    if (!durationSeconds) console.log('[yt-duration] ' + videoId + ' guardado sin duracion (pendiente)' + (oauthErr ? ' [OAuth: ' + oauthErr + ']' : ''));
    const entry = {
      videoId,
      channelId: body.channelId ? String(body.channelId) : null,
      channelName: body.channelName ? String(body.channelName) : null,
      title: body.title ? String(body.title) : null,
      thumbnail: body.thumbnail ? String(body.thumbnail) : null,
      url: body.url ? String(body.url) : ('https://www.youtube.com/watch?v=' + videoId),
      durationSeconds,
      watchedAt: Date.now()
    };
    if (!durationSeconds) entry.durationPending = true;
    // Re-read: the duration lookup above took seconds, and another mark (or the
    // token refresh) may have rewritten the file meanwhile — writing `data` as it
    // was read would drop those entries. No await between read and write, so this
    // is atomic for the single-threaded event loop.
    try { data = JSON.parse(await fs.readFile(file, 'utf8')); } catch (_) {}
    if (!Array.isArray(data.watched)) data.watched = [];
    if (!data.watched.find(w => w.videoId === videoId)) data.watched.push(entry);
    try { { const _wTmp = file + '.tmp.' + process.pid; await fs.writeFile(_wTmp, JSON.stringify(data, null, 2)); await fs.rename(_wTmp, file); } }
    catch (e) { res.status(500).json({ error: 'persist failed: ' + e.message }); return; }
    res.json({ ok: true, durationSeconds, durationPending: !durationSeconds });
  });
  youtubeUnmarkWatched = (0, _typescriptRoutesToOpenapiServer.createExpressRoute)(async (req, res) => {
    const fs = require('fs').promises;
    const userId = Number(req.user);
    if (!userId) { res.status(401).json({ error: 'unauthenticated' }); return; }
    const file = '/storage/youtube-' + userId + '.json';
    const videoId = String(req.params.videoId || '').trim();
    if (!videoId) { res.status(400).json({ error: 'videoId requerido' }); return; }
    let data = { channels: [], watched: [] };
    try { data = JSON.parse(await fs.readFile(file, 'utf8')); } catch (_) {}
    if (!Array.isArray(data.watched)) data.watched = [];
    const before = data.watched.length;
    data.watched = data.watched.filter(w => w.videoId !== videoId);
    if (data.watched.length === before) { res.status(404).json({ error: 'no marcado' }); return; }
    try { { const _wTmp = file + '.tmp.' + process.pid; await fs.writeFile(_wTmp, JSON.stringify(data, null, 2)); await fs.rename(_wTmp, file); } }
    catch (e) { res.status(500).json({ error: e.message }); return; }
    res.json({ ok: true });
  });
  youtubeWatchedStats = (0, _typescriptRoutesToOpenapiServer.createExpressRoute)(async (req, res) => {
    const fs = require('fs').promises;
    const userId = Number(req.user);
    if (!userId) { res.status(401).json({ error: 'unauthenticated' }); return; }
    const file = '/storage/youtube-' + userId + '.json';
    let data = { channels: [], watched: [] };
    try { data = JSON.parse(await fs.readFile(file, 'utf8')); } catch (_) {}
    const arr = Array.isArray(data.watched) ? data.watched : [];
    const totalSeconds = arr.reduce((sum, w) => sum + (Number(w.durationSeconds) || 0), 0);
    res.json({ count: arr.length, totalSeconds, totalMinutes: Math.round(totalSeconds / 60), videoIds: arr.map(w => w.videoId) });
    if (arr.some(w => !Number(w.durationSeconds))) this._ytResolvePending(file).catch(() => {});
  });
  abandonedAdd = (0, _typescriptRoutesToOpenapiServer.createExpressRoute)(async (req, res) => {
    const userId = Number(req.user);
    if (!userId) { res.status(401).json({ error: 'unauthenticated' }); return; }
    const mediaItemId = Number(req.params.mediaItemId);
    if (!mediaItemId) { res.status(400).json({ error: 'mediaItemId requerido' }); return; }
    const knex = _dbconfig.Database.knex;
    const mi = await knex('mediaItem').where('id', mediaItemId).first('id');
    if (!mi) { res.status(404).json({ error: 'mediaItem no encontrado' }); return; }
    await knex.raw('INSERT OR IGNORE INTO abandoned (userId, mediaItemId, date) VALUES (?, ?, ?)', [userId, mediaItemId, Date.now()]);
    res.json({ ok: true });
  });
  abandonedRemove = (0, _typescriptRoutesToOpenapiServer.createExpressRoute)(async (req, res) => {
    const userId = Number(req.user);
    if (!userId) { res.status(401).json({ error: 'unauthenticated' }); return; }
    const mediaItemId = Number(req.params.mediaItemId);
    if (!mediaItemId) { res.status(400).json({ error: 'mediaItemId requerido' }); return; }
    const knex = _dbconfig.Database.knex;
    await knex('abandoned').where({ userId, mediaItemId }).delete();
    res.json({ ok: true });
  });
  abandonedList = (0, _typescriptRoutesToOpenapiServer.createExpressRoute)(async (req, res) => {
    const userId = Number(req.user);
    if (!userId) { res.status(401).json({ error: 'unauthenticated' }); return; }
    const knex = _dbconfig.Database.knex;
    const rows = await knex('abandoned').where('userId', userId).select('mediaItemId', 'date');
    res.json({ items: rows.map(r => r.mediaItemId), full: rows });
  });
  activelyInProgressAdd = (0, _typescriptRoutesToOpenapiServer.createExpressRoute)(async (req, res) => {
    const userId = Number(req.user);
    const mediaItemId = Number(req.params.mediaItemId);
    if (!userId) { res.status(401).json({ error: 'unauthenticated' }); return; }
    if (!mediaItemId) { res.status(400).json({ error: 'mediaItemId requerido' }); return; }
    const knex = _dbconfig.Database.knex;
    const existing = await knex('activelyInProgress').where({ userId, mediaItemId }).first();
    if (existing) {
      await knex('activelyInProgress').where({ id: existing.id }).update({ excluded: false });
    } else {
      await knex('activelyInProgress').insert({ userId, mediaItemId, excluded: false, createdAt: Date.now() });
    }
    res.json({ ok: true });
  });
  activelyInProgressRemove = (0, _typescriptRoutesToOpenapiServer.createExpressRoute)(async (req, res) => {
    const userId = Number(req.user);
    const mediaItemId = Number(req.params.mediaItemId);
    if (!userId) { res.status(401).json({ error: 'unauthenticated' }); return; }
    if (!mediaItemId) { res.status(400).json({ error: 'mediaItemId requerido' }); return; }
    const knex = _dbconfig.Database.knex;
    const existing = await knex('activelyInProgress').where({ userId, mediaItemId }).first();
    if (existing) {
      await knex('activelyInProgress').where({ id: existing.id }).update({ excluded: true });
    } else {
      await knex('activelyInProgress').insert({ userId, mediaItemId, excluded: true, createdAt: Date.now() });
    }
    res.json({ ok: true });
  });
  activelyInProgressList = (0, _typescriptRoutesToOpenapiServer.createExpressRoute)(async (req, res) => {
    const userId = Number(req.user);
    if (!userId) { res.status(401).json({ error: 'unauthenticated' }); return; }
    const rows = await _dbconfig.Database.knex('activelyInProgress').where({ userId }).select('mediaItemId', 'excluded');
    const included = rows.filter(r => !r.excluded).map(r => r.mediaItemId);
    const excluded = rows.filter(r => r.excluded).map(r => r.mediaItemId);
    res.json({ included, excluded, items: included });
  });
  itemFlagsCombined = (0, _typescriptRoutesToOpenapiServer.createExpressRoute)(async (req, res) => {
    const userId = Number(req.user);
    const mediaItemId = Number(req.params.mediaItemId);
    if (!userId) { res.status(401).json({ error: 'unauthenticated' }); return; }
    if (!mediaItemId) { res.status(400).json({ error: 'mediaItemId requerido' }); return; }
    const knex = _dbconfig.Database.knex;
    const [ab, aip, sw] = await Promise.all([
      knex('abandoned').where({ userId, mediaItemId }).first(),
      knex('activelyInProgress').where({ userId, mediaItemId }).first(),
      knex('seen').where({ userId, mediaItemId, kind: 'watched' }).first()
    ]);
    res.json({
      abandoned: !!ab,
      activelyInProgress: !!aip && !aip.excluded,
      activelyInProgressExcluded: !!aip && !!aip.excluded,
      seenWatched: !!sw
    });
  });
  seenWatchedDelete = (0, _typescriptRoutesToOpenapiServer.createExpressRoute)(async (req, res) => {
    const userId = Number(req.user);
    const mediaItemId = Number(req.params.mediaItemId);
    if (!userId) { res.status(401).json({ error: 'unauthenticated' }); return; }
    if (!mediaItemId) { res.status(400).json({ error: 'mediaItemId requerido' }); return; }
    const n = await _dbconfig.Database.knex('seen').where({ userId, mediaItemId, kind: 'watched' }).delete();
    res.json({ ok: true, removed: n });
  });
  /* mediaocd:filmaffinity */
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
  /* mediaocd:metacritic */
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
  tmdbKeyGet = (0, _typescriptRoutesToOpenapiServer.createExpressRoute)(async (req, res) => {
    if (!(await this.jellyfinIsAdmin(req, res))) return;
    const fs = require('fs');
    const envKey = process.env.TMDB_API_KEY;
    let fileKey = null;
    try { fileKey = (JSON.parse(fs.readFileSync('/storage/tmdb-key.json','utf8')).apiKey || '').trim() || null; } catch(_) {}
    const effective = envKey || fileKey;
    res.json({
      configured: !!effective,
      source: envKey ? 'env' : (fileKey ? 'file' : 'none'),
      masked: effective ? (effective.slice(0, 4) + '…' + effective.slice(-4)) : null,
      hasFileKey: !!fileKey,
    });
  });
  tmdbKeyPut = (0, _typescriptRoutesToOpenapiServer.createExpressRoute)(async (req, res) => {
    if (!(await this.jellyfinIsAdmin(req, res))) return;
    const fs = require('fs');
    const apiKey = (req.body && typeof req.body.apiKey === 'string') ? req.body.apiKey.trim() : '';
    const file = '/storage/tmdb-key.json';
    if (!apiKey) {
      // Empty body means "clear" — remove the file.
      try { fs.unlinkSync(file); } catch(_) {}
      res.json({ ok: true, cleared: true });
      return;
    }
    if (!/^[a-f0-9]{20,}$/i.test(apiKey)) {
      res.status(400).json({ error: 'Formato de TMDB API key inválido (se esperan ≥20 hex chars).' });
      return;
    }
    fs.writeFileSync(file, JSON.stringify({ apiKey }, null, 2));
    try { fs.chmodSync(file, 0o600); } catch(_) {}
    res.json({ ok: true });
  });
  jellyfinImportFromServer = (0, _typescriptRoutesToOpenapiServer.createExpressRoute)(async (req, res) => {
    if (!process.env.JELLYFIN_URL || !process.env.JELLYFIN_API_KEY) { res.json({ ok: false, configured: false }); return; }
    const knex = _dbconfig.Database.knex;
    try {
      const userId = await this.jellyfinUserId();
      const list = await this.jellyfinFetch('/Users/' + userId + '/Items?Recursive=true&IncludeItemTypes=Movie,Series&Fields=ProviderIds&Limit=20000');
      const items = list.Items || [];
      let marked = 0, alreadyMarked = 0, created = 0, skippedNoIds = 0;
      for (const it of items) {
        const p = it.ProviderIds || {};
        const mt = it.Type === 'Movie' ? 'movie' : it.Type === 'Series' ? 'tv' : null;
        if (!mt) continue;
        if (!p.Tmdb && !p.Imdb && !p.Tvdb) { skippedNoIds++; continue; }
        let media = null;
        if (p.Tmdb) media = await knex('mediaItem').where({ mediaType: mt, tmdbId: Number(p.Tmdb) }).first();
        if (!media && p.Imdb) media = await knex('mediaItem').where({ mediaType: mt, imdbId: p.Imdb }).first();
        if (!media && p.Tvdb && mt === 'tv') media = await knex('mediaItem').where({ mediaType: mt, tvdbId: Number(p.Tvdb) }).first();
        if (media) {
          if (media.downloaded) { alreadyMarked++; continue; }
          await knex('mediaItem').where('id', media.id).update('downloaded', true);
          marked++;
        } else {
          try {
            await knex('mediaItem').insert({
              title: it.Name || '(unknown)',
              mediaType: mt,
              tmdbId: p.Tmdb ? Number(p.Tmdb) : null,
              imdbId: p.Imdb || null,
              tvdbId: p.Tvdb && mt === 'tv' ? Number(p.Tvdb) : null,
              source: 'tmdb',
              needsDetails: 1,
              lastTimeUpdated: 0,
              downloaded: 1
            });
            created++;
          } catch (e) { skippedNoIds++; }
        }
      }
      if (global._jfLibCache) global._jfLibCache.clear();
      if (global._jfLookupCache) global._jfLookupCache.clear();
      res.json({ ok: true, jellyfinItems: items.length, newlyMarked: marked, alreadyMarked, created, skippedNoIds });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
}
exports.MediaItemController = MediaItemController;
//# sourceMappingURL=item.js.map