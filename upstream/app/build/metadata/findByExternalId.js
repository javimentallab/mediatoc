"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.findMediaItemOrEpisodeByExternalId = exports.findMediaItemByExternalIdInExternalSources = exports.findMediaItemByExternalId = exports.findEpisodeByExternalId = void 0;
var _lodash = _interopRequireDefault(require("lodash"));
var _logger = require("../logger");
var _audible = require("./provider/audible");
var _openlibrary = require("./provider/openlibrary");
var _tmdb = require("./provider/tmdb");
var _episode = require("../repository/episode");
var _mediaItem = require("../repository/mediaItem");
var _updateMetadata = require("../updateMetadata");
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
const findEpisodeByExternalId = async args => {
  const {
    imdbId,
    tmdbId,
    tvdbId
  } = args;
  const episode = await _episode.tvEpisodeRepository.findOne({
    tmdbId: tmdbId || undefined,
    tvdbId: tvdbId || undefined,
    imdbId: imdbId || undefined
  });
  if (episode) {
    const mediaItem = await _mediaItem.mediaItemRepository.findOne({
      id: episode.tvdbId
    });
    return {
      mediaItem: mediaItem,
      episode: episode
    };
  }
  if (imdbId) {
    const res = await new _tmdb.TMDbTv().findByEpisodeImdbId(imdbId);
    if (res) {
      return await findMediaItemOrEpisodeByExternalId({
        mediaType: 'tv',
        id: {
          tmdbId: res.tvShowTmdbId
        },
        episodeNumber: res.episode.episodeNumber,
        seasonNumber: res.episode.seasonNumber
      });
    }
  } else if (tvdbId) {
    const res = await new _tmdb.TMDbTv().findByEpisodeTvdbId(tvdbId);
    if (res) {
      return await findMediaItemOrEpisodeByExternalId({
        mediaType: 'tv',
        id: {
          tmdbId: res.tvShowTmdbId
        },
        episodeNumber: res.episode.episodeNumber,
        seasonNumber: res.episode.seasonNumber
      });
    }
  }
  throw `Unable to find episode with imdbId: ${imdbId}, tmdbId: ${tmdbId}, tvdbId: ${tvdbId}`;
};
exports.findEpisodeByExternalId = findEpisodeByExternalId;
const findMediaItemOrEpisodeByExternalId = async args => {
  const {
    mediaType,
    id,
    seasonNumber,
    episodeNumber
  } = args;
  if (mediaType === 'tv' && (typeof seasonNumber !== 'number' || typeof episodeNumber !== 'number')) {
    return {
      error: 'Season end episode number are required for mediaType "tv"'
    };
  }
  if (!id.imdbId && !id.tmdbId && !id.audibleId && !id.igdbId) {
    return {
      error: 'At least one external id is required'
    };
  }
  const mediaItem = await findMediaItemByExternalId({
    id: id,
    mediaType: mediaType
  });
  if (!mediaItem) {
    return {
      error: `Unable to find mediaItem with id: ${JSON.stringify(id)}`
    };
  }
  if (mediaType === 'tv') {
    if (mediaItem.needsDetails) {
      await (0, _updateMetadata.updateMediaItem)(mediaItem);
    }
    const episode = await _episode.tvEpisodeRepository.findOne({
      tvShowId: mediaItem.id,
      episodeNumber: episodeNumber,
      seasonNumber: seasonNumber
    });
    if (!episode) {
      return {
        error: `Unable to find episode S${seasonNumber}E${episodeNumber} for ${mediaItem.title}`
      };
    }
    return {
      mediaItem: mediaItem,
      episode: episode
    };
  }
  return {
    mediaItem: mediaItem
  };
};
exports.findMediaItemOrEpisodeByExternalId = findMediaItemOrEpisodeByExternalId;
const findMediaItemByExternalId = async args => {
  const {
    id,
    mediaType
  } = args;
  const existingItem = await _mediaItem.mediaItemRepository.findByExternalId(id, mediaType);
  if (!existingItem) {
    return await findMediaItemByExternalIdInExternalSources(args);
  }
  return existingItem;
};
exports.findMediaItemByExternalId = findMediaItemByExternalId;
const findMediaItemByExternalIdInExternalSources = async args => {
  const res = await searchMediaItem(args);
  if (res) {
    const existingItem = await _mediaItem.mediaItemRepository.findByExternalId(res, args.mediaType);
    if (!existingItem) {
      return await _mediaItem.mediaItemRepository.create(res);
    }
    return existingItem;
  }
};
exports.findMediaItemByExternalIdInExternalSources = findMediaItemByExternalIdInExternalSources;
const searchMediaItem = async args => {
  const {
    id,
    mediaType
  } = args;
  if (mediaType === 'tv') {
    if (id.tmdbId) {
      _logger.logger.debug(`searching tv show by tmdbId: ${id.tmdbId}`);
      try {
        const res = await new _tmdb.TMDbTv().findByTmdbId(id.tmdbId);
        if (res) {
          return res;
        }
        // eslint-disable-next-line no-empty
      } catch (error) {}
      _logger.logger.error(`unable to find tv show with tmdbId: ${id.tmdbId}`);
    }
    if (id.imdbId) {
      _logger.logger.debug(`searching tv show by imdbId: ${id.imdbId}`);
      try {
        const res = await new _tmdb.TMDbTv().findByImdbId(id.imdbId);
        if (res) {
          return res;
        }
        // eslint-disable-next-line no-empty
      } catch (error) {}
      _logger.logger.error(`unable to find tv show with imdbId: ${id.imdbId}`);
    }
    if (id.tvdbId) {
      _logger.logger.debug(`searching tv show by tvdbId: ${id.tvdbId}`);
      try {
        const res = await new _tmdb.TMDbTv().findByTvdbId(id.tvdbId);
        if (res) {
          return res;
        }
        // eslint-disable-next-line no-empty
      } catch (error) {}
      _logger.logger.error(`unable to find tv show with tvdbId: ${id.tvdbId}`);
    }
    return;
  } else if (mediaType === 'movie') {
    if (id.tmdbId) {
      _logger.logger.debug(`searching movie by tmdbId: ${id.tmdbId}`);
      try {
        const res = await new _tmdb.TMDbMovie().findByTmdbId(id.tmdbId);
        if (res) {
          return res;
        }
        // eslint-disable-next-line no-empty
      } catch (error) {}
      _logger.logger.error(`unable to find movie with tmdbId: ${id.tmdbId}`);
    }
    if (id.imdbId) {
      _logger.logger.debug(`searching movie by imdbId: ${id.imdbId}`);
      try {
        const res = await new _tmdb.TMDbMovie().findByImdbId(id.imdbId);
        if (res) {
          return res;
        }
        // eslint-disable-next-line no-empty
      } catch (error) {}
      _logger.logger.error(`unable to find movie with imdbId: ${id.imdbId}`);
    }
    return;
  } else if (mediaType === 'audiobook') {
    if (id.audibleId) {
      try {
        const res = await new _audible.Audible().findByAudibleId(id.audibleId);
        if (res) {
          return res;
        }
        // eslint-disable-next-line no-empty
      } catch (error) {}
      _logger.logger.error(`unable to find audiobook with audibleId: ${id.audibleId}`);
    }
  } else if (mediaType === 'book') {
    if (id.openlibraryId) {
      try {
        const res = await new _openlibrary.OpenLibrary().details({
          openlibraryId: id.openlibraryId
        });
        if (res) {
          return res;
        }
        // eslint-disable-next-line no-empty
      } catch (error) {}
      _logger.logger.error(`unable to find book with openlibraryId: ${id.openlibraryId}`);
    }
  }
  _logger.logger.error(`no metadata provider for type ${mediaType} with external ids ${JSON.stringify(_lodash.default.omitBy(id, value => !value))}`);
};
//# sourceMappingURL=findByExternalId.js.map