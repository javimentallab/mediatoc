"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.UsersController = void 0;
var _core = require("@lingui/core");
var _lodash = _interopRequireDefault(require("lodash"));
var _user = require("../entity/user");
var _user2 = require("../repository/user");
var _notifications = require("../notifications/notifications");
var _typescriptRoutesToOpenapiServer = require("typescript-routes-to-openapi-server");
var _auth = require("../auth");
var _notificationPlatformsCredentials = require("../repository/notificationPlatformsCredentials");
var _globalSettings = require("../repository/globalSettings");
var _requestError = require("../requestError");
var _config = require("../config");
var _notificationFormatter = require("../notifications/notificationFormatter");
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
/**
 * @openapi_tags User
 */
class UsersController {
  /**
   * @openapi_operationId get
   */
  get = (0, _typescriptRoutesToOpenapiServer.createExpressRoute)(async (req, res) => {
    if (typeof req.user === 'number') {
      const user = await _user2.userRepository.findOne({
        id: req.user
      });
      res.send(user);
    } else {
      res.send(null);
    }
  });

  /**
   * @openapi_operationId logout
   */
  logout = (0, _typescriptRoutesToOpenapiServer.createExpressRoute)(async (req, res, next) => {
    req.logout(err => {
      if (err) {
        return next(err);
      }
      res.redirect('/');
    });
  });

  /**
   * @openapi_operationId login
   */
  login = (0, _typescriptRoutesToOpenapiServer.createExpressRoute)(_auth.localAuthentication, async (req, res) => {
    const user = await _user2.userRepository.findOne({
      id: Number(req.user)
    });
    res.send(user);
  });

  /**
   * @openapi_operationId register
   */
  register = (0, _typescriptRoutesToOpenapiServer.createExpressRoute)(async (req, res, next) => {
    if (_config.Config.DEMO) {
      res.sendStatus(401);
      return;
    }
    const configuration = await _globalSettings.configurationRepository.get();
    const usersCount = await _user2.userRepository.count();
    if (usersCount > 0 && !configuration.enableRegistration) {
      res.sendStatus(401);
      return;
    }
    const {
      username,
      password,
      confirmPassword
    } = req.body;
    const user = await _user2.userRepository.findOne({
      name: username
    });
    if (user) {
      res.send((0, _requestError.toRequestErrorObject)(/*i18n*/_core.i18n._("User already exists")));
      return;
    }
    if (password !== confirmPassword) {
      res.send((0, _requestError.toRequestErrorObject)(/*i18n*/_core.i18n._("Passwords do not match")));
      return;
    }
    if (password.trim().length === 0) {
      res.send((0, _requestError.toRequestErrorObject)(/*i18n*/_core.i18n._("Password cannot be empty")));
      return;
    }
    if (username.trim().length === 0) {
      res.send((0, _requestError.toRequestErrorObject)(/*i18n*/_core.i18n._("Username cannot be empty")));
      return;
    }
    await _user2.userRepository.create({
      name: username,
      password: password,
      admin: usersCount === 0
    });
    next();
  }, _auth.localAuthentication, async (req, res) => {
    const user = await _user2.userRepository.findOne({
      id: Number(req.user)
    });
    res.send(user);
  });

  /**
   * @openapi_operationId getNotificationCredentials
   */
  getNotificationCredentials = (0, _typescriptRoutesToOpenapiServer.createExpressRoute)(async (req, res) => {
    const userId = Number(req.user);
    const credentials = await _notificationPlatformsCredentials.notificationPlatformsCredentialsRepository.get(userId);
    res.send(credentials);
  });

  /**
   * @openapi_operationId updateNotificationCredentials
   */
  updateNotificationCredentials = (0, _typescriptRoutesToOpenapiServer.createExpressRoute)(async (req, res) => {
    const userId = Number(req.user);
    const {
      platformName,
      credentials
    } = req.body;
    try {
      await _notifications.Notifications.sendNotification(platformName, {
        message: (0, _notificationFormatter.formatNotification)(() => /*i18n*/_core.i18n._("Test message")),
        credentials: credentials
      });
    } catch (error) {
      res.status(400);
      res.send(error.toString());
      return;
    }
    await _notificationPlatformsCredentials.notificationPlatformsCredentialsRepository.delete({
      platformName: platformName,
      userId: userId
    });
    await _notificationPlatformsCredentials.notificationPlatformsCredentialsRepository.createMany(Object.entries(credentials).map(([key, value]) => ({
      platformName: platformName,
      name: key,
      value: value.toString(),
      userId: userId
    })));
    res.sendStatus(200);
  });

  /**
   * @openapi_operationId update
   */
  update = (0, _typescriptRoutesToOpenapiServer.createExpressRoute)(async (req, res) => {
    const userId = Number(req.user);
    const newUserSettings = _lodash.default.pick(req.body, _user.userNonSensitiveColumns);
    await _user2.userRepository.update({
      id: userId,
      ...newUserSettings
    });
    res.sendStatus(200);
  });

  /**
   * @openapi_operationId updatePassword
   */
  updatePassword = (0, _typescriptRoutesToOpenapiServer.createExpressRoute)(async (req, res) => {
    if (_config.Config.DEMO) {
      res.sendStatus(403);
      return;
    }
    const userId = Number(req.user);
    const {
      currentPassword,
      newPassword
    } = req.body;
    if (newPassword.trim().length === 0) {
      res.sendStatus(400);
      return;
    }
    const user = await _user2.userRepository.findOneWithPassword({
      id: userId
    });
    if (!(await _user2.userRepository.verifyPassword(user, currentPassword))) {
      res.sendStatus(401);
      return;
    }
    await _user2.userRepository.update({
      id: user.id,
      password: newPassword
    });
    res.sendStatus(200);
  });

  /**
   * @openapi_operationId getById
   */
  getById = (0, _typescriptRoutesToOpenapiServer.createExpressRoute)(async (req, res) => {
    const {
      userId
    } = req.params;
    const user = await _user2.userRepository.findOne({
      id: userId
    });
    if (user) {
      res.send(_lodash.default.pick(user, ['id', 'name']));
    } else {
      res.send(null);
    }
  });
}
exports.UsersController = UsersController;
//# sourceMappingURL=users.js.map