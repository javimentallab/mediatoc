"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.PlexController = void 0;
var _busboy = _interopRequireDefault(require("busboy"));
var _logger = require("../logger");
var _findByExternalId = require("../metadata/findByExternalId");
var _seen = require("../repository/seen");
var _typescriptRoutesToOpenapiServer = require("typescript-routes-to-openapi-server");
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
/**
 * @openapi_tags Lists
 */
class PlexController {
  /**
   * @openapi_operationId Plex webhook
   */
  post = (0, _typescriptRoutesToOpenapiServer.createExpressRoute)(async (req, res) => {
    const userId = Number(req.user);
    const payload = await getPlexPayload(req);
    if (payload.event === 'media.scrobble') {
      const {
        imdbId,
        tmdbId,
        tvdbId,
        duration
      } = parsePlexPayload(payload);
      if (payload.Metadata.type === 'episode') {
        const {
          mediaItem,
          episode
        } = await (0, _findByExternalId.findEpisodeByExternalId)({
          imdbId,
          tmdbId,
          tvdbId
        });
        if (episode) {
          _logger.logger.debug(`adding episode ${mediaItem.title} ${episode.seasonNumber}x${episode.episodeNumber} to seen history of user ${userId} with Plex webhook`);
          await _seen.seenRepository.create({
            userId: userId,
            mediaItemId: mediaItem.id,
            episodeId: episode.id,
            date: Date.now(),
            duration: duration || episode.runtime
          });
        }
      } else if (payload.Metadata.type === 'movie') {
        const mediaItem = await (0, _findByExternalId.findMediaItemByExternalId)({
          id: {
            imdbId,
            tmdbId,
            tvdbId
          },
          mediaType: 'movie'
        });
        if (mediaItem) {
          _logger.logger.debug(`adding movie ${mediaItem.title} to seen history of user ${userId} with Plex webhook`);
          await _seen.seenRepository.create({
            userId: userId,
            mediaItemId: mediaItem.id,
            date: Date.now(),
            duration: duration || mediaItem.runtime
          });
        }
      }
    }
    res.sendStatus(200);
  });
}
exports.PlexController = PlexController;
const getPlexPayload = async req => {
  return await new Promise((resolve, reject) => {
    const bb = (0, _busboy.default)({
      headers: req.headers
    });
    bb.on('field', (name, val) => {
      if (name === 'payload') {
        resolve(JSON.parse(val));
      }
    });
    bb.on('close', () => {
      reject(new Error(`No "payload" filed on Plex webhook body`));
    });
    req.pipe(bb);
  });
};
const parsePlexPayload = payload => {
  const externalIds = payload.Metadata.Guid.map(item => {
    var _item$id$match;
    return (_item$id$match = item.id.match(/^(?<provider>imdb|tmdb|tvdb):\/\/(?<id>\w+)$/)) === null || _item$id$match === void 0 ? void 0 : _item$id$match.groups;
  }).filter(Boolean).map(match => ({
    [match.provider]: match.id
  })).reduce((res, current) => ({
    ...res,
    ...current
  }));
  const imdbId = externalIds.imdb;
  const tmdbId = Number(externalIds.tmdb) || undefined;
  const tvdbId = Number(externalIds.tvdb) || undefined;
  const duration = typeof payload.Metadata.duration === 'number' ? payload.Metadata.duration / 1000 : null;
  return {
    imdbId,
    tmdbId,
    tvdbId,
    duration
  };
};
//# sourceMappingURL=plexController.js.map