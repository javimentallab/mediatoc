"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.stackErrorFormatter = exports.logger = void 0;
var _path = _interopRequireDefault(require("path"));
var _winston = require("winston");
var _config = require("./config");
var _formatters = require("./logger/formatters");
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
const fileTransport = filename => {
  return new _winston.transports.File({
    filename: filename,
    maxsize: 100000,
    maxFiles: 10,
    tailable: true,
    format: _winston.format.combine(_winston.format.uncolorize(), _winston.format.json()),
    eol: '\n',
    silent: _config.Config.NODE_ENV === 'test'
  });
};
const stackErrorFormatter = exports.stackErrorFormatter = (0, _winston.format)(info => {
  if ('stack' in info) {
    info.message = info.stack;
  }
  return info;
});
class logger {
  static init() {
    const formats = _winston.format.combine((0, _formatters.logWithId)(), _winston.format.errors({
      stack: true
    }), _winston.format.colorize(), _winston.format.timestamp(), _winston.format.prettyPrint());
    this.httpLogger = (0, _winston.createLogger)({
      level: 'http',
      format: formats,
      levels: {
        http: 3
      },
      transports: [fileTransport(_path.default.join(_config.Config.LOGS_PATH, 'http.log'))]
    });
    this.debugLogger = (0, _winston.createLogger)({
      level: 'debug',
      format: formats,
      levels: {
        error: 0,
        warn: 1,
        info: 2,
        debug: 5
      },
      transports: [new _winston.transports.Console({
        handleExceptions: true,
        format: _winston.format.combine(stackErrorFormatter(), (0, _formatters.validationErrorLogFormatter)(), (0, _formatters.httpLogFormatter)(), _winston.format.cli({
          all: true,
          message: true,
          levels: {
            error: 5,
            warn: 4,
            info: 4,
            http: 4,
            debug: 5
          }
        })),
        silent: _config.Config.NODE_ENV === 'test'
      }), fileTransport(_path.default.join(_config.Config.LOGS_PATH, 'debug.log'))]
    });
    (0, _config.configMigrationLogs)().forEach(this.debugLogger.info);
  }
  static http(msg) {
    var _this$httpLogger;
    (_this$httpLogger = this.httpLogger) === null || _this$httpLogger === void 0 || _this$httpLogger.http('', msg);
  }
  static error = msg => {
    var _this$debugLogger;
    return (_this$debugLogger = this.debugLogger) === null || _this$debugLogger === void 0 ? void 0 : _this$debugLogger.error(msg);
  };
  static warn = msg => {
    var _this$debugLogger2;
    return (_this$debugLogger2 = this.debugLogger) === null || _this$debugLogger2 === void 0 ? void 0 : _this$debugLogger2.warn(msg);
  };
  static info = msg => {
    var _this$debugLogger3;
    return (_this$debugLogger3 = this.debugLogger) === null || _this$debugLogger3 === void 0 ? void 0 : _this$debugLogger3.info(msg);
  };
  static debug = msg => {
    var _this$debugLogger4;
    return (_this$debugLogger4 = this.debugLogger) === null || _this$debugLogger4 === void 0 ? void 0 : _this$debugLogger4.debug(msg);
  };
}
exports.logger = logger;
//# sourceMappingURL=logger.js.map