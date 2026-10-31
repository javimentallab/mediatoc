"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.userRatingColumns = exports.UserRatingFilters = void 0;
const userRatingColumns = exports.userRatingColumns = ['id', 'date', 'mediaItemId', 'userId', 'rating', 'review', 'episodeId', 'seasonId'];
class UserRatingFilters {
  static mediaItemUserRating = rating => {
    return !rating.seasonId && !rating.episodeId;
  };
  static seasonUserRating = rating => {
    return Boolean(rating.seasonId && !rating.episodeId);
  };
  static episodeUserRating = rating => {
    return Boolean(rating.episodeId);
  };
}
exports.UserRatingFilters = UserRatingFilters;
//# sourceMappingURL=userRating.js.map