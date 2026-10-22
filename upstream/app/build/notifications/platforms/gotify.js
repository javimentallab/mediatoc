"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.gotify = void 0;
var _axios = _interopRequireDefault(require("axios"));
var _createNotificationPlatform = require("../createNotificationPlatform");
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
const gotify = exports.gotify = (0, _createNotificationPlatform.createNotificationPlatform)({
  name: 'gotify',
  credentialNames: ['url', 'token', 'priority'],
  sendFunction: async args => {
    const {
      credentials,
      content
    } = args;
    await _axios.default.post(new URL('/message', credentials.url).href, {
      extras: {
        'client::display': {
          contentType: 'text/markdown'
        }
      },
      priority: Number(credentials.priority) || 5,
      message: content.body.markdown,
      title: content.title
    }, {
      headers: {
        'X-Gotify-Key': credentials.token
      }
    });
  }
});
//# sourceMappingURL=gotify.js.map