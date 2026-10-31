"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.ConfigurationController = void 0;
var _lodash = _interopRequireDefault(require("lodash"));
var _typescriptRoutesToOpenapiServer = require("typescript-routes-to-openapi-server");
var _auth = require("../auth");
var _globalSettings = require("../repository/globalSettings");
var _user = require("../repository/user");
var _config = require("../config");
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
/**
 * @openapi_tags Configuration
 */
class ConfigurationController {
  /**
   * @openapi_operationId update
   */
  update = (0, _typescriptRoutesToOpenapiServer.createExpressRoute)(_auth.onlyForAdmin, async (req, res) => {
    await _globalSettings.configurationRepository.update(req.body);
    res.send();
  });

  /**
   * @openapi_operationId get
   */
  get = (0, _typescriptRoutesToOpenapiServer.createExpressRoute)(async (req, res) => {
    /* CONFIG_SECRETS_REDACT_V1 */
    const configuration = await _globalSettings.configurationRepository.get();
    const numberOfUsers = await _user.userRepository.count();
    const _isAuthed = !!Number(req.user);
    const _dropForAnon = ['igdbClientSecret', 'igdbClientId'];
    const _cfgOmit = ['id'].concat(_isAuthed ? [] : _dropForAnon);
    res.send({
      ..._lodash.default.omit(configuration, _cfgOmit),
      noUsers: numberOfUsers === 0,
      demo: _config.Config.DEMO,
      version: _config.Config.version
    });
  });
}
exports.ConfigurationController = ConfigurationController;
//# sourceMappingURL=configuration.js.map