"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.WatchlistController = void 0;
var _listItemRepository = require("../repository/listItemRepository");
var _typescriptRoutesToOpenapiServer = require("typescript-routes-to-openapi-server");
/**
 * @openapi_tags Watchlist
 */
class WatchlistController {
  /**
   * @openapi_operationId add
   */
  add = (0, _typescriptRoutesToOpenapiServer.createExpressRoute)(async (req, res) => {
    const userId = Number(req.user);
    const {
      mediaItemId,
      seasonId,
      episodeId
    } = req.query;
    if (!(await _listItemRepository.listItemRepository.addItem({
      userId,
      mediaItemId,
      seasonId,
      episodeId,
      watchlist: true
    }))) {
      res.sendStatus(400);
    } else {
      res.send();
    }
  });

  /**
   * @openapi_operationId delete
   */
  delete = (0, _typescriptRoutesToOpenapiServer.createExpressRoute)(async (req, res) => {
    const userId = Number(req.user);
    const {
      mediaItemId,
      seasonId,
      episodeId
    } = req.query;
    if (!(await _listItemRepository.listItemRepository.removeItem({
      userId,
      mediaItemId,
      seasonId,
      episodeId,
      watchlist: true
    }))) {
      res.sendStatus(400);
    } else {
      res.send();
    }
  });
}
exports.WatchlistController = WatchlistController;
//# sourceMappingURL=watchlist.js.map