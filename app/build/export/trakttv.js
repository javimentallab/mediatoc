"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.TraktTvExport = exports.TraktApi = void 0;
var _axios = _interopRequireDefault(require("axios"));
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
const CLIENT_ID = 'b3d93fd4c53d78d61b18e0f0bf7ad5153de323788dbc0be1a3627205a36e89f5';
const CLIENT_SECRET = '4274a0fcefea5877bb94323033fe945a65528c2112411cadc091bb164173c377';
class TraktTvExport {
  hasDeviceCodeExpired() {
    var _this$deviceCodeAcqui, _this$deviceCode;
    return new Date().getTime() > ((_this$deviceCodeAcqui = this.deviceCodeAcquiredAt) === null || _this$deviceCodeAcqui === void 0 ? void 0 : _this$deviceCodeAcqui.getTime()) + ((_this$deviceCode = this.deviceCode) === null || _this$deviceCode === void 0 ? void 0 : _this$deviceCode.expires_in) * 1000;
  }
  async authenticate(onAuthenticated) {
    if (!this.deviceCode || this.hasDeviceCodeExpired()) {
      this.deviceToken = undefined;
      const res = await _axios.default.post('https://api.trakt.tv/oauth/device/code', {
        client_id: CLIENT_ID
      });
      this.deviceCode = res.data;
      this.deviceCodeAcquiredAt = new Date();
      const handler = async () => {
        try {
          const res = await _axios.default.post('https://api.trakt.tv/oauth/device/token', {
            code: this.deviceCode.device_code,
            client_secret: CLIENT_SECRET,
            client_id: CLIENT_ID
          }, {
            headers: {
              'Content-Type': 'application/json'
            }
          });
          this.deviceToken = res.data;
          clearInterval(interval);
          await onAuthenticated(this.deviceCode.user_code);

          // eslint-disable-next-line no-empty
        } catch (error) {}
      };
      const interval = setInterval(handler, this.deviceCode.interval * 1000);
    }
    return {
      userCode: this.deviceCode.user_code,
      verificationUrl: this.deviceCode.verification_url,
      expiresAt: new Date(new Date().getTime() + this.deviceCode.expires_in * 1000)
    };
  }
  isAuthenticated() {
    return this.deviceToken !== undefined;
  }
  headers() {
    return {
      'Content-type': 'application/json',
      'trakt-api-version': 2,
      'trakt-api-key': CLIENT_ID,
      Authorization: `Bearer ${this.deviceToken.access_token}`
    };
  }
  async getHistory() {
    const result = [];
    const limit = 1000;
    let page = 1;
    let pageCount = undefined;
    do {
      const historyResponse = await _axios.default.get('https://api.trakt.tv/sync/history', {
        headers: this.headers(),
        data: {
          page: page++,
          limit: limit
        }
      });
      pageCount = Number(historyResponse.headers['x-pagination-page-count']);
      result.push(...historyResponse.data);
    } while (page <= pageCount);
    return result;
  }
  async export() {
    if (!this.deviceToken) {
      throw new Error('No device token');
    }
    const watchlistResponse = await _axios.default.get('https://api.trakt.tv/sync/watchlist', {
      headers: this.headers()
    });
    const historyResponse = await this.getHistory();
    const ratingResponse = await _axios.default.get('https://api.trakt.tv/sync/ratings', {
      headers: this.headers()
    });
    const listsResponse = await _axios.default.get('https://api.trakt.tv/users/me/lists', {
      headers: this.headers()
    });
    const listsItems = new Map();
    for (const list of listsResponse.data) {
      const listItemsResponse = await _axios.default.get(`https://api.trakt.tv/users/me/lists/${list.ids.slug}/items`, {
        headers: this.headers()
      });
      listsItems.set(list.ids.slug, listItemsResponse.data);
    }
    return {
      watchlist: watchlistResponse.data,
      history: historyResponse,
      rating: ratingResponse.data,
      lists: listsResponse.data,
      listsItems
    };
  }
}
exports.TraktTvExport = TraktTvExport;
let TraktApi = exports.TraktApi = void 0;
//# sourceMappingURL=trakttv.js.map