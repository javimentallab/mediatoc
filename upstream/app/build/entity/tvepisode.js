"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.tvEpisodeColumns = exports.TvEpisodeFilters = void 0;
var _dateFns = require("date-fns");
const tvEpisodeColumns = exports.tvEpisodeColumns = ['releaseDate', 'description', 'episodeNumber', 'id', 'imdbId', 'runtime', 'seasonId', 'seasonNumber', 'title', 'tmdbId', 'tvShowId', 'isSpecialEpisode', 'seasonAndEpisodeNumber', 'tvdbId', 'traktId'];
class TvEpisodeFilters {
  static unwatchedEpisodes = episode => {
    var _episode$seenHistory;
    return !episode.seenHistory || ((_episode$seenHistory = episode.seenHistory) === null || _episode$seenHistory === void 0 ? void 0 : _episode$seenHistory.length) === 0;
  };
  static nonSpecialEpisodes = episode => {
    return !episode.isSpecialEpisode;
  };
  static releasedEpisodes = episode => {
    return episode.releaseDate && episode.releaseDate.trim() != '' && (0, _dateFns.parseISO)(episode.releaseDate) <= new Date();
  };
  static unreleasedEpisodes = episode => {
    return !episode.releaseDate || episode.releaseDate.trim() == '' || (0, _dateFns.parseISO)(episode.releaseDate) > new Date();
  };
  static withReleaseDateEpisodes = episode => {
    return episode.releaseDate !== undefined;
  };
}
exports.TvEpisodeFilters = TvEpisodeFilters;
//# sourceMappingURL=tvepisode.js.map