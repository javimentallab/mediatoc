"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.RatingController = void 0;
var _typescriptRoutesToOpenapiServer = require("typescript-routes-to-openapi-server");
var _userRating = require("../repository/userRating");
/**
 * @openapi_tags Rating
 */
class RatingController {
  /**
   * @openapi_operationId add
   */
  add = (0, _typescriptRoutesToOpenapiServer.createExpressRoute)(async (req, res) => {
    const userId = Number(req.user);
    const {
      mediaItemId,
      seasonId,
      episodeId,
      rating,
      review
    } = req.body;
    const userRating = {
      date: new Date().getTime(),
      mediaItemId: mediaItemId,
      episodeId: episodeId || null,
      seasonId: seasonId || null,
      review: review,
      userId: userId,
      rating: rating
    };
    await _userRating.userRatingRepository.updateOrCreate({
      where: {
        userId: userId,
        mediaItemId: mediaItemId,
        seasonId: seasonId || null,
        episodeId: episodeId || null
      },
      value: userRating
    });
    res.send();
  });
}
exports.RatingController = RatingController;
//# sourceMappingURL=rating.js.map