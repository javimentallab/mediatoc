"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.validationErrorLogFormatter = exports.logWithId = exports.httpLogFormatter = void 0;
var _chalk = _interopRequireDefault(require("chalk"));
var _nanoid = require("nanoid");
var _winston = require("winston");
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
const logWithId = exports.logWithId = (0, _winston.format)(info => {
  info.id = (0, _nanoid.nanoid)(36);
  return info;
});
const validationErrorLogFormatter = exports.validationErrorLogFormatter = (0, _winston.format)(info => {
  if ('type' in info && info.type === 'validationError') {
    const body = info.body && Object.keys(info.body).length > 0 ? JSON.stringify(info.body) : '';
    info.message = `${_chalk.default.red('ValidationError')} ${_chalk.default.yellow(`${info.method} ${info.url} ${body}`)} ${info.error}`;
  }
  return info;
});
const httpLogFormatter = exports.httpLogFormatter = (0, _winston.format)(info => {
  if ('type' in info && info.type === 'http') {
    info.message = `${info.ip} "${_chalk.default.magenta(`${info.method} ${info.url} HTTP/${info.httpVersion}`)}" ${info.statusCode} ${info.responseSize} ${_chalk.default.blue(`${info.duration}ms`)}`;
  }
  return info;
});
//# sourceMappingURL=formatters.js.map