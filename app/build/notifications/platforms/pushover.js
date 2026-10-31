"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.Pushover = void 0;
var _axios = _interopRequireDefault(require("axios"));
var _createNotificationPlatform = require("../createNotificationPlatform");
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
const APP_TOKEN = 'ax32fzevhit7iwkm3fk18uw1i2ooyv';
const Pushover = exports.Pushover = (0, _createNotificationPlatform.createNotificationPlatform)({
  name: 'Pushover',
  credentialName: 'key',
  sendFunction: async args => {
    const {
      credentials,
      content
    } = args;
    const params = new URLSearchParams({
      message: content.body.html,
      title: content.title,
      user: credentials.key,
      token: APP_TOKEN,
      html: '1'
    });
    await _axios.default.post('https://api.pushover.net/1/messages.json', params);
  }
});
//# sourceMappingURL=pushover.js.map