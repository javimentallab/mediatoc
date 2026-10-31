"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.ListItemController = void 0;
var _listItemRepository = require("../repository/listItemRepository");
var _typescriptRoutesToOpenapiServer = require("typescript-routes-to-openapi-server");
/**
 * @openapi_tags List Item
 */
class ListItemController {
  /**
   * @openapi_operationId Add
   */
  addItem = (0, _typescriptRoutesToOpenapiServer.createExpressRoute)(async (req, res) => {
    const currentUser = Number(req.user);
    const {
      listId,
      mediaItemId,
      seasonId,
      episodeId
    } = req.query;
    if (!(await _listItemRepository.listItemRepository.addItem({
      userId: currentUser,
      listId,
      mediaItemId,
      seasonId,
      episodeId
    }))) {
      res.sendStatus(400);
    } else {
      res.send();
    }
  });

  /**
   * @openapi_operationId Remove item from list
   */
  removeItem = (0, _typescriptRoutesToOpenapiServer.createExpressRoute)(async (req, res) => {
    const currentUser = Number(req.user);
    const {
      listId,
      mediaItemId,
      seasonId,
      episodeId
    } = req.query;
    if (!(await _listItemRepository.listItemRepository.removeItem({
      userId: currentUser,
      listId,
      mediaItemId,
      seasonId,
      episodeId
    }))) {
      res.sendStatus(400);
    } else {
      res.send();
    }
  });
}
exports.ListItemController = ListItemController;
//# sourceMappingURL=listItemController.js.map