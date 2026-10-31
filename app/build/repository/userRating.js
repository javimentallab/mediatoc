"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.userRatingRepository = void 0;
var _repository = require("./repository");
const userRatingRepository = exports.userRatingRepository = new ((0, _repository.repository)({
  tableName: 'userRating',
  primaryColumnName: 'id',
  uniqueBy: value => ({
    mediaItemId: value.mediaItemId,
    episodeId: value.episodeId || null,
    seasonId: value.seasonId || null,
    userId: value.userId
  })
}))();
//# sourceMappingURL=userRating.js.map