"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.Notifications = void 0;
var _core = require("@lingui/core");
var _lodash = _interopRequireDefault(require("lodash"));
var _gotify = require("./platforms/gotify");
var _discord = require("./platforms/discord");
var _ntfy = require("./platforms/ntfy");
var _pushbullet = require("./platforms/pushbullet");
var _pushover = require("./platforms/pushover");
var _pushsafer = require("./platforms/pushsafer");
var _notificationPlatformsCredentials = require("../repository/notificationPlatformsCredentials");
var _user = require("../repository/user");
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
const platforms = [_gotify.gotify, _discord.Discord, _pushbullet.Pushbullet, _pushover.Pushover, _pushsafer.Pushsafer, _ntfy.ntfy];
class Notifications {
  static platformsByName = _lodash.default.keyBy(platforms, platform => platform.name);
  static send = async args => {
    const {
      userId,
      message
    } = args;
    const user = await _user.userRepository.findOne({
      id: userId
    });
    if (!user.notificationPlatform) {
      return;
    }
    const credentials = await _notificationPlatformsCredentials.notificationPlatformsCredentialsRepository.get(userId);
    const platform = this.platformsByName[user.notificationPlatform];
    if (!platform) {
      throw new Error(/*i18n*/_core.i18n._("Platform {0} does not exist", {
        0: user.notificationPlatform
      }));
    }
    await this.sendNotification(user.notificationPlatform, {
      message: message,
      credentials: credentials[user.notificationPlatform]
    });
  };
  static sendNotification = async (platformName, args) => {
    const platform = this.platformsByName[platformName];
    if (!platform) {
      throw new Error(/*i18n*/_core.i18n._("Platform {platformName} does not exist", {
        platformName: platformName
      }));
    }
    await platform.sendFunction({
      content: {
        title: 'MediaTracker',
        body: args.message
      },
      credentials: args.credentials
    });
  };
}
exports.Notifications = Notifications;
//# sourceMappingURL=notifications.js.map