"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.metadataProviders = void 0;
var _audible = require("./provider/audible");
var _igdb = require("./provider/igdb");
var _openlibrary = require("./provider/openlibrary");
var _tmdb = require("./provider/tmdb");
var _wikidata = require("./provider/wikidata");
var _teatroes = require("./provider/teatroes");
var _lodash = _interopRequireDefault(require("lodash"));
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
const providers = [new _igdb.IGDB(), new _audible.Audible(), new _openlibrary.OpenLibrary(), new _tmdb.TMDbMovie(), new _tmdb.TMDbTv(), new _wikidata.WikidataTheater(), new _teatroes.TeatroEsTheater()];
class MetadataProviders {
  metadataProviders = new Map((0, _lodash.default)(providers).groupBy(provider => provider.mediaType).mapValues(value => new Map(_lodash.default.entries(_lodash.default.keyBy(value, value => value.name)))).entries().value());
  has(mediaType) {
    return this.metadataProviders.has(mediaType);
  }
  get(mediaType, name) {
    var _this$metadataProvide, _this$metadataProvide2;
    return name ? (_this$metadataProvide = this.metadataProviders.get(mediaType)) === null || _this$metadataProvide === void 0 ? void 0 : _this$metadataProvide.get(name) : (_this$metadataProvide2 = this.metadataProviders.get(mediaType)) === null || _this$metadataProvide2 === void 0 ? void 0 : _this$metadataProvide2.values().next().value;
  }
  details(mediaItem) {
    var _this$get;
    return (_this$get = this.get(mediaItem.mediaType, mediaItem.source)) === null || _this$get === void 0 ? void 0 : _this$get.details(mediaItem);
  }
}
const metadataProviders = exports.metadataProviders = new MetadataProviders();
//# sourceMappingURL=metadataProviders.js.map