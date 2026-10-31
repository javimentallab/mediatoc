// mediaocd: only-watched-passthrough
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.ItemsController = void 0;
var _typescriptRoutesToOpenapiServer = require("typescript-routes-to-openapi-server");
var _mediaItem = require("../repository/mediaItem");
class ItemsController {
  /**
   * @description Get items
   * @openapi_tags Items
   * @openapi_operationId paginated
   */
  getPaginated = (0, _typescriptRoutesToOpenapiServer.createExpressRoute)(async (req, res) => {
    const userId = Number(req.user);
    const {
      filter,
      mediaType,
      onlyWithNextAiring,
      onlyWithNextEpisodesToWatch,
      page,
      onlySeenItems,
      onlyOnWatchlist,
      onlyWithUserRating,
      onlyWithoutUserRating,
      onlyWithProgress,
      onlyDownloaded,
      excludeAbandoned,
      onlyAbandoned,
      onlyWatched,
      onlyPlayed,
      onlyJustWatched
    } = req.query;
    const orderBy = req.query.orderBy || 'title';
    const sortOrder = req.query.sortOrder || 'asc';
    if (page <= 0) {
      res.status(400);
      return;
    }
    const result = await _mediaItem.mediaItemRepository.items({
      userId: userId,
      mediaType: mediaType,
      orderBy: orderBy,
      sortOrder: sortOrder,
      filter: filter,
      page: page,
      onlySeenItems: onlySeenItems,
      onlyOnWatchlist: onlyOnWatchlist,
      onlyWithNextEpisodesToWatch: onlyWithNextEpisodesToWatch,
      onlyWithNextAiring: onlyWithNextAiring,
      onlyWithUserRating: onlyWithUserRating,
      onlyWithoutUserRating: onlyWithoutUserRating,
      onlyWithProgress: onlyWithProgress,
      onlyDownloaded: onlyDownloaded,
      excludeAbandoned: excludeAbandoned,
      onlyAbandoned: onlyAbandoned,
      onlyWatched: onlyWatched,
      onlyPlayed: onlyPlayed,
      onlyJustWatched: onlyJustWatched
    });
    res.send(result);
  });

  /**
   * @description Get items
   * @openapi_tags Items
   * @openapi_operationId get
   */
  get = (0, _typescriptRoutesToOpenapiServer.createExpressRoute)(async (req, res) => {
    const userId = Number(req.user);
    const {
      filter,
      mediaType,
      onlyWithNextAiring,
      onlyWithNextEpisodesToWatch,
      onlySeenItems,
      onlyOnWatchlist,
      onlyWithUserRating,
      onlyWithoutUserRating,
      onlyWithProgress,
      onlyDownloaded,
      excludeAbandoned,
      onlyAbandoned,
      onlyWatched,
      onlyPlayed,
      onlyJustWatched
    } = req.query;
    const orderBy = req.query.orderBy || 'title';
    const sortOrder = req.query.sortOrder || 'asc';
    const result = await _mediaItem.mediaItemRepository.items({
      userId: userId,
      mediaType: mediaType,
      orderBy: orderBy,
      sortOrder: sortOrder,
      filter: filter,
      onlySeenItems: onlySeenItems,
      onlyOnWatchlist: onlyOnWatchlist,
      onlyWithNextEpisodesToWatch: onlyWithNextEpisodesToWatch,
      onlyWithNextAiring: onlyWithNextAiring,
      onlyWithUserRating: onlyWithUserRating,
      onlyWithoutUserRating: onlyWithoutUserRating,
      onlyWithProgress: onlyWithProgress,
      onlyDownloaded: onlyDownloaded,
      excludeAbandoned: excludeAbandoned,
      onlyAbandoned: onlyAbandoned,
      onlyWatched: onlyWatched,
      onlyPlayed: onlyPlayed,
      onlyJustWatched: onlyJustWatched
    });
    res.send(result);
  });
}
exports.ItemsController = ItemsController;
//# sourceMappingURL=items.js.map