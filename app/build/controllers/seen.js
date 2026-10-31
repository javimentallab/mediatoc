"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.SeenController = void 0;
async function _removeFromWatchlistIfComplete(userId, mediaItem) {
  try {
    const knex = _dbconfig.Database.knex;
    let isComplete = false;
    if (mediaItem.mediaType !== 'tv') {
      isComplete = true;
    } else {
      const today = new Date().toISOString().slice(0, 10);
      /* WL_COMPLETE_V3 */
      const _wlItemRow = await knex('mediaItem').select('status').where('id', mediaItem.id).first();
      const _wlReturning = ['Returning Series', 'In Production', 'Planned'];
      if (_wlItemRow && _wlReturning.indexOf(_wlItemRow.status) >= 0) {
        isComplete = false;
      } else {
        /*mediaocd:wl-complete-aired-only*/
        const remaining = await knex('episode')
          .where('episode.tvShowId', mediaItem.id)
          .where('episode.isSpecialEpisode', false)
          .whereNotNull('episode.releaseDate')
          .where('episode.releaseDate', '<=', today)
          .whereNotExists(function() { this.from('seen').whereRaw('seen.episodeId = episode.id').where('seen.userId', userId); })
          .count('* as c').first();
        isComplete = (Number(remaining && remaining.c) || 0) === 0;
      }
    }
    if (!isComplete) return;
    await knex('listItem')
      .whereIn('listId', knex('list').select('id').where({ userId, isWatchlist: true }))
      .where('mediaItemId', mediaItem.id)
      .whereNull('seasonId')
      .whereNull('episodeId')
      .delete();
  } catch (_) { /* fire-and-forget */ }
}

/*mediaocd:wl-recheck-on-metadata*/
exports._removeFromWatchlistIfComplete = _removeFromWatchlistIfComplete;


/*mediaocd:aip-drops-when-season-over*/
async function _clearAipIfSeasonOver(userId, mediaItem) {
  try {
    if (!mediaItem || mediaItem.mediaType !== 'tv') return;
    const knex = _dbconfig.Database.knex;

    // Solo se limpia un pin manual (excluded=0). Un excluded=1 es una
    // exclusion explicita del usuario y no se toca.
    const aip = await knex('activelyInProgress').where({ userId, mediaItemId: mediaItem.id }).first();
    if (!aip || aip.excluded) return;

    const today = new Date().toISOString().slice(0, 10);

    // (a) que no quede ningun episodio ya emitido sin ver
    const remaining = await knex('episode')
      .where('episode.tvShowId', mediaItem.id)
      .where('episode.isSpecialEpisode', false)
      .whereNotNull('episode.releaseDate')
      .whereNot('episode.releaseDate', '')
      .where('episode.releaseDate', '<=', today)
      .whereNotExists(function() { this.from('seen').whereRaw('seen.episodeId = episode.id').where('seen.userId', userId); })
      .count('* as c').first();
    if ((Number(remaining && remaining.c) || 0) > 0) return;

    // (b) que la temporada del ultimo emitido no tenga ya episodios por venir
    const lastAired = await knex('episode')
      .where('tvShowId', mediaItem.id)
      .where('isSpecialEpisode', false)
      .whereNotNull('releaseDate')
      .whereNot('releaseDate', '')
      .where('releaseDate', '<', today)
      .orderBy('seasonAndEpisodeNumber', 'desc')
      .first();
    if (!lastAired) return;

    const pendingThisSeason = await knex('episode')
      .where('tvShowId', mediaItem.id)
      .where('isSpecialEpisode', false)
      .where('seasonNumber', lastAired.seasonNumber)
      .whereNotNull('releaseDate')
      .whereNot('releaseDate', '')
      .where('releaseDate', '>=', today)
      .count('* as c').first();
    if ((Number(pendingThisSeason && pendingThisSeason.c) || 0) > 0) return;

    await knex('activelyInProgress')
      .where({ userId, mediaItemId: mediaItem.id })
      .where('excluded', false)
      .delete();
  } catch (_) { /* fire-and-forget, igual que _removeFromWatchlistIfComplete */ }
}

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

