"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.seasonPosterPath = exports.mediaItemPosterPath = exports.mediaItemColumns = exports.mediaItemBackdropPath = void 0;
const mediaItemColumns = exports.mediaItemColumns = ['developer', 'genres', 'id', 'igdbId', 'imdbId', 'audibleId', 'lastTimeUpdated', 'mediaType', 'network', 'numberOfSeasons', 'openlibraryId', 'originalTitle', 'overview', 'platform', 'releaseDate', 'tmdbRating', 'runtime', 'source', 'status', 'title', 'tmdbId', 'tvmazeId', 'url', 'needsDetails', 'authors', 'narrators', 'language', 'goodreadsId', 'numberOfPages', 'traktId', 'audibleCountryCode', 'tvdbId', 'externalPosterUrl', 'externalBackdropUrl', 'posterId', 'backdropId', 'downloaded', 'audioProgress', 'numberOfChapters', 'links'];
const mediaItemPosterPath = (mediaItemId, size) => {
  return `img/poster?${new URLSearchParams({
    mediaItemId: mediaItemId.toString(),
    size: size
  })}`;
};
exports.mediaItemPosterPath = mediaItemPosterPath;
const mediaItemBackdropPath = mediaItemId => {
  return `img/backdrop?${new URLSearchParams({
    mediaItemId: mediaItemId.toString()
  })}`;
};
exports.mediaItemBackdropPath = mediaItemBackdropPath;
const seasonPosterPath = (seasonId, size) => {
  return `img/poster?${new URLSearchParams({
    seasonId: seasonId.toString(),
    size: size
  })}`;
};
exports.seasonPosterPath = seasonPosterPath;
//# sourceMappingURL=mediaItem.js.map