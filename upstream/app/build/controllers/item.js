"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.MediaItemController = void 0;
var _typescriptRoutesToOpenapiServer = require("typescript-routes-to-openapi-server");
var _mediaItem = require("../repository/mediaItem");
var _updateMetadata = require("../updateMetadata");
/**
 * @openapi_tags MediaItem
 */
class MediaItemController {
  /**
   * @openapi_operationId get
   */
  details = (0, _typescriptRoutesToOpenapiServer.createExpressRoute)(async (req, res) => {
    const userId = Number(req.user);
    const {
      mediaItemId
    } = req.params;
    const mediaItem = await _mediaItem.mediaItemRepository.findOne({
      id: mediaItemId
    });
    if (!mediaItem) {
      res.status(404).send();
      return;
    }
    if (mediaItem.needsDetails == true) {
      await (0, _updateMetadata.updateMediaItem)(mediaItem);
    }
    const details = await _mediaItem.mediaItemRepository.details({
      mediaItemId: mediaItemId,
      userId: userId
    });
    res.send(details);
  });

  /**
   * @openapi_operationId updateMetadata
   */
  updateMetadata = (0, _typescriptRoutesToOpenapiServer.createExpressRoute)(async (req, res) => {
    const {
      mediaItemId
    } = req.params;
    const mediaItem = await _mediaItem.mediaItemRepository.findOne({
      id: mediaItemId
    });
    if (!mediaItem) {
      res.status(404).send();
      return;
    }
    await (0, _updateMetadata.updateMediaItem)(mediaItem);
    res.sendStatus(200);
  });
}
exports.MediaItemController = MediaItemController;
//# sourceMappingURL=item.js.map