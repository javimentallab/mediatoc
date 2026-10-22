"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.SearchController = void 0;
var _typescriptRoutesToOpenapiServer = require("typescript-routes-to-openapi-server");
var _metadataProviders = require("../metadata/metadataProviders");
var _mediaItem = require("../repository/mediaItem");
/**
 * @openapi_tags Search
 */
class SearchController {
  /**
   * @openapi_operationId search
   */
  search = (0, _typescriptRoutesToOpenapiServer.createExpressRoute)(async (req, res) => {
    var _query$trim;
    const userId = Number(req.user);
    const {
      mediaType,
      q: query
    } = req.query;
    if (typeof query !== 'string' || (query === null || query === void 0 || (_query$trim = query.trim()) === null || _query$trim === void 0 ? void 0 : _query$trim.length) === 0) {
      res.sendStatus(400);
      return;
    }
    if (!_metadataProviders.metadataProviders.has(mediaType)) {
      throw new Error(`No metadata provider for "${mediaType}"`);
    }
    const metadataProvider = _metadataProviders.metadataProviders.get(mediaType);
    const searchResult = await metadataProvider.search(query);
    const result = await _mediaItem.mediaItemRepository.mergeSearchResultWithExistingItems(searchResult, mediaType);
    const existingItemsDetails = await _mediaItem.mediaItemRepository.items({
      userId: userId,
      mediaItemIds: result.map(item => item.id)
    });
    res.send(existingItemsDetails);
  });
}
exports.SearchController = SearchController;
//# sourceMappingURL=search.js.map