// --- Jellyfin reverse-sync helper (MT seen → Jellyfin played) ---
async function _jfPushPlayed(mediaItem, episode, userId) { // _jfPushPlayed admin-gated
  try {
    const u = await _dbconfig.Database.knex('user').where('id', userId).first();
    if (!u || !u.admin) return;
  } catch (_) { return; }
  if (!_jfCfg().reverseSync) return;
  const url = _jfCfg().url;
  const token = _jfCfg().apiKey;
  if (!url || !token) return;
  try {
    const base = url.replace(/\/+$/, '');
    const headers = { 'X-Emby-Token': token, 'Accept': 'application/json' };
    let userId = _jfCfg().userId;
    if (!userId) {
      const ru = await fetch(base + '/Users', { headers });
      if (!ru.ok) return;
      const users = await ru.json();
      userId = users && users[0] && users[0].Id;
      if (!userId) return;
    }
    // Jellyfin's AnyProviderIdEquals is broken on 10.10.x — list all items of the
    // right type and filter client-side (cached in memory for 5 min).
    if (!global._jfReverseCache) global._jfReverseCache = new Map();
    const cacheKey = userId + ':' + (episode ? 'Series' : 'Movie');
    let entry = global._jfReverseCache.get(cacheKey);
    if (!entry || (Date.now() - entry.at) > 5 * 60 * 1000) {
      const types = episode ? 'Series' : 'Movie';
      const lr = await fetch(base + '/Users/' + userId + '/Items?Recursive=true&IncludeItemTypes=' + types + '&Fields=ProviderIds&Limit=10000', { headers });
      if (!lr.ok) return;
      const lj = await lr.json();
      entry = { at: Date.now(), items: lj.Items || [] };
      global._jfReverseCache.set(cacheKey, entry); if (global._jfReverseCache.size > 1000) global._jfReverseCache.delete(global._jfReverseCache.keys().next().value);
    }
    let target = null;
    const matched = entry.items.find(it => {
      const p = it.ProviderIds || {};
      if (mediaItem.tmdbId && p.Tmdb && String(p.Tmdb) === String(mediaItem.tmdbId)) return true;
      if (mediaItem.imdbId && p.Imdb && String(p.Imdb) === String(mediaItem.imdbId)) return true;
      if (episode && mediaItem.tvdbId && p.Tvdb && String(p.Tvdb) === String(mediaItem.tvdbId)) return true;
      return false;
    });
    if (!matched) return;
    if (episode) {
      const eq = '/Users/' + userId + '/Items?Recursive=true&IncludeItemTypes=Episode&ParentId=' + matched.Id + '&ParentIndexNumber=' + episode.seasonNumber + '&IndexNumber=' + episode.episodeNumber + '&Limit=1';
      const er = await fetch(base + eq, { headers });
      if (!er.ok) return;
      const ej = await er.json();
      target = ej.Items && ej.Items[0];
    } else {
      target = matched;
    }
    if (!target) return;
    await fetch(base + '/Users/' + userId + '/PlayedItems/' + target.Id, { method: 'POST', headers });
  } catch (_) {}
}

var _dateFns = require("date-fns");
var _typescriptRoutesToOpenapiServer = require("typescript-routes-to-openapi-server");
var _tvepisode = require("../entity/tvepisode");
var _episode = require("../repository/episode");
var _mediaItem = require("../repository/mediaItem");
var _season = require("../repository/season");
var _seen = require("../repository/seen");
var _logger = require("../logger");
var _listItemRepository = require("../repository/listItemRepository");
var _findByExternalId = require("../metadata/findByExternalId");
var _dbconfig = require("../dbconfig");
/**
 * @openapi_tags Seen
 */
