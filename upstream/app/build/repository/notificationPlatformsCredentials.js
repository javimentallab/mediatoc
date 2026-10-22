"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.notificationPlatformsCredentialsRepository = void 0;
var _lodash = _interopRequireDefault(require("lodash"));
var _repository = require("./repository");
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
class NotificationPlatformsCredentialsRepository extends (0, _repository.repository)({
  tableName: 'notificationPlatformsCredentials',
  primaryColumnName: 'id'
}) {
  async get(userId) {
    const credentials = await this.find({
      userId: userId
    });
    return (0, _lodash.default)(credentials).groupBy(value => value.platformName).mapValues(value => (0, _lodash.default)(value).keyBy(value => value.name).mapValues(value => value.value).value()).value();
  }
}
const notificationPlatformsCredentialsRepository = exports.notificationPlatformsCredentialsRepository = new NotificationPlatformsCredentialsRepository();
//# sourceMappingURL=notificationPlatformsCredentials.js.map