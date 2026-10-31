/*mediaocd:loose-aip-inprogress*/
/*mediaocd:inprogress-non-tv-excludes-seen*/
// mediaocd: only-just-watched
// /* mediaocd: progress-sort-disambig */
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.getItemsKnex = exports.generateColumnNames = exports.QueryBuilderHelper = void 0;
var _mediaItem = require("../../entity/mediaItem");
var _dbconfig = require("../../dbconfig");
var _userRating = require("../../entity/userRating");
var _tvepisode = require("../../entity/tvepisode");
var _list = require("../../entity/list");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
// /* ITEMS_RESPONSE_CACHE_V1 */
const _itemsCache = new Map();
/*mediaocd:items-cache-ttl-5min*/ const _ITEMS_CACHE_TTL = 300000;
const _ITEMS_CACHE_MAX = 256;
let _itemsCacheHookInstalled = false;
function _installItemsCacheInvalidationHook() {
  if (_itemsCacheHookInstalled) return;
  try {
    const _kx = _dbconfig.Database.knex;
    if (!_kx || typeof _kx.on !== 'function') return;
    _kx.on('query-response', function (_resp, q) {
      try {
        const sql = q && q.sql ? String(q.sql) : '';
        if (/^\s*(INSERT|UPDATE|DELETE|REPLACE)\b/i.test(sql)) {
          _itemsCache.clear();
        }
      } catch (_) {}
    });
    _itemsCacheHookInstalled = true;
  } catch (_) {}
}
// Normalise args so the controller (req.query → strings) and the prewarm
// (native types) produce the same cache key. Sort keys, drop empty/null,
// coerce 'true'/'false'/numeric strings to their primitive form.
function _normalizeItemsArgs(args) {
  if (!args || typeof args !== 'object') return {};
  const out = {};
  const keys = Object.keys(args).sort();
  for (const k of keys) {
    let v = args[k];
    if (v === null || v === undefined || v === '') continue;
    if (v === 'true' || v === true) v = true;
    else if (v === 'false' || v === false) v = false;
    else if (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v)) v = Number(v);
    out[k] = v;
  }
  return out;
}

/* mediaocd:ahead-of-air-first-unwatched */
const _fillAheadOfAirEpisode = async (payload, userId) => {
  const list = Array.isArray(payload) ? payload : (payload && payload.data);
  if (!Array.isArray(list) || !userId) return payload;
  const AIRING = ['Returning Series', 'In Production', 'Planned'];
  const targets = list.filter(i => i && i.mediaType === 'tv' && !i.firstUnwatchedEpisode && AIRING.includes(i.status));
  if (!targets.length) return payload;
  const ids = targets.map(i => i.id);
  const now = new Date().toISOString();
  const knex = _dbconfig.Database.knex;
  const rows = await knex.raw(`
    WITH lastSeenEp AS (
      SELECT e.tvShowId, MAX(e.seasonAndEpisodeNumber) AS sae
      FROM seen s JOIN episode e ON e.id = s.episodeId
      WHERE s.userId = ? AND e.isSpecialEpisode = 0 AND e.tvShowId IN (${ids.map(() => '?').join(',')})
      GROUP BY e.tvShowId
    ), cand AS (
      SELECT n.*, ROW_NUMBER() OVER (PARTITION BY n.tvShowId ORDER BY n.seasonAndEpisodeNumber) AS rn
      FROM lastSeenEp l
      JOIN episode le ON le.tvShowId = l.tvShowId AND le.seasonAndEpisodeNumber = l.sae
      JOIN episode n ON n.tvShowId = l.tvShowId AND n.seasonNumber = le.seasonNumber
      WHERE n.seasonAndEpisodeNumber > l.sae AND n.isSpecialEpisode = 0
        /* mediaocd:ahead-only-if-watched-ahead */ AND le.releaseDate IS NOT NULL AND le.releaseDate <> '' AND le.releaseDate > ?
        AND (n.releaseDate IS NULL OR n.releaseDate = '' OR n.releaseDate > ?)
        AND NOT EXISTS (SELECT 1 FROM seen s2 WHERE s2.episodeId = n.id AND s2.userId = ?)
    )
    SELECT * FROM cand WHERE rn = 1`, [userId, ...ids, now, now, userId]);
  const byShow = new Map(rows.map(r => [r.tvShowId, r]));
  for (const i of targets) {
    const r = byShow.get(i.id);
    if (!r) continue;
    i.firstUnwatchedEpisode = {
      id: r.id, title: r.title, description: r.description,
      episodeNumber: r.episodeNumber, seasonNumber: r.seasonNumber,
      releaseDate: r.releaseDate || null, tvShowId: r.tvShowId,
      tmdbId: r.tmdbId, imdbId: r.imdbId, tvdbId: r.tvdbId, traktId: r.traktId,
      runtime: r.runtime, seasonId: r.seasonId,
      isSpecialEpisode: Boolean(r.isSpecialEpisode),
      progress: r.progress == null ? null : Number(r.progress)
    };
    if (!i.activelyInProgressExcluded) i.inProgress = true;
  }
  return payload;
};
const _getItemsKnexUncached = async args => {
  const {
    page
  } = args;
  const {
    sqlQuery,
    sqlCountQuery,
    sqlPaginationQuery
  } = await getItemsKnexSql(args);
  if (page) {
    const [resCount, res] = await _dbconfig.Database.knex.transaction(async trx => {
      const resCount = await sqlCountQuery.transacting(trx);
      const res = await sqlPaginationQuery.transacting(trx);
      return [resCount, res];
    });
    const itemsPerPage = 40;
    const total = Number(resCount[0].count);
    const from = itemsPerPage * (page - 1);
    const to = Math.min(total, itemsPerPage * page);
    const totalPages = Math.ceil(total / itemsPerPage);
    if (from >= total && total > 0) {
      /* PAGINATION_OOR_CLAMP_V1 */
      // Stale page (URL/state preserved across a filter change that
      // shrunk the result set). Re-execute on the last valid page so the
      // UI doesn't crash with a 500 and the paginator stays coherent.
      const clamped = Math.max(1, totalPages);
      const reArgs = Object.assign({}, args, { page: clamped });
      const reSql = await getItemsKnexSql(reArgs);
      const reRes = await reSql.sqlPaginationQuery;
      const reFrom = itemsPerPage * (clamped - 1);
      const reTo = Math.min(total, itemsPerPage * clamped);
      return {
        from: reFrom,
        to: reTo,
        data: reRes.map(mapRawResult),
        total: total,
        page: clamped,
        totalPages: totalPages
      };
    }
    const data = res.map(mapRawResult);
    return {
      from: from,
      to: to,
      data: data,
      total: total,
      page: page,
      totalPages: totalPages
    };
  } else {
    const res = await sqlQuery;
    return res.map(mapRawResult);
  }
};
const getItemsKnex = async args => {
  _installItemsCacheInvalidationHook();
  // Key includes userId so users never see each other's data.
  const key = String((args && args.userId) || 0) + '|' + JSON.stringify(_normalizeItemsArgs(args));
  const hit = _itemsCache.get(key);
  if (hit && (Date.now() - hit.at) < _ITEMS_CACHE_TTL) return hit.payload;
  const payload = await _fillAheadOfAirEpisode(await _getItemsKnexUncached(args), args && args.userId);
  _itemsCache.set(key, { at: Date.now(), payload: payload });
  if (_itemsCache.size > _ITEMS_CACHE_MAX) {
    // Evict ~25% oldest entries.
    const entries = Array.from(_itemsCache.entries());
    entries.sort(function (a, b) { return a[1].at - b[1].at; });
    for (let i = 0; i < Math.floor(_ITEMS_CACHE_MAX / 4); i++) _itemsCache.delete(entries[i][0]);
  }
  return payload;
};
exports.getItemsKnex = getItemsKnex;
/* HOME_PREWARM_V1 */
setTimeout(async function () {
  try {
    const _kx = _dbconfig.Database.knex;
    const users = await _kx('user').select('id');
    let warmed = 0;
    const t0 = Date.now();
    for (const u of users) {
      const userId = u.id;
      const queries = [
        { userId: userId, page: 1, orderBy: 'nextAiring', sortOrder: 'asc', onlyOnWatchlist: true, onlyWithNextAiring: true },
        { userId: userId, page: 1, orderBy: 'lastSeen',   sortOrder: 'desc', mediaType: 'tv', onlyWithNextEpisodesToWatch: true, onlyOnWatchlist: true },
        { userId: userId, page: 1, orderBy: 'lastAiring', sortOrder: 'desc', onlySeenItems: false, excludeAbandoned: true },
        { userId: userId, page: 1, orderBy: 'lastSeen',   sortOrder: 'desc', onlySeenItems: true,  onlyWithoutUserRating: true }
      ];
      for (const args of queries) {
        try { await getItemsKnex(args); warmed++; } catch (_) {}
      }
    }
    const dt = Date.now() - t0;
    if (warmed > 0) console.log('[mediaocd] home cache pre-warmed: ' + warmed + ' queries in ' + dt + 'ms');
  } catch (_) { /* boot still in progress — skip silently */ }
}, 12000);

const getItemsKnexSql = async args => {
  const {
    onlyOnWatchlist,
    mediaType,
    userId,
    filter,
    orderBy,
    page,
    onlySeenItems,
    sortOrder,
    onlyWithNextEpisodesToWatch,
    onlyWithNextAiring,
    mediaItemIds,
    onlyWithUserRating,
    onlyWithoutUserRating,
    onlyWithProgress,
    onlyPlayed,
    onlyWatched,
    onlyDownloaded,
    excludeAbandoned,
    onlyAbandoned,
    onlyJustWatched
  } = args;
  const currentDateString = new Date().toISOString();
  const watchlist = await _dbconfig.Database.knex('list').select('id').where('userId', userId).where('isWatchlist', true).first();
  if (watchlist === undefined) {
    throw new Error(`user ${userId} has no watchlist`);
  }
  const watchlistId = watchlist.id;
  const query = _dbconfig.Database.knex.select(generateColumnNames('firstUnwatchedEpisode', _tvepisode.tvEpisodeColumns)).select(generateColumnNames('listItem', _list.listItemColumns)).select(generateColumnNames('upcomingEpisode', _tvepisode.tvEpisodeColumns)).select(generateColumnNames('lastAiredEpisode', _tvepisode.tvEpisodeColumns)).select(generateColumnNames('userRating', _userRating.userRatingColumns)).select(generateColumnNames('mediaItem', _mediaItem.mediaItemColumns)).select({
    lastSeenAt: 'lastSeen.date',
    'lastSeen.mediaItemId': 'lastSeen.mediaItemId',
    'seenWatched.mediaItemId': 'seenWatched.mediaItemId',
    numberOfEpisodes: 'numberOfEpisodes',
    unseenEpisodesCount: 'unseenEpisodesCount',
    seenEpisodesCount: 'seenEpisodesCount',
    progress: 'progress.progress'
  }).from(_dbconfig.Database.knex.raw('`mediaItem` INDEXED BY mediaitem_mediatype_index')).leftJoin(qb => qb.select('mediaItemId').max('date', {
    as: 'date'
  }).from('seen').where('userId', userId).groupBy('mediaItemId').as('lastSeen'), 'lastSeen.mediaItemId', 'mediaItem.id')
    // mediaocd: seenWatched-flag
    .leftJoin(qb => qb.select('mediaItemId').from('seen').where('userId', userId).where('kind', 'watched').groupBy('mediaItemId').as('seenWatched'), 'seenWatched.mediaItemId', 'mediaItem.id') // lastseen-deduped (was redundant lastSeen2 join)
  // Number of episodes
  .leftJoin(qb => qb.select('tvShowId').count('*', {
    as: 'numberOfEpisodes'
  }).from('episode').modify(function(qq){if(typeof mediaType!=='undefined'&&mediaType&&mediaType!=='tv')qq.whereRaw('1=0')}).whereNot('isSpecialEpisode', true).andWhereNot('releaseDate', '').andWhereNot('releaseDate', null).andWhere('releaseDate', '<=', currentDateString).groupBy('tvShowId').as('numberOfEpisodes'), 'numberOfEpisodes.tvShowId', 'mediaItem.id')
  // On watchlist
  .leftJoin('listItem', qb => {
    qb.on('listItem.mediaItemId', 'mediaItem.id').andOnNull('listItem.seasonId').andOnNull('listItem.episodeId').andOnVal('listItem.listId', watchlistId);
  })
  // Upcoming episode
  .leftJoin(qb => qb.from('episode').modify(function(qq){if(typeof mediaType!=='undefined'&&mediaType&&mediaType!=='tv')qq.whereRaw('1=0')}).select('tvShowId').min('seasonAndEpisodeNumber', {
    as: 'upcomingEpisodeSeasonAndEpisodeNumber'
  }).where('isSpecialEpisode', false).where('releaseDate', '>=', currentDateString).groupBy('tvShowId').as('upcomingEpisodeHelper'), 'upcomingEpisodeHelper.tvShowId', 'mediaItem.id').leftJoin(_dbconfig.Database.knex.ref('episode').as('upcomingEpisode'), qb => qb.on('upcomingEpisode.tvShowId', 'mediaItem.id').andOn('upcomingEpisode.seasonAndEpisodeNumber', 'upcomingEpisodeSeasonAndEpisodeNumber'))
  // Last aired episode
  .leftJoin(qb => qb.from('episode').modify(function(qq){if(typeof mediaType!=='undefined'&&mediaType&&mediaType!=='tv')qq.whereRaw('1=0')}).select('tvShowId').max('seasonAndEpisodeNumber', {
    as: 'lastAiredEpisodeSeasonAndEpisodeNumber'
  }).where('isSpecialEpisode', false).where('releaseDate', '<', currentDateString).groupBy('tvShowId').as('lastAiredEpisodeHelper'), 'lastAiredEpisodeHelper.tvShowId', 'mediaItem.id').leftJoin(_dbconfig.Database.knex.ref('episode').as('lastAiredEpisode'), qb => qb.on('lastAiredEpisode.tvShowId', 'mediaItem.id').andOn('lastAiredEpisode.seasonAndEpisodeNumber', 'lastAiredEpisodeSeasonAndEpisodeNumber'))
  // Seen episodes count
  .leftJoin(qb => qb.select('mediaItemId').count('*', {
    as: 'seenEpisodesCount'
  }).from(qb => qb.select('mediaItemId').from('seen').modify(function(qq){if(typeof mediaType!=='undefined'&&mediaType&&mediaType!=='tv')qq.whereRaw('1=0')}).where('userId', userId).whereNotNull('episodeId').groupBy('mediaItemId', 'episodeId').leftJoin('episode', 'episode.id', 'seen.episodeId').whereNot('episode.isSpecialEpisode', true).as('seen') /* seenEpisodes-short-circuited */).groupBy('mediaItemId').as('seenEpisodes'), 'seenEpisodes.mediaItemId', 'mediaItem.id')
  // First unwatched episode and unseen episodes count
  .leftJoin(qb => qb.from('episode').modify(function(qq){if(typeof mediaType!=='undefined'&&mediaType&&mediaType!=='tv')qq.whereRaw('1=0')}).select('tvShowId').min('seasonAndEpisodeNumber', {
    as: 'seasonAndEpisodeNumber'
  }).count('*', {
    as: 'unseenEpisodesCount'
  }).leftJoin(qb => qb.from('seen').where('userId', userId).as('seen'), 'seen.episodeId', 'episode.id').whereNot('episode.isSpecialEpisode', true).whereNot('episode.releaseDate', '').whereNot('episode.releaseDate', null).where('episode.releaseDate', '<=', currentDateString).whereNull('seen.userId').groupBy('tvShowId').as('firstUnwatchedEpisodeHelper'), 'firstUnwatchedEpisodeHelper.tvShowId', 'mediaItem.id').leftJoin(_dbconfig.Database.knex.ref('episode').as('firstUnwatchedEpisode'), qb => qb.on('firstUnwatchedEpisode.tvShowId', 'mediaItem.id').andOn('firstUnwatchedEpisode.seasonAndEpisodeNumber', 'firstUnwatchedEpisodeHelper.seasonAndEpisodeNumber'))
  // User rating
  .leftJoin(qb => qb.from('userRating').whereNotNull('userRating.rating').orWhereNotNull('userRating.review').as('userRating'), qb => qb.on('userRating.mediaItemId', 'mediaItem.id').andOnVal('userRating.userId', userId).andOnNull('userRating.episodeId').andOnNull('userRating.seasonId'))
  // Progress
  .leftJoin(qb => qb.from('progress').where('userId', userId).whereNull('episodeId').whereNot('progress', 1).as('progress'), 'progress.mediaItemId', 'mediaItem.id');
  // mediaocd: actively-in-progress-join
  query.leftJoin(qb => qb.from('activelyInProgress').where('userId', userId).as('activelyInProgress'), 'activelyInProgress.mediaItemId', 'mediaItem.id');
  query.select(_dbconfig.Database.knex.raw("CASE WHEN \"activelyInProgress\".\"id\" IS NOT NULL AND COALESCE(\"activelyInProgress\".\"excluded\", 0) = 0 THEN 1 ELSE 0 END AS \"activelyInProgressFlag\""));
  query.select(_dbconfig.Database.knex.raw("CASE WHEN COALESCE(\"activelyInProgress\".\"excluded\", 0) = 1 THEN 1 ELSE 0 END AS \"activelyInProgressExcludedFlag\""));
  if (Array.isArray(mediaItemIds)) {
    query.whereIn('mediaItem.id', mediaItemIds);
  } else {
    /*mediaocd:base-filter-includes-abandoned*/
    query.where(qb => qb.whereNotNull('listItem.mediaItemId').orWhereNotNull('lastSeen.mediaItemId').orWhereExists(function() { this.from('abandoned').where('abandoned.userId', userId).whereRaw('abandoned.mediaItemId = mediaItem.id'); }).orWhereExists(function() { this.from('progress as progressBase').where('progressBase.userId', userId).whereRaw('progressBase.mediaItemId = mediaItem.id'); }).orWhereExists(function() { this.from('activelyInProgress as aipBase').where('aipBase.userId', userId).whereRaw('aipBase.mediaItemId = mediaItem.id'); }));/*mediaocd:base-filter-includes-progress-aip*/
    if (onlyOnWatchlist) {
      query.whereNotNull('listItem.mediaItemId');
    }
    if (onlySeenItems === true || onlySeenItems === 'true' || onlySeenItems === 1) { // only-seen-truthy
      query.whereNotNull('lastSeen.mediaItemId');
    }
    if (onlySeenItems === false) {
      query.andWhereNot(qb => qb.where('mediaItem.mediaType', 'tv').andWhere('firstUnwatchedEpisode.tvShowId', null)).andWhere(qb => qb.where('mediaItem.mediaType', 'tv').orWhere('mediaItem.releaseDate', '<=', currentDateString));
    }

    // Media type
    if (mediaType) {
      if (mediaType === 'book') { query.whereIn('mediaItem.mediaType', ['book','audiobook']); }
      else { query.andWhere('mediaItem.mediaType', mediaType); }
    }

    // Filter
    if (filter && filter.trim().length > 0) {
      query.andWhere('mediaItem.title', 'LIKE', `%${filter}%`);
    }

    // Next airing
    if (onlyWithNextAiring) {
      if (mediaType) {
        if (mediaType === 'tv') {
          query.andWhere('upcomingEpisode.releaseDate', '>', currentDateString);
        } else {
          query.andWhere('mediaItem.releaseDate', '>', currentDateString);
        }
      } else {
        query.andWhere(qb => qb.where(qb => qb.whereNot('mediaItem.mediaType', 'tv').andWhere('mediaItem.releaseDate', '>', currentDateString)).orWhere(qb => qb.where('mediaItem.mediaType', 'tv').andWhere('upcomingEpisode.releaseDate', '>', currentDateString)));
      }
      query.whereNotNull('listItem.mediaItemId');
    }

    // nextEpisodesToWatchSubQuery
    if (onlyWithNextEpisodesToWatch === true) {
      query.where('seenEpisodesCount', '>', 0).andWhere('unseenEpisodesCount', '>', 0);
    }
    if (onlyWithUserRating === true) {
      query.whereNotNull('userRating.rating');
    }
    if (onlyWithoutUserRating === true) {
      query.whereNull('userRating.rating');
    }
    if (onlyWithProgress) {
      query.where(qb => qb.where(sub => sub.whereNotExists(function() { this.from('activelyInProgress').whereRaw('activelyInProgress.mediaItemId = mediaItem.id').where('activelyInProgress.userId', userId).where('activelyInProgress.excluded', true); }).andWhere(inner => inner.where(qb => qb.whereNot('mediaItem.mediaType', 'tv').whereNotNull('progress.mediaItemId').where('progress.progress', '>', 0).where('progress.progress', '<', 1).whereNotExists(function() { this.from('seen').whereRaw('seen.mediaItemId = mediaItem.id').where('seen.userId', userId); })).orWhere(qb => qb.where('mediaItem.mediaType', 'tv').where('seenEpisodesCount', '>', 0).andWhere('unseenEpisodesCount', '>', 0)).orWhere(qb => qb.where('mediaItem.mediaType', 'tv').andWhere('firstUnwatchedEpisode.progress', '>', 0)).orWhere(qb => qb./* WATCHLIST_NONTV_DROPPED_V1 */whereNotNull('listItem.mediaItemId').where('mediaItem.mediaType', 'tv').whereNotNull('firstUnwatchedEpisode.tvShowId')).orWhere(qb => qb/*mediaocd:airing-tv-stays-in-progress*/.where('mediaItem.mediaType', 'tv').whereIn('mediaItem.status', ['Returning Series', 'In Production', 'Planned']).whereNotNull('listItem.mediaItemId').where('seenEpisodesCount', '>', 0).whereNotNull('upcomingEpisode.releaseDate').whereRaw('"upcomingEpisode"."seasonNumber" = "lastAiredEpisode"."seasonNumber"')).orWhere(qb => qb/*mediaocd:seen-ahead-of-air-stays-in-progress*/.where('mediaItem.mediaType', 'tv').whereIn('mediaItem.status', ['Returning Series', 'In Production', 'Planned']).whereExists(function() { this.from('episode as aheadEp').whereRaw('"aheadEp"."tvShowId" = "mediaItem"."id"').where('aheadEp.isSpecialEpisode', false).where(d => d.whereNull('aheadEp.releaseDate').orWhere('aheadEp.releaseDate', '').orWhere('aheadEp.releaseDate', '>', currentDateString)).whereNotExists(function() { this.from('seen').whereRaw('"seen"."episodeId" = "aheadEp"."id"').where('seen.userId', userId); }).whereRaw('"aheadEp"."seasonNumber" = (SELECT MAX("se"."seasonNumber") FROM "seen" "sn" JOIN "episode" "se" ON "se"."id" = "sn"."episodeId" WHERE "sn"."mediaItemId" = "mediaItem"."id" AND "sn"."userId" = ? AND "se"."isSpecialEpisode" = 0)', [userId]); })).orWhere(qb => qb.whereNot('mediaItem.mediaType', 'tv').where('mediaItem.audioProgress', '>', 0).where('mediaItem.audioProgress', '<', 1).whereNotExists(function() { this.from('seen').whereRaw('seen.mediaItemId = mediaItem.id').where('seen.userId', userId); })))).orWhere(qb => qb.whereExists(function() { this.from('activelyInProgress').whereRaw('activelyInProgress.mediaItemId = mediaItem.id').where('activelyInProgress.userId', userId).where('activelyInProgress.excluded', false); })));
    }
      if (onlyDownloaded) {
        query.where('mediaItem.downloaded', true);
      }
      // mediaocd: abandoned-filter
      if (excludeAbandoned === true || excludeAbandoned === 'true' || excludeAbandoned === 1) {
        query.whereNotExists(function() { this.from('abandoned').where('abandoned.userId', userId).whereRaw('abandoned.mediaItemId = mediaItem.id'); });
      }
      if (onlyAbandoned === true || onlyAbandoned === 'true' || onlyAbandoned === 1) {
        query.whereExists(function() { this.from('abandoned').where('abandoned.userId', userId).whereRaw('abandoned.mediaItemId = mediaItem.id'); });
      }
      // mediaocd: pass-through onlyWatched / onlyPlayed (upstream had them in count only)
      if (onlyWatched === true || onlyWatched === 'true' || onlyWatched === 1) {
        query.whereExists(function() { this.from('seen').whereRaw('seen.mediaItemId = mediaItem.id').where('seen.userId', userId).where('seen.kind', 'watched'); });
      }
      if (onlyPlayed === true || onlyPlayed === 'true' || onlyPlayed === 1) {
        query.whereExists(function() { this.from('seen').whereRaw('seen.mediaItemId = mediaItem.id').where('seen.userId', userId).where('seen.kind', 'played'); });
      }
      // mediaocd: only-just-watched — kind='watched' AND no kind='played'
      if (onlyJustWatched === true || onlyJustWatched === 'true' || onlyJustWatched === 1) {
        query.whereExists(function() { this.from('seen').whereRaw('seen.mediaItemId = mediaItem.id').where('seen.userId', userId).where('seen.kind', 'watched'); });
        query.whereNotExists(function() { this.from('seen').whereRaw('seen.mediaItemId = mediaItem.id').where('seen.userId', userId).where('seen.kind', 'played'); });
      }
  }
  if (orderBy && sortOrder) {
    if (sortOrder.toLowerCase() !== 'asc' && sortOrder.toLowerCase() !== 'desc') {
      throw new Error('Sort order should by either asc or desc');
    }
    switch (orderBy) {
      /*mediaocd:listedAt-order*/
      case 'listedAt':
        query.orderByRaw('"listItem"."addedAt" ' + sortOrder + ' NULLS LAST');
        query.orderBy('mediaItem.title', 'asc');
        break;

      case 'title':
        query.orderBy('mediaItem.title', sortOrder);
        break;
      case 'releaseDate':
        query.orderBy('mediaItem.releaseDate', sortOrder);
        query.orderBy('mediaItem.title', 'asc');
        break;
      case 'status':
        query.orderBy('mediaItem.status', sortOrder);
        query.orderBy('mediaItem.title', 'asc');
        break;
      case 'mediaType':
        query.orderBy('mediaItem.mediaType', sortOrder);
        query.orderBy('mediaItem.title', 'asc');
        break;
      case 'unseenEpisodes':
        query.orderBy('unseenEpisodesCount', sortOrder);
        query.orderBy('mediaItem.title', 'asc');
        break;
      case 'lastSeen':
        query.orderBy('lastSeenAt', sortOrder);
        query.orderBy('mediaItem.title', 'asc');
        break;
      case 'nextAiring':
        query.orderByRaw(`CASE
                            WHEN "mediaItem"."mediaType" = 'tv' THEN "upcomingEpisode"."releaseDate"
                            ELSE "mediaItem"."releaseDate"
                          END ${sortOrder} NULLS LAST`);
        query.orderBy('mediaItem.title', 'asc');
        break;
      case 'lastAiring':
        query.orderByRaw(`CASE
                            WHEN "mediaItem"."mediaType" = 'tv' THEN "lastAiredEpisode"."releaseDate"
                            ELSE CASE
                              WHEN "mediaItem"."releaseDate" >= '${currentDateString}' THEN NULL
                              ELSE "mediaItem"."releaseDate"
                            END
                          END ${sortOrder} NULLS LAST`);
        query.orderBy('mediaItem.title', 'asc');
        break;
      case 'progress':
        query.orderByRaw(`CASE
                            WHEN "mediaItem"."mediaType" = 'tv' THEN "unseenEpisodesCount"
                            ELSE "progress"."progress"
                          END ${sortOrder}`);
        query.orderBy('mediaItem.title', 'asc');
        break;
      default:
        throw new Error(`Unsupported orderBy value: ${orderBy}`);
    }
  }
  const _knex = _dbconfig.Database.knex;
  const _applyMt = qb => { if (mediaType) qb.where('mediaType', mediaType); if (mediaItemIds) qb.whereIn('id', mediaItemIds); };
  let sqlCountQuery;
  /* mediaocd: count-query-abandoned */
  const _isAbnd = v => v === true || v === 'true' || v === 1;
  const _hasAbandonedFlag = _isAbnd(excludeAbandoned) || _isAbnd(onlyAbandoned);
  if (_hasAbandonedFlag) {
    // No fast-path covers these — derive count from the filtered main query.
    sqlCountQuery = query.clone().clearOrder().clearSelect().countDistinct('mediaItem.id', { as: 'count' });
  } else if (filter) {
    sqlCountQuery = query.clone().clearOrder().clearSelect().count('*', { as: 'count' });
  } else if (onlyOnWatchlist) {
    sqlCountQuery = _knex('mediaItem').modify(_applyMt).whereIn('id',
      _knex('listItem').select('mediaItemId')
        .join('list', 'list.id', 'listItem.listId')
        .where('list.userId', userId).where('list.isWatchlist', true)
    ).count('* as count');
  } else if (onlyDownloaded) {
    sqlCountQuery = _knex('mediaItem').modify(_applyMt).where('downloaded', true).count('* as count');
  } else if (onlyWithProgress) {
    // For TV: must have at least one seen episode AND at least one aired non-special
    // episode still unwatched. The orig fast-path was missing the "still unwatched"
    // condition, counting completed series as "in progress" (303 vs real 61).
    // For non-TV: also covers audiobooks/listening progress on books (audioProgress
    // strictly between 0 and 1, including a re-listen after the book was finished).
    sqlCountQuery = _knex('mediaItem').modify(_applyMt).where(qb => qb
      .whereExists(qbb => qbb.from('progress').whereRaw('progress.mediaItemId = mediaItem.id').where('progress.userId', userId).where('progress.progress', '>', 0).where('progress.progress', '<', 1))
      .orWhere(qb2 => qb2.where('mediaItem.mediaType', 'tv')
        .whereExists(qbb => qbb.from('seen').whereRaw('seen.mediaItemId = mediaItem.id').where('seen.userId', userId))
        .whereExists(qbe => qbe.from('episode').whereRaw('episode.tvShowId = mediaItem.id')
          .where('episode.isSpecialEpisode', false)
          .whereNotNull('episode.releaseDate')
          .where('episode.releaseDate', '<=', currentDateString)
          .whereNotExists(qbs => qbs.from('seen').whereRaw('seen.episodeId = episode.id').where('seen.userId', userId))
        ))
      .orWhere(qb3 => qb3.whereNot('mediaItem.mediaType', 'tv').where('mediaItem.audioProgress', '>', 0).where('mediaItem.audioProgress', '<', 1))
    ).count('* as count');
  } else if (onlyWithNextAiring) {
    sqlCountQuery = _knex('mediaItem').modify(_applyMt).where(qb => qb
      .where(qb1 => qb1.whereNot('mediaType', 'tv').where('releaseDate', '>', currentDateString))
      .orWhere(qb2 => qb2.where('mediaType', 'tv').whereExists(qbb => qbb.from('episode').whereRaw('episode.tvShowId = mediaItem.id').where('episode.isSpecialEpisode', false).where('episode.releaseDate', '>', currentDateString)))
    ).count('* as count');
  } else if (onlyWithNextEpisodesToWatch) {
    sqlCountQuery = _knex('mediaItem').where('mediaType', 'tv')
      .whereExists(qb => qb.from('episode').whereRaw('episode.tvShowId = mediaItem.id')
        .where('episode.isSpecialEpisode', false)
        .where('episode.releaseDate', '<=', currentDateString)
        .whereNotExists(qbb => qbb.from('seen').whereRaw('seen.episodeId = episode.id').where('seen.userId', userId))
      ).count('* as count');
  } else if (onlySeenItems) {
    sqlCountQuery = _knex('mediaItem').modify(_applyMt)
      .whereExists(qb => qb.from('seen').whereRaw('seen.mediaItemId = mediaItem.id').where('seen.userId', userId))
      .count('* as count');
  } else if (onlyWithUserRating) {
    sqlCountQuery = _knex('mediaItem').modify(_applyMt)
      .whereExists(qb => qb.from('userRating').whereRaw('userRating.mediaItemId = mediaItem.id').where('userRating.userId', userId).whereNotNull('userRating.rating'))
      .count('* as count');
  } else if (onlyWithoutUserRating) {
    sqlCountQuery = _knex('mediaItem').modify(_applyMt)
      .whereNotExists(qb => qb.from('userRating').whereRaw('userRating.mediaItemId = mediaItem.id').where('userRating.userId', userId).whereNotNull('userRating.rating'))
      .count('* as count');
  } else if (onlyPlayed) {
    sqlCountQuery = _knex('mediaItem').modify(_applyMt)
      .whereExists(qb => qb.from('seen').whereRaw('seen.mediaItemId = mediaItem.id').where('seen.userId', userId).where('seen.kind', 'played'))
      .count('* as count');
  } else if (onlyWatched) {
    sqlCountQuery = _knex('mediaItem').modify(_applyMt)
      .whereExists(qb => qb.from('seen').whereRaw('seen.mediaItemId = mediaItem.id').where('seen.userId', userId).where('seen.kind', 'watched'))
      .count('* as count');
  } else if (onlyJustWatched) {
    sqlCountQuery = _knex('mediaItem').modify(_applyMt)
      .whereExists(qb => qb.from('seen').whereRaw('seen.mediaItemId = mediaItem.id').where('seen.userId', userId).where('seen.kind', 'watched'))
      .whereNotExists(qb => qb.from('seen').whereRaw('seen.mediaItemId = mediaItem.id').where('seen.userId', userId).where('seen.kind', 'played'))
      .count('* as count');
  } else {
    // mediaocd: count-in-library
    sqlCountQuery = _knex('mediaItem').modify(_applyMt).where(qb => qb
      .whereExists(function(){ this.from('listItem').join('list','list.id','listItem.listId').whereRaw('listItem.mediaItemId = mediaItem.id').where('list.userId', userId); })
      .orWhereExists(function(){ this.from('seen').whereRaw('seen.mediaItemId = mediaItem.id').where('seen.userId', userId); })
    ).count('* as count');
  } // count-fast-path
  let sqlPaginationQuery;
  if (page) {
    const itemsPerPage = 40;
    const skip = itemsPerPage * (page - 1);
    const take = itemsPerPage;
    sqlPaginationQuery = query.clone().limit(take).offset(skip);
  }
  return {
    sqlQuery: query,
    sqlCountQuery: sqlCountQuery,
    sqlPaginationQuery: sqlPaginationQuery
  };
};
const generateColumnNames = (prefix, properties) => {
  return properties.reduce((previous, property) => ({
    ...previous,
    [`${prefix}.${property}`]: `${prefix}.${property}`
  }), {});
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
exports.generateColumnNames = generateColumnNames;
const mapRawResult = row => {
  var _row$mediaItemGenres, _row$mediaItemAuthor, _row$mediaItemNarrat;
  return {
    id: row['mediaItem.id'],
    tmdbId: row['mediaItem.tmdbId'],
    tvmazeId: row['mediaItem.tvmazeId'],
    igdbId: row['mediaItem.igdbId'],
    openlibraryId: row['mediaItem.openlibraryId'],
    tvdbId: row['mediaItem.tvdbId'],
    traktId: row['mediaItem.traktId'],
    imdbId: row['mediaItem.imdbId'],
    audibleId: row['mediaItem.audibleId'],
    mediaType: row['mediaItem.mediaType'],
    numberOfSeasons: row['mediaItem.numberOfSeasons'],
    status: row['mediaItem.status'],
    platform: row['mediaItem.platform'] ? JSON.parse(row['mediaItem.platform']) : null,
    title: row['mediaItem.title'],
    originalTitle: row['mediaItem.originalTitle'],
    tmdbRating: row['mediaItem.tmdbRating'],
    runtime: row['mediaItem.runtime'],
    releaseDate: row['mediaItem.releaseDate'],
    overview: row['mediaItem.overview'],
    lastTimeUpdated: row['mediaItem.lastTimeUpdated'],
    source: row['mediaItem.source'],
    network: row['mediaItem.network'],
    language: row['mediaItem.language'],
    genres: (_row$mediaItemGenres = row['mediaItem.genres']) === null || _row$mediaItemGenres === void 0 ? void 0 : _row$mediaItemGenres.split(','),
    authors: (_row$mediaItemAuthor = row['mediaItem.authors']) === null || _row$mediaItemAuthor === void 0 ? void 0 : _row$mediaItemAuthor.split(','),
    narrators: (_row$mediaItemNarrat = row['mediaItem.narrators']) === null || _row$mediaItemNarrat === void 0 ? void 0 : _row$mediaItemNarrat.split(','),
    url: row['mediaItem.url'],
    developer: row['mediaItem.developer'],
    lastSeenAt: row['lastSeenAt'],
    progress: row['progress'],
    poster: row['mediaItem.posterId'] ? `/img/${row['mediaItem.posterId']}` : null,
    posterSmall: row['mediaItem.posterId'] ? `/img/${row['mediaItem.posterId']}?size=small` : null,
    backdrop: row['mediaItem.backdropId'] ? `/img/${row['mediaItem.backdropId']}` : null,
    hasDetails: false,
    seen: /*mediaocd:tv-seen-requires-ended-items*/ row['mediaItem.mediaType'] === 'tv' ? (row.numberOfEpisodes > 0 && !row.unseenEpisodesCount && ["Returning Series","In Production","Planned"].indexOf(row['mediaItem.status']) < 0) : Boolean(row['lastSeen.mediaItemId']),
    seenWatched: Boolean(row['seenWatched.mediaItemId']),
    downloaded: Boolean(row['mediaItem.downloaded']),
    audioProgress: row['mediaItem.audioProgress'],
    numberOfPages: row['mediaItem.numberOfPages'],
    numberOfChapters: row['mediaItem.numberOfChapters'],
    links: row['mediaItem.links'],
    onWatchlist: Boolean(row['listItem.id']),
    activelyInProgress: Boolean(row.activelyInProgressFlag),
    activelyInProgressExcluded: Boolean(row.activelyInProgressExcludedFlag),
    inProgress: (function(){var _ex=Boolean(row.activelyInProgressExcludedFlag);if(_ex)return false;var _ac=Boolean(row.activelyInProgressFlag);if(row['mediaItem.mediaType']==='tv'){var _unseen=Number(row.unseenEpisodesCount)||0;var _aired=Number(row.numberOfEpisodes)||0;var _seen=Math.max(0,_aired-_unseen);var _fueId=row['firstUnwatchedEpisode.id'];var _fueProg=Number(row['firstUnwatchedEpisode.progress'])||0;var _onWl=Boolean(row['listItem.id']);return (_seen>0&&_unseen>0)||(_fueId&&_fueProg>0)||(_onWl&&_fueId)||_ac;}else{var _has=Boolean(row['lastSeen.mediaItemId']);var _prog=Number(row['progress'])||0;var _aprog=Number(row['mediaItem.audioProgress'])||0;return (_prog>0&&_prog<1&&!_has)||(_aprog>0&&_aprog<1&&!_has)||_ac;}})(),
    unseenEpisodesCount: row.unseenEpisodesCount || 0,
    seenEpisodesCount: row['seenEpisodesCount'],
    numberOfEpisodes: row.numberOfEpisodes,
    nextAiring: row['mediaItem.mediaType'] === 'tv' ? row['upcomingEpisode.releaseDate'] : row['mediaItem.releaseDate'],
    lastAiring: row['mediaItem.mediaType'] === 'tv' ? row['lastAiredEpisode.releaseDate'] : row['mediaItem.releaseDate'],
    userRating: row['userRating.id'] ? {
      id: row['userRating.id'],
      date: row['userRating.date'],
      mediaItemId: row['userRating.mediaItemId'],
      rating: row['userRating.rating'],
      review: row['userRating.review'],
      userId: row['userRating.userId'],
      episodeId: row['userRating.episodeId'],
      seasonId: row['userRating.seasonId']
    } : undefined,
    firstUnwatchedEpisode: row['firstUnwatchedEpisode.id'] ? {
      id: row['firstUnwatchedEpisode.id'],
      title: row['firstUnwatchedEpisode.title'],
      description: row['firstUnwatchedEpisode.description'],
      episodeNumber: row['firstUnwatchedEpisode.episodeNumber'],
      seasonNumber: row['firstUnwatchedEpisode.seasonNumber'],
      releaseDate: row['firstUnwatchedEpisode.releaseDate'],
      tvShowId: row['firstUnwatchedEpisode.tvShowId'],
      tmdbId: row['firstUnwatchedEpisode.tmdbId'],
      imdbId: row['firstUnwatchedEpisode.imdbId'],
      tvdbId: row['firstUnwatchedEpisode.tvdbId'],
      traktId: row['firstUnwatchedEpisode.traktId'],
      runtime: row['firstUnwatchedEpisode.runtime'],
      seasonId: row['firstUnwatchedEpisode.seasonId'],
      isSpecialEpisode: Boolean(row['firstUnwatchedEpisode.isSpecialEpisode']),
      progress: row['firstUnwatchedEpisode.progress'],
      userRating: undefined,
      seenHistory: undefined,
      lastSeenAt: undefined
    } : undefined,
    upcomingEpisode: row['upcomingEpisode.releaseDate'] ? {
      id: row['upcomingEpisode.id'],
      title: row['upcomingEpisode.title'],
      description: row['upcomingEpisode.description'],
      episodeNumber: row['upcomingEpisode.episodeNumber'],
      seasonNumber: row['upcomingEpisode.seasonNumber'],
      releaseDate: row['upcomingEpisode.releaseDate'],
      runtime: row['upcomingEpisode.runtime'],
      tvShowId: row['upcomingEpisode.tvShowId'],
      tmdbId: row['upcomingEpisode.tmdbId'],
      imdbId: row['upcomingEpisode.imdbId'],
      tvdbId: row['upcomingEpisode.tvdbId'],
      traktId: row['upcomingEpisode.traktId'],
      seasonId: row['upcomingEpisode.seasonId'],
      isSpecialEpisode: Boolean(row['upcomingEpisode.isSpecialEpisode']),
      userRating: undefined,
      seenHistory: undefined,
      lastSeenAt: undefined,
      seen: false
    } : undefined,
    lastAiredEpisode: row['lastAiredEpisode.id'] ? {
      id: row['lastAiredEpisode.id'],
      title: row['lastAiredEpisode.title'],
      description: row['lastAiredEpisode.description'],
      episodeNumber: row['lastAiredEpisode.episodeNumber'],
      seasonNumber: row['lastAiredEpisode.seasonNumber'],
      releaseDate: row['lastAiredEpisode.releaseDate'],
      runtime: row['lastAiredEpisode.runtime'],
      tvShowId: row['lastAiredEpisode.tvShowId'],
      tmdbId: row['lastAiredEpisode.tmdbId'],
      imdbId: row['lastAiredEpisode.imdbId'],
      tvdbId: row['lastAiredEpisode.tvdbId'],
      traktId: row['lastAiredEpisode.traktId'],
      seasonId: row['lastAiredEpisode.seasonId'],
      isSpecialEpisode: Boolean(row['lastAiredEpisode.isSpecialEpisode']),
      userRating: undefined,
      seenHistory: undefined,
      lastSeenAt: undefined,
      seen: false
    } : undefined
  };
};
class QueryBuilderHelper {
  static mapFirstUnwatchedEpisode(row) {
    return {
      description: row['mediaItem.firstUnwatchedEpisode.description'],
      episodeNumber: row['mediaItem.firstUnwatchedEpisode.episodeNumber'],
      id: row['mediaItem.firstUnwatchedEpisode.id'],
      imdbId: row['mediaItem.firstUnwatchedEpisode.imdbId'],
      isSpecialEpisode: Boolean(row['mediaItem.firstUnwatchedEpisode.isSpecialEpisode']),
      releaseDate: row['mediaItem.firstUnwatchedEpisode.releaseDate'],
      runtime: row['mediaItem.firstUnwatchedEpisode.runtime'],
      seasonId: row['mediaItem.firstUnwatchedEpisode.seasonId'],
      seasonNumber: row['mediaItem.firstUnwatchedEpisode.seasonNumber'],
      title: row['mediaItem.firstUnwatchedEpisode.title'],
      tmdbId: row['mediaItem.firstUnwatchedEpisode.tmdbId'],
      traktId: row['mediaItem.firstUnwatchedEpisode.traktId'],
      tvdbId: row['mediaItem.firstUnwatchedEpisode.tvdbId'],
      tvShowId: row['mediaItem.firstUnwatchedEpisode.tvShowId']
    };
  }
  static firstUnwatchedEpisode(query, userId, mediaItemId) {
    return query.select({
      'firstUnwatchedEpisode.episodeNumber': 'firstUnwatchedEpisode.episodeNumber',
      'firstUnwatchedEpisode.seasonNumber': 'firstUnwatchedEpisode.seasonNumber',
      'firstUnwatchedEpisode.title': 'firstUnwatchedEpisode.title',
      'firstUnwatchedEpisode.releaseDate': 'firstUnwatchedEpisode.releaseDate',
      'firstUnwatchedEpisode.description': 'firstUnwatchedEpisode.description',
      'firstUnwatchedEpisode.id': 'firstUnwatchedEpisode.id',
      'firstUnwatchedEpisode.imdbId': 'firstUnwatchedEpisode.imdbId',
      'firstUnwatchedEpisode.runtime': 'firstUnwatchedEpisode.runtime',
      'firstUnwatchedEpisode.seasonId': 'firstUnwatchedEpisode.seasonId',
      'firstUnwatchedEpisode.tmdbId': 'firstUnwatchedEpisode.tmdbId',
      'firstUnwatchedEpisode.tvShowId': 'firstUnwatchedEpisode.tvShowId',
      'firstUnwatchedEpisode.isSpecialEpisode': 'firstUnwatchedEpisode.isSpecialEpisode',
      'firstUnwatchedEpisode.traktId': 'firstUnwatchedEpisode.traktId',
      'firstUnwatchedEpisode.tvdbId': 'firstUnwatchedEpisode.tvdbId'
    }).leftJoin(qb => qb.from('episode').select('tvShowId').min('seasonAndEpisodeNumber', {
      as: 'seasonAndEpisodeNumber'
    }).leftJoin(qb => qb.from('seen').where('userId', userId).where('type', 'seen').as('seen'), 'seen.episodeId', 'episode.id').whereNot('episode.isSpecialEpisode', true).whereNot('episode.releaseDate', '').whereNot('episode.releaseDate', null).where('episode.releaseDate', '<=', new Date().toISOString()).whereNull('seen.userId').groupBy('tvShowId').as('firstUnwatchedEpisodeHelper'), 'firstUnwatchedEpisodeHelper.tvShowId', mediaItemId).leftJoin(_dbconfig.Database.knex.ref('episode').as('firstUnwatchedEpisode'), qb => qb.on('firstUnwatchedEpisode.tvShowId', mediaItemId).andOn('firstUnwatchedEpisode.seasonAndEpisodeNumber', 'firstUnwatchedEpisodeHelper.seasonAndEpisodeNumber'));
  }
}
exports.QueryBuilderHelper = QueryBuilderHelper;
//# sourceMappingURL=items.js.map
/* PERF_V2_APPLIED */

/* PROGRESS_DISAMBIGUATED */
