"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.ProgressController = void 0;
var _typescriptRoutesToOpenapiServer = require("typescript-routes-to-openapi-server");
var _episode = require("../repository/episode");
var _mediaItem = require("../repository/mediaItem");
var _seen = require("../repository/seen");
var _listItemRepository = require("../repository/listItemRepository");
var _findByExternalId = require("../metadata/findByExternalId");
var _logger = require("../logger");
var _dbconfig = require("../dbconfig");
/**
 * @openapi_tags Progress
 */
class ProgressController {
  /**
   * @openapi_operationId add
   */
  add = (0, _typescriptRoutesToOpenapiServer.createExpressRoute)(async (req, res) => {
    const userId = Number(req.user);
    const {
      mediaItemId,
      episodeId,
      date,
      action,
      duration,
      progress
    } = req.query;
    if (progress != undefined && (progress < 0 || progress > 1)) {
      res.status(400);
      res.send('Progress should be between 0 and 1');
      return;
    }
    const mediaItem = await _mediaItem.mediaItemRepository.findOne({
      id: mediaItemId
    });
    if (!mediaItem || mediaItem.mediaType === 'tv') {
      res.send(400);
      return;
    }
    if (episodeId) {
      const episode = await _episode.tvEpisodeRepository.findOne({
        id: episodeId
      });
      if (!episode) {
        res.send(400);
        return;
      }
    }
    await addItem({
      userId: userId,
      action: action,
      date: date,
      duration: duration,
      episodeId: episodeId,
      mediaItemId: mediaItemId,
      progress: progress
    });
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
      action,
      duration,
      progress,
      device
    } = req.body;
    if (progress != undefined && (progress < 0 || progress > 1)) {
      res.status(400);
      res.send('Progress should be between 0 and 1');
      return;
    }
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
    if (mediaType === 'tv') {
      await addItem({
        userId: userId,
        action: action,
        date: Date.now(),
        duration: duration,
        episodeId: episode.id,
        mediaItemId: mediaItem.id,
        progress: progress,
        device: device
      });
    } else {
      await addItem({
        userId: userId,
        action: action,
        date: Date.now(),
        duration: duration,
        mediaItemId: mediaItem.id,
        progress: progress,
        device: device
      });
    }
    res.send();
  });

  /**
   * @openapi_operationId deleteById
   */
  deleteById = (0, _typescriptRoutesToOpenapiServer.createExpressRoute)(async (req, res) => {
    const {
      progressId
    } = req.params;
    await _seen.seenRepository.delete({
      id: progressId
    });
    res.send();
  });
}
exports.ProgressController = ProgressController;
const addItem = async args => {
  _logger.logger.debug(`added progress ${JSON.stringify(args)}`);
  if (args.progress === 1) {
    /* WL_COMPLETE_PROGRESS_V1 */
    await _dbconfig.Database.knex.transaction(async trx => {
      await trx('progress').where({
        userId: args.userId,
        mediaItemId: args.mediaItemId,
        episodeId: args.episodeId || null
      }).delete();
      await trx('seen').insert({
        userId: args.userId,
        mediaItemId: args.mediaItemId,
        episodeId: args.episodeId || null,
        date: Date.now(),
        duration: args.duration
      });
    });
    try {
      const _mi = await _mediaItem.mediaItemRepository.findOne({ id: args.mediaItemId });
      if (_mi && _mi.mediaType !== 'tv') {
        await _listItemRepository.listItemRepository.removeItem({
          userId: args.userId,
          mediaItemId: args.mediaItemId,
          watchlist: true
        });
      }
    } catch (_) { /* fire-and-forget */ }
  } else if (Number(args.progress) === 0) {
    /* PROGRESS_ZERO_DELETE_V1 */
    // progress=0 means "no progress" — drop any existing row so the
    // in-progress filter and watchlist branch don't keep the item in
    // Pendiente as a ghost.
    await _dbconfig.Database.knex('progress').where({
      userId: args.userId,
      mediaItemId: args.mediaItemId,
      episodeId: args.episodeId || null
    }).delete();
  } else {
    await _dbconfig.Database.knex.transaction(async trx => {
      const currentProgress = await trx('progress').where({
        userId: args.userId,
        mediaItemId: args.mediaItemId,
        episodeId: args.episodeId || null
      }).first();
      if (currentProgress) {
        await trx('progress').where('id', currentProgress.id).update({
          action: args.action,
          date: Date.now(),
          duration: args.duration,
          progress: args.progress,
          device: args.device
        });
      } else {
        await trx('progress').insert({
          userId: args.userId,
          action: args.action,
          date: Date.now(),
          duration: args.duration,
          mediaItemId: args.mediaItemId,
          episodeId: args.episodeId || null,
          progress: args.progress,
          device: args.device
        });
      }
    });
  }
};
//# sourceMappingURL=progress.js.map