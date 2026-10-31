"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.Pushbullet = void 0;
var _axios = _interopRequireDefault(require("axios"));
var _createNotificationPlatform = require("../createNotificationPlatform");
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
const Pushbullet = exports.Pushbullet = (0, _createNotificationPlatform.createNotificationPlatform)({
  name: 'Pushbullet',
  credentialName: 'token',
  sendFunction: async args => {
    const {
      credentials,
      content
    } = args;
    await _axios.default.post('https://api.pushbullet.com/v2/pushes', {
      body: content.body.plainText,
      title: content.title,
      type: 'note'
    }, {
      headers: {
        'Access-Token': credentials.token
      }
    });
  }
});
//# sourceMappingURL=pushbullet.js.map