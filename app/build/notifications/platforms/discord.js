"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.Discord = void 0;
var _axios = _interopRequireDefault(require("axios"));
var _createNotificationPlatform = require("../createNotificationPlatform");
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
const Discord = exports.Discord = (0, _createNotificationPlatform.createNotificationPlatform)({
  name: 'Discord',
  credentialNames: ['url'],
  sendFunction: async args => {
    const {
      credentials,
      content
    } = args;
    await _axios.default.post(new URL(credentials.url).href, {
      content: content.body.markdown,
      username: content.title
    });
  }
});
//# sourceMappingURL=discord.js.map