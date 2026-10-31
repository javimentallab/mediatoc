"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.findImageUrlFromInternalId = exports.ImgController = void 0;
var _path = _interopRequireDefault(require("path"));
var _fsExtra = _interopRequireDefault(require("fs-extra"));
var _typescriptRoutesToOpenapiServer = require("typescript-routes-to-openapi-server");
var _utils = require("../utils");
var _config = require("../config");
var _dbconfig = require("../dbconfig");
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
/**
 * @openapi_tags Img
 */
class ImgController {
  /**
   * @openapi_operationId GetImage
   */
  image = (0, _typescriptRoutesToOpenapiServer.createExpressRoute)(async (req, res) => {
    const {
      size
    } = req.query;
    const {
      id
    } = req.params;
    const imagePath = _path.default.resolve(_config.Config.ASSETS_PATH, size || 'original', `${id}.webp`);
    if (!(await _fsExtra.default.pathExists(imagePath))) {
      const imageUrl = await findImageUrlFromInternalId(id);
      if (!imageUrl) {
        res.sendStatus(404);
        return;
      }
      await (0, _utils.downloadAsset)({
        imageId: id,
        url: imageUrl
      });
    }
    if (!(await _fsExtra.default.pathExists(imagePath))) {
      res.sendStatus(404);
      return;
    }
    res.setHeader('Content-Type', 'image/webp');
    res.set('Cache-Control', 'max-age=31536000');
    res.sendFile(imagePath);
  });
}
exports.ImgController = ImgController;
const findImageUrlFromInternalId = async imageId => {
  const mediaItemWithPoster = await _dbconfig.Database.knex('mediaItem').where('posterId', imageId).first();
  if (mediaItemWithPoster) {
    return mediaItemWithPoster.externalPosterUrl;
  }
  const mediaItemWithBackdrop = await _dbconfig.Database.knex('mediaItem').where('backdropId', imageId).first();
  if (mediaItemWithBackdrop) {
    return mediaItemWithBackdrop.externalBackdropUrl;
  }
  const seasonWithPoster = await _dbconfig.Database.knex('season').where('posterId', imageId).first();
  if (seasonWithPoster) {
    return seasonWithPoster.externalPosterUrl;
  }
};
exports.findImageUrlFromInternalId = findImageUrlFromInternalId;
//# sourceMappingURL=img.js.map