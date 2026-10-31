"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.Pushsafer = void 0;
var _axios = _interopRequireDefault(require("axios"));
var _createNotificationPlatform = require("../createNotificationPlatform");
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
const Pushsafer = exports.Pushsafer = (0, _createNotificationPlatform.createNotificationPlatform)({
  name: 'Pushsafer',
  credentialName: 'key',
  sendFunction: async args => {
    const {
      credentials,
      content
    } = args;
    const params = new URLSearchParams({
      k: credentials.key,
      m: content.body.BBCode,
      t: content.title
    });
    await _axios.default.post('https://www.pushsafer.com/api', params);
  }
});
//# sourceMappingURL=pushsafer.js.map