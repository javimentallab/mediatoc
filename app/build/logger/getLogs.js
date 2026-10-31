"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.getLogs = void 0;
var _fsExtra = require("fs-extra");
var _lodash = _interopRequireDefault(require("lodash"));
var _path = _interopRequireDefault(require("path"));
var _config = require("../config");
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
const getLogs = async args => {
  var _await$Promise$all, _await$readdir;
  const {
    levels,
    count,
    from
  } = _lodash.default.merge({
    count: 100,
    levels: {
      error: true,
      warn: true,
      info: true,
      debug: true,
      http: true
    }
  }, args);
  const logs = (_await$Promise$all = await Promise.all((_await$readdir = await (0, _fsExtra.readdir)(_config.Config.LOGS_PATH)) === null || _await$readdir === void 0 || (_await$readdir = _await$readdir.filter(filename => filename.match(/(debug|http)\d*.log/))) === null || _await$readdir === void 0 || (_await$readdir = _await$readdir.sort()) === null || _await$readdir === void 0 || (_await$readdir = _await$readdir.map(filename => _path.default.join(_config.Config.LOGS_PATH, filename))) === null || _await$readdir === void 0 ? void 0 : _await$readdir.map(filename => (0, _fsExtra.readFile)(filename, 'utf8')))) === null || _await$Promise$all === void 0 || (_await$Promise$all = _await$Promise$all.flatMap(logContent => {
    var _logContent$split;
    return logContent === null || logContent === void 0 || (_logContent$split = logContent.split('\n')) === null || _logContent$split === void 0 || (_logContent$split = _logContent$split.map(line => line.trim())) === null || _logContent$split === void 0 || (_logContent$split = _logContent$split.filter(line => line.length > 0)) === null || _logContent$split === void 0 || (_logContent$split = _logContent$split.map(line => JSON.parse(line))) === null || _logContent$split === void 0 || (_logContent$split = _logContent$split.filter(log => _lodash.default.get(levels, log.level) === true)) === null || _logContent$split === void 0 ? void 0 : _logContent$split.reverse();
  })) === null || _await$Promise$all === void 0 ? void 0 : _await$Promise$all.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  if (from) {
    const start = logs.findIndex(log => log.id === from);
    if (start !== -1) {
      return logs === null || logs === void 0 ? void 0 : logs.slice(start + 1, start + 1 + count);
    } else {
      return [];
    }
  }
  return logs === null || logs === void 0 ? void 0 : logs.slice(0, 0 + count);
};
exports.getLogs = getLogs;
//# sourceMappingURL=getLogs.js.map