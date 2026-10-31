"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.requireUserAuthentication = exports.onlyForAdmin = exports.localAuthentication = void 0;
var _passport = _interopRequireDefault(require("passport"));
var _passportLocal = _interopRequireDefault(require("passport-local"));
var _user = require("./repository/user");
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
const LocalStrategy = _passportLocal.default.Strategy;
const requireUserAuthentication = (req, res, next) => {
  if (!req.isAuthenticated()) {
    res.redirect(401, '/#login');
  } else {
    next();
  }
};
exports.requireUserAuthentication = requireUserAuthentication;
const onlyForAdmin = async (req, res, next) => {
  if (typeof req.user !== 'number') {
    res.status(401).send();
  } else {
    const user = await _user.userRepository.findOne({
      id: req.user
    });
    if (!user.admin) {
      res.status(401).send();
    } else {
      next();
    }
  }
};
exports.onlyForAdmin = onlyForAdmin;
_passport.default.serializeUser(function (user, done) {
  done(null, user);
});
_passport.default.deserializeUser((id, done) => {
  try {
    const user = id;
    if (!user) {
      return done(null, null);
    }
    return done(null, user);
  } catch (error) {
    return done(error, null);
  }
});
_passport.default.use(new LocalStrategy({
  usernameField: 'username',
  passwordField: 'password'
}, async (username, password, done) => {
  try {
    const user = await _user.userRepository.findOneWithPassword({
      name: username
    });
    if (user) {
      if (await _user.userRepository.verifyPassword(user, password)) {
        return done(null, user.id);
      }
    }
    return done(null, false, {
      message: 'Incorrect username or password'
    });
  } catch (error) {
    return done(error);
  }
}));
const localAuthentication = exports.localAuthentication = _passport.default.authenticate('local');
//# sourceMappingURL=auth.js.map