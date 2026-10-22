"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.SeenController = void 0;
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
      duration
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
    if (lastSeenEpisodeId) {
      const episodes = await _episode.tvEpisodeRepository.find({
        tvShowId: mediaItemId,
        seasonId: seasonId || undefined
      });
      const lastEpisode = episodes.find(episode => episode.id === lastSeenEpisodeId);
      if (!lastEpisode) {
        throw new Error(`No episode with id ${lastSeenEpisodeId}`);
      }
      const seenEpisodes = episodes.filter(_tvepisode.TvEpisodeFilters.unwatchedEpisodes).filter(_tvepisode.TvEpisodeFilters.releasedEpisodes).filter(_tvepisode.TvEpisodeFilters.nonSpecialEpisodes).filter(episode => episode.seasonNumber < lastEpisode.seasonNumber || episode.seasonNumber === lastEpisode.seasonNumber && episode.episodeNumber <= lastEpisode.episodeNumber);
      await _seen.seenRepository.createMany(seenEpisodes.map(episode => {
        var _date;
        return {
          userId: userId,
          mediaItemId: mediaItemId,
          seasonId: episode.seasonId,
          episodeId: episode.id,
          date: lastSeenAt === 'release_date' ? (0, _dateFns.parseISO)(episode.releaseDate).getTime() : ((_date = date) === null || _date === void 0 ? void 0 : _date.getTime()) || null,
          duration: episode.runtime * 60 * 1000 || mediaItem.runtime * 60 * 1000
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
          date: ((_date2 = date) === null || _date2 === void 0 ? void 0 : _date2.getTime()) || null
        });
      } else if (seasonId) {
        const episodes = await _episode.tvEpisodeRepository.find({
          seasonId: seasonId
        });
        await _seen.seenRepository.createMany(episodes.filter(_tvepisode.TvEpisodeFilters.unwatchedEpisodes).filter(_tvepisode.TvEpisodeFilters.nonSpecialEpisodes).filter(_tvepisode.TvEpisodeFilters.releasedEpisodes).map(episode => {
          var _date3;
          return {
            userId: userId,
            mediaItemId: mediaItemId,
            episodeId: episode.id,
            date: lastSeenAt === 'release_date' ? (0, _dateFns.parseISO)(episode.releaseDate).getTime() : ((_date3 = date) === null || _date3 === void 0 ? void 0 : _date3.getTime()) || null,
            duration: episode.runtime * 60 * 1000 || mediaItem.runtime * 60 * 1000
          };
        }));
      } else {
        if (mediaItem.mediaType === 'tv') {
          const episodes = await _episode.tvEpisodeRepository.find({
            tvShowId: mediaItemId
          });
          await _seen.seenRepository.createMany(episodes.filter(_tvepisode.TvEpisodeFilters.nonSpecialEpisodes).filter(_tvepisode.TvEpisodeFilters.releasedEpisodes).map(episode => {
            var _date4;
            return {
              userId: userId,
              mediaItemId: mediaItemId,
              episodeId: episode.id,
              date: lastSeenAt === 'release_date' ? (0, _dateFns.parseISO)(episode.releaseDate).getTime() : ((_date4 = date) === null || _date4 === void 0 ? void 0 : _date4.getTime()) || null,
              duration: episode.runtime * 60 * 1000 || mediaItem.runtime * 60 * 1000
            };
          }));
        } else {
          var _date5;
          await _seen.seenRepository.create({
            userId: userId,
            mediaItemId: mediaItemId,
            episodeId: null,
            date: ((_date5 = date) === null || _date5 === void 0 ? void 0 : _date5.getTime()) || null,
            duration: duration || null
          });
        }
      }
      if (mediaItem.mediaType !== 'tv') {
        await _listItemRepository.listItemRepository.removeItem({
          userId: userId,
          mediaItemId: mediaItemId,
          watchlist: true
        });
      }
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
      const previousSeenItem = await trx('seen').where('userId', userId).where('mediaItemId', mediaItem.id).where('episodeId', (episode === null || episode === void 0 ? void 0 : episode.id) || null).where('date', '>', Date.now() - 1000 * 60 * 60 * 12);
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
        duration: duration
      });
    });
    res.status(200);
  });

  /**
   * @openapi_operationId deleteById
   */
  deleteById = (0, _typescriptRoutesToOpenapiServer.createExpressRoute)(async (req, res) => {
    const {
      seenId
    } = req.params;
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
      episodeId
    } = req.query;
    if (episodeId) {
      await _seen.seenRepository.delete({
        userId: userId,
        episodeId: episodeId
      });
    } else if (seasonId) {
      await _seen.seenRepository.deleteForTvSeason({
        userId: userId,
        seasonId: seasonId
      });
    } else {
      await _seen.seenRepository.delete({
        userId: userId,
        mediaItemId: mediaItemId
      });
    }
    res.send();
  });
}
exports.SeenController = SeenController;
//# sourceMappingURL=seen.js.map