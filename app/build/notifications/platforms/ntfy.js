"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.ntfy = void 0;
var _axios = _interopRequireDefault(require("axios"));
var _createNotificationPlatform = require("../createNotificationPlatform");
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
const ntfy = exports.ntfy = (0, _createNotificationPlatform.createNotificationPlatform)({
  name: 'ntfy',
  credentialNames: ['topic', 'url', 'priority'],
  sendFunction: async args => {
    const {
      credentials,
      content
    } = args;
    await _axios.default.post(new URL(credentials.topic, credentials.url || 'https://ntfy.sh').href, content.body.plainText, {
      headers: {
        Title: content.title,
        Priority: credentials.priority
      }
    });
  }
});
//# sourceMappingURL=ntfy.js.map