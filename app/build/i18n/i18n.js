"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.setupI18n = void 0;
var _core = require("@lingui/core");
var plurals = _interopRequireWildcard(require("make-plural/plurals"));
var _logger = require("../logger");
var _globalSettings = require("../repository/globalSettings");
var _translation = require("./locales/da/translation");
var _translation2 = require("./locales/de/translation");
var _translation3 = require("./locales/en/translation");
var _translation4 = require("./locales/es/translation");
var _translation5 = require("./locales/fr/translation");
var _translation6 = require("./locales/ko/translation");
var _translation7 = require("./locales/pt/translation");
function _getRequireWildcardCache(e) { if ("function" != typeof WeakMap) return null; var r = new WeakMap(), t = new WeakMap(); return (_getRequireWildcardCache = function (e) { return e ? t : r; })(e); }
function _interopRequireWildcard(e, r) { if (!r && e && e.__esModule) return e; if (null === e || "object" != typeof e && "function" != typeof e) return { default: e }; var t = _getRequireWildcardCache(r); if (t && t.has(e)) return t.get(e); var n = { __proto__: null }, a = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var u in e) if ("default" !== u && {}.hasOwnProperty.call(e, u)) { var i = a ? Object.getOwnPropertyDescriptor(e, u) : null; i && (i.get || i.set) ? Object.defineProperty(n, u, i) : n[u] = e[u]; } return n.default = e, t && t.set(e, n), n; }
const setupI18n = locale => {
  _core.i18n.loadLocaleData({
    da: {
      plurals: plurals.da
    },
    de: {
      plurals: plurals.de
    },
    en: {
      plurals: plurals.en
    },
    es: {
      plurals: plurals.es
    },
    fr: {
      plurals: plurals.fr
    },
    pt: {
      plurals: plurals.pt
    },
    ko: {
      plurals: plurals.ko
    }
  });
  _core.i18n.load({
    da: _translation.messages,
    de: _translation2.messages,
    en: _translation3.messages,
    es: _translation4.messages,
    fr: _translation5.messages,
    pt: _translation7.messages,
    ko: _translation6.messages
  });
  _core.i18n.activate(locale);
  _globalSettings.GlobalConfiguration.subscribe('serverLang', lng => {
    if (_core.i18n.locale === lng || !lng) {
      return;
    }
    _logger.logger.info(/*i18n*/_core.i18n._("Changing server language to {lng}", {
      lng: lng
    }));
    _core.i18n.activate(lng);
  });
};
exports.setupI18n = setupI18n;
//# sourceMappingURL=i18n.js.map