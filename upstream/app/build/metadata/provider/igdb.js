"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.IGDB = void 0;
var _urlJoin = _interopRequireDefault(require("url-join"));
var _axios = _interopRequireDefault(require("axios"));
var _requestQueue = require("../../requestQueue");
var _metadataProvider = require("../metadataProvider");
var _globalSettings = require("../../repository/globalSettings");
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
const getPosterUrl = (path, size = 't_original') => {
  return (0, _urlJoin.default)('https://images.igdb.com/igdb/image/upload/', size, path + '.jpg');
};
class IGDB extends _metadataProvider.MetadataProvider {
  name = 'IGDB';
  mediaType = 'video_game';
  async search(query) {
    const result = await this.searchGames(query);
    return Promise.all(result.map(item => this.mapGame(item)));
  }
  async details(mediaItem) {
    const result = await this.game(mediaItem.igdbId);
    return result ? this.mapGame(result) : null;
  }
  mapGame(searchResult) {
    var _searchResult$website, _searchResult$involve, _searchResult$platfor;
    return {
      needsDetails: false,
      source: this.name,
      mediaType: this.mediaType,
      igdbId: searchResult.id,
      releaseDate: searchResult.first_release_date ? new Date(searchResult.first_release_date * 1000).toISOString() : null,
      title: searchResult.name,
      overview: searchResult.summary,
      externalPosterUrl: searchResult.cover ? getPosterUrl(searchResult.cover.image_id) : null,
      genres: searchResult.genres ? searchResult.genres.map(genre => genre.name) : null,
      url: ((_searchResult$website = searchResult.websites) === null || _searchResult$website === void 0 ? void 0 : _searchResult$website.length) > 0 ? searchResult.websites[0].url : null,
      developer: (_searchResult$involve = searchResult.involved_companies) === null || _searchResult$involve === void 0 || (_searchResult$involve = _searchResult$involve.find(item => item.developer)) === null || _searchResult$involve === void 0 ? void 0 : _searchResult$involve.company.name,
      platform: (_searchResult$platfor = searchResult.platforms) === null || _searchResult$platfor === void 0 ? void 0 : _searchResult$platfor.map(value => value.name)
    };
  }
  async game(gameId) {
    const res = await this.get('games', `fields 
        name,
        first_release_date,
        summary,
        cover.image_id, 
        involved_companies.company.name, 
        involved_companies.developer, 
        platforms.name, 
        platforms.platform_logo.id, 
        genres.name, 
        platforms.id,
        release_dates.date,
        release_dates.platform,
        websites.url; 
      where id = ${gameId} & version_parent = null;`);
    if ((res === null || res === void 0 ? void 0 : res.length) > 0) {
      return res[0];
    }
  }
  async searchGames(query) {
    return await this.get('games', `fields 
        name,
        first_release_date,
        summary,
        cover.image_id, 
        involved_companies.company.name, 
        involved_companies.developer, 
        platforms.name, 
        platforms.platform_logo.id, 
        genres.name, 
        platforms.id,
        release_dates.date,
        release_dates.platform,
        websites.url; 
      search "${query}"; 
      where version_parent = null; 
      limit 50;`);
  }
  async get(endpoint, query) {
    await this.refreshToken();
    const result = await this.requestQueue.request(() => _axios.default.post((0, _urlJoin.default)('https://api.igdb.com/v4/', endpoint), query, {
      headers: {
        Authorization: 'Bearer ' + this.token.access_token,
        'Client-ID': _globalSettings.GlobalConfiguration.configuration.igdbClientId
      }
    }));
    return result.data;
  }
  async refreshToken() {
    var _this$tokenAcquiredAt, _this$token;
    if (((_this$tokenAcquiredAt = this.tokenAcquiredAt) === null || _this$tokenAcquiredAt === void 0 ? void 0 : _this$tokenAcquiredAt.getTime()) + ((_this$token = this.token) === null || _this$token === void 0 ? void 0 : _this$token.expires_in) * 1000 > new Date().getTime()) {
      return;
    }
    const result = await this.requestQueue.request(() => _axios.default.post('https://id.twitch.tv/oauth2/token', null, {
      params: {
        client_id: _globalSettings.GlobalConfiguration.configuration.igdbClientId,
        client_secret: _globalSettings.GlobalConfiguration.configuration.igdbClientSecret,
        grant_type: 'client_credentials'
      }
    }));
    if (result.status === 200) {
      this.token = result.data;
      this.tokenAcquiredAt = new Date();
    }
  }
  requestQueue = new _requestQueue.RequestQueue({
    timeBetweenRequests: 250
  });
}
exports.IGDB = IGDB;
//# sourceMappingURL=igdb.js.map