class SeenController {
  /**
   * @openapi_operationId add
   */
  add = (0, _typescriptRoutesToOpenapiServer.createExpressRoute)(async (req, res) => {
    const userId = Number(req.user);
    const {
      mediaItemId,
      seasonId,
      episodeId,
      lastSeenAt,
      lastSeenEpisodeId,
      duration,
      kind
    } = req.query;
    let date = req.query.date ? new Date(req.query.date) : null;
    const mediaItem = await _mediaItem.mediaItemRepository.findOne({
      id: mediaItemId
    });
    if (!mediaItem) {
      res.sendStatus(400);
      return;
    }
    if (date && new Date(date) > (0, _dateFns.addHours)(new Date(), 1)) {
      res.sendStatus(400);
      _logger.logger.debug(`seen date (${new Date(date)}) is older then current date (${new Date()})`);
      return;
    }
    if (!date) {
      if (lastSeenAt === 'now') {
        date = new Date();
      } else if (lastSeenAt === 'unknown') {
        date = null;
      } else if (lastSeenAt === 'release_date') {
        if (episodeId) {
          const episode = await _episode.tvEpisodeRepository.findOne({
            id: episodeId
          });
          date = (0, _dateFns.parseISO)(episode.releaseDate);
        } else if (seasonId) {
          const season = await _season.tvSeasonRepository.findOne({
            id: seasonId
          });
          date = (0, _dateFns.parseISO)(season.releaseDate);
        } else {
          const mediaItem = await _mediaItem.mediaItemRepository.findOne({
            id: mediaItemId
          });
          if (!mediaItem) {
            res.sendStatus(400);
            return;
          }
          date = (0, _dateFns.parseISO)(mediaItem.releaseDate);
        }
      }
    }
    /* SEEN_TV_SKIP_ALREADY_SEEN_V1 */const _priorSeen = new Set((await _seen.seenRepository.find({
      userId: userId,
      mediaItemId: mediaItemId
    })).map(s => s.episodeId).filter(id => id != null));
    if (lastSeenEpisodeId) {
      const episodes = await _episode.tvEpisodeRepository.find({
        tvShowId: mediaItemId,
        seasonId: seasonId || undefined
      });
      const lastEpisode = episodes.find(episode => episode.id === lastSeenEpisodeId);
      if (!lastEpisode) {
        throw new Error(`No episode with id ${lastSeenEpisodeId}`);
      }
      const seenEpisodes = episodes.filter(episode => !_priorSeen.has(episode.id)).filter(_tvepisode.TvEpisodeFilters.releasedEpisodes).filter(_tvepisode.TvEpisodeFilters.nonSpecialEpisodes).filter(episode => episode.seasonNumber < lastEpisode.seasonNumber || episode.seasonNumber === lastEpisode.seasonNumber && episode.episodeNumber <= lastEpisode.episodeNumber);
      await _seen.seenRepository.createMany(seenEpisodes.map(episode => {
        var _date;
        return {
          userId: userId,
          mediaItemId: mediaItemId,
          seasonId: episode.seasonId,
          episodeId: episode.id,
          date: lastSeenAt === 'release_date' ? (0, _dateFns.parseISO)(episode.releaseDate).getTime() : ((_date = date) === null || _date === void 0 ? void 0 : _date.getTime()) || null,
          duration: episode.runtime * 60 * 1000 || mediaItem.runtime * 60 * 1000,
          kind: kind || 'played'
        };
      }));
    } else {
      const mediaItem = await _mediaItem.mediaItemRepository.findOne({
        id: mediaItemId
      });
      if (!mediaItem) {
        res.sendStatus(400);
        return;
      }
      if (episodeId) {
        var _date2;
        const episode = await _episode.tvEpisodeRepository.findOne({
          id: episodeId
        });
        if (!episode) {
          res.sendStatus(400);
          return;
        }
        await _seen.seenRepository.create({
          userId: userId,
          mediaItemId: mediaItemId,
          episodeId: episodeId,
          date: ((_date2 = date) === null || _date2 === void 0 ? void 0 : _date2.getTime()) || null,
          kind: kind || 'played'
        });
      } else if (seasonId) {
        const episodes = await _episode.tvEpisodeRepository.find({
          seasonId: seasonId
        });
        await _seen.seenRepository.createMany(episodes.filter(episode => !_priorSeen.has(episode.id)).filter(_tvepisode.TvEpisodeFilters.nonSpecialEpisodes).filter(_tvepisode.TvEpisodeFilters.releasedEpisodes).map(episode => {
          var _date3;
          return {
            userId: userId,
            mediaItemId: mediaItemId,
            episodeId: episode.id,
            date: lastSeenAt === 'release_date' ? (0, _dateFns.parseISO)(episode.releaseDate).getTime() : ((_date3 = date) === null || _date3 === void 0 ? void 0 : _date3.getTime()) || null,
            duration: episode.runtime * 60 * 1000 || mediaItem.runtime * 60 * 1000,
            kind: kind || 'played'
          };
        }));
      } else {
        if (mediaItem.mediaType === 'tv') {
          const episodes = await _episode.tvEpisodeRepository.find({
            tvShowId: mediaItemId
          });
          await _seen.seenRepository.createMany(episodes.filter(episode => !_priorSeen.has(episode.id)).filter(_tvepisode.TvEpisodeFilters.nonSpecialEpisodes).filter(_tvepisode.TvEpisodeFilters.releasedEpisodes).map(episode => {
            var _date4;
            return {
              userId: userId,
              mediaItemId: mediaItemId,
              episodeId: episode.id,
              date: lastSeenAt === 'release_date' ? (0, _dateFns.parseISO)(episode.releaseDate).getTime() : ((_date4 = date) === null || _date4 === void 0 ? void 0 : _date4.getTime()) || null,
              duration: episode.runtime * 60 * 1000 || mediaItem.runtime * 60 * 1000,
              kind: kind || 'played'
            };
          }));
        } else {
          var _date5;
          await _seen.seenRepository.create({
            userId: userId,
            mediaItemId: mediaItemId,
            episodeId: null,
            date: ((_date5 = date) === null || _date5 === void 0 ? void 0 : _date5.getTime()) || null,
            duration: duration || null,
            kind: kind || 'played'
          });
        }
      }
    }
    /*mediaocd:tv-watchlist-on-seen*/
    if (mediaItem.mediaType === 'tv') {
      await _removeFromWatchlistIfComplete(userId, mediaItem);
      await _clearAipIfSeasonOver(userId, mediaItem);
    }
    res.send();
  });

