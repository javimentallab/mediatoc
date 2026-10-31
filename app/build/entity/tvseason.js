"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.tvSeasonColumns = exports.TvSeasonFilters = void 0;
const tvSeasonColumns = exports.tvSeasonColumns = ['description', 'id', 'isSpecialSeason', 'numberOfEpisodes', 'externalPosterUrl', 'posterId', 'releaseDate', 'seasonNumber', 'title', 'tmdbId', 'tvShowId', 'tvdbId', 'traktId'];
class TvSeasonFilters {
  static nonSpecialSeason = season => {
    return !season.isSpecialSeason;
  };
  static seasonNumber = season => {
    return season.seasonNumber;
  };
}
exports.TvSeasonFilters = TvSeasonFilters;
//# sourceMappingURL=tvseason.js.map