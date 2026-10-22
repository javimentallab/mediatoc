"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.httpLogMiddleware = void 0;
var _logger = require("../logger");
const httpLogMiddleware = (req, res, next) => {
  const start = new Date().getTime();
  res.once('finish', () => _logger.logger.http({
    ip: req.ip,
    method: req.method,
    url: req.url,
    httpVersion: req.httpVersion,
    statusCode: res.statusCode,
    responseSize: Number(res.getHeader('content-length')),
    type: 'http',
    duration: new Date().getTime() - start
  }));
  next();
};
exports.httpLogMiddleware = httpLogMiddleware;
//# sourceMappingURL=httpLogMiddleware.js.map