  /**
   * @openapi_operationId addByExternalId
   */
  addByExternalId = (0, _typescriptRoutesToOpenapiServer.createExpressRoute)(async (req, res) => {
    const userId = Number(req.user);
    const {
      mediaType,
      id,
      seasonNumber,
      episodeNumber,
      duration
    } = req.body;
    const {
      mediaItem,
      episode,
      error
    } = await (0, _findByExternalId.findMediaItemOrEpisodeByExternalId)({
      mediaType: mediaType,
      id: id,
      seasonNumber: seasonNumber,
      episodeNumber: episodeNumber
    });
    if (error) {
      res.status(400);
      res.send(error);
      return;
    }
    await _dbconfig.Database.knex.transaction(async trx => {
      const previousSeenItem = await trx('seen').where('userId', userId).where('mediaItemId', mediaItem.id).where('episodeId', (episode === null || episode === void 0 ? void 0 : episode.id) || null).where('kind', kind || 'played').where('date', '>', Date.now() - 1000 * 60 * 60 * 12);
      if (previousSeenItem.length > 0) {
        _logger.logger.debug(`seen entry for userId ${userId}, mediaItemId: ${mediaItem.id}, episodeId: ${episode === null || episode === void 0 ? void 0 : episode.id} already exists, at ${new Date(previousSeenItem.at(0).date)}`);
        return;
      }
      _logger.logger.debug(`adding seen entry for userId ${userId}, mediaItemId: ${mediaItem.id}, episodeId: ${episode === null || episode === void 0 ? void 0 : episode.id}`);
      await trx('seen').insert({
        userId: userId,
        mediaItemId: mediaItem.id,
        episodeId: (episode === null || episode === void 0 ? void 0 : episode.id) || null,
        date: Date.now(),
        duration: duration,
        kind: kind || 'played'
      });
    });
    _jfPushPlayed(mediaItem, episode, userId);
    _removeFromWatchlistIfComplete(userId, mediaItem);
    _clearAipIfSeasonOver(userId, mediaItem);
    res.status(200);
  });

  /**
   * @openapi_operationId deleteById
   */
  deleteById = (0, _typescriptRoutesToOpenapiServer.createExpressRoute)(async (req, res) => {
    const {
      seenId
    } = req.params;
    // seenDeleteIdorGate: only the row's owner (or an admin) can delete it.
    const _knex = require('../dbconfig').Database.knex;
    const _row = await _knex('seen').where('id', seenId).first();
    if (!_row) { res.sendStatus(404); return; }
    const _reqUserId = Number(req.user);
    const _me = await _knex('user').where('id', _reqUserId).first();
    if (_row.userId !== _reqUserId && !(_me && _me.admin)) { res.sendStatus(403); return; }
    await _seen.seenRepository.delete({
      id: seenId
    });
    res.send();
  });

  /**
   * @openapi_operationId delete
   */
  removeFromSeenHistory = (0, _typescriptRoutesToOpenapiServer.createExpressRoute)(async (req, res) => {
    const userId = Number(req.user);
    const {
      mediaItemId,
      seasonId,
      episodeId,
      kind
    } = req.query;
    if (episodeId) {
      await _seen.seenRepository.delete({
        userId: userId,
        episodeId: episodeId,
        kind: kind || undefined
      });
    } else if (seasonId) {
      await _seen.seenRepository.deleteForTvSeason({
        userId: userId,
        seasonId: seasonId
      });
    } else {
      await _seen.seenRepository.delete({
        userId: userId,
        mediaItemId: mediaItemId,
        kind: kind || undefined
      });
    }
    res.send();
  });
}
exports.SeenController = SeenController;
//# sourceMappingURL=seen.